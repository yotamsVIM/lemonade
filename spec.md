# SPEC.md: Automated AI-EHR Integration (Full Stack Platform)

## 1. Project Goal

Build a scalable, containerized pipeline for autonomous EHR data extraction.
**Core Philosophy:** "The Database is the State." All phases (Miner, Oracle, Forge) communicate exclusively by reading/writing to MongoDB.
**Development Rule:** Strict TDD. No implementation without a failing integration test first.

## 2. Infrastructure & Stack

* **Containerization:** Docker & Docker Compose (Essential for reproducible testing).
* **Database:** MongoDB (Running in Docker).
* **Backend:** Node.js (Express + Mongoose).
* **Browser Engine:** Playwright (Headless).
* **LLM:** Gemini 3 Pro (gemini-3-pro-preview).

---

## 3. Architecture: The Data Pipeline

### Module A: The Miner (Chrome Extension)

* **Role:** The Edge Agent.
* **Action:** Captures the DOM (recursively flattening Shadow DOMs and Iframes) and `POST`s it to the Backend.
* **Output:** Creates a `Snapshot` record.

### Module B: The Vault (Backend API)

* **Role:** The Brain & Storage.
* **Schema (`Snapshot`):**
* `htmlBlob`: String (The raw 5MB+ DOM).
* `groundTruth`: JSON (From Oracle).
* `extractorCode`: String (From Forge).
* `logs`: Array `[{ phase: 'FORGE', level: 'ERROR', msg: '...' }]`.
* `status`: `'NEW' | 'ANNOTATED' | 'EXTRACTED' | 'VERIFIED'`.



### Module C: The Oracle (Analysis Service)

* **Role:** The Analyst.
* **Trigger:** Polls DB for `status: 'NEW'`.
* **Action:** Distills HTML → Asks Gemini "Where is the data?" → Updates DB.

### Module D: The Forge (Engineering Service)

* **Role:** The Developer.
* **Trigger:** Polls DB for `status: 'ANNOTATED'`.
* **Action:** Generates code → **Runs The Gauntlet** (Test) → Updates DB.
* **Self-Correction:** If The Gauntlet fails, it reads the error log, re-prompts Gemini, and updates the DB with the new attempt.

---

## 4. Implementation Phasing (The Gates)

### 🚧 Phase 1: Infrastructure & The Vault (Backend)

**Context & Strategy:**

> EHR pages are famously bloated. A single patient encounter page can be 5-10MB of HTML string data. If we use standard API defaults (typically 1MB limits), our ingestion will fail silently or crash. Furthermore, we are building a "State Machine" in the database (`NEW` -> `ANNOTATED` -> `VERIFIED`). If the DB schema isn't robust enough to handle the lifecycle logs and large blobs, the whole pipeline crumbles.
> * **Why Docker?** We need to spin up a "clean room" database for every test run to ensure our tests aren't flaky.
> 
> 

**Goal:** A Dockerized API capable of ingesting massive EHR DOMs.
**Deliverables:** `docker-compose.yml`, `src/backend/`, `tests/backend/`.

**Requirements:**

1. **Docker:** MongoDB container + Node API container.
2. **API:** `POST /snapshots` (Must handle bodies >10MB).
3. **Persistence:** Mongoose model `Snapshot`.

**🛡️ The Gate (Test First):**

* **Test:** `tests/backend.spec.ts` (Supertest).
* Spin up the Docker Compose stack.
* Generate a **10MB dummy string** (simulating a bloated EHR page).
* POST it to the API.
* Fetch it back by ID.
* **ASSERT:** The returned string is identical (checking for BSON size limit truncation).

---

### 🚧 Phase 2: The Miner (Capture)

**Context & Strategy:**

> EHR vendors (Epic, Cerner) aggressively use **Shadow DOMs** to encapsulate styles and **Iframes** to load legacy modules. Standard tools like `document.documentElement.outerHTML` act like a surface-level scan—they miss the deep data hidden in these pockets.
> * **The Challenge:** We cannot just "capture the page." We must "reconstruct the page."
> * **The Solution:** We need a custom serializer that walks the tree. If it sees a Shadow Root, it "pops it open" and writes it as a `<template>` tag. If it sees an iframe, it dives in (security permitting) and grabs that content too. We are essentially flattening a 3D structure into a 2D file for the AI to read.
> 
> 

**Goal:** The Chrome Extension that feeds the Vault.
**Deliverables:** `src/miner/` (Manifest V3).

**Requirements:**

1. **Recursive Flattener:** The logic to expand `shadowRoot` into `<template>` tags.
2. **Iframe Stitching:** Child frames serialize themselves → Parent frame replaces `<iframe>` tag with content.
3. **Network:** The extension must successfully Auth & POST to `http://localhost:3000`.

**🛡️ The Gate (Test First):**

* **Test:** `tests/miner.spec.ts` (Playwright).
* Start the Backend API.
* Load the Extension into Playwright.
* Navigate to `tests/fixtures/complex_shadow_dom.html` (A mock page you create with hidden text inside a shadow root).
* Click "Capture".
* **ASSERT:** Query MongoDB. A new Snapshot exists containing text that was *hidden* inside the shadow DOM of the fixture.

---

### 🚧 Phase 3: The Oracle (Analysis)

**Context & Strategy:**

> LLMs have limited context windows (even Gemini Pro 1.5 has limits or cost implications). Sending 10MB of raw HTML with thousands of SVG icons, script tags, and base64 images is wasteful and confuses the model.
> * **The Filter:** We need a "Distillation Layer" that acts like a noise-canceling headphone for the AI. It removes everything that isn't structure or text.
> * **The Hand-off:** This phase isn't about writing code; it's about establishing **Ground Truth**. If the Oracle hallucinates here, the Forge will build a perfect tool for the wrong data.
> 
> 

**Goal:** Semantic Analysis.
**Deliverables:** `src/oracle/`.

**Requirements:**

1. **Distillation:** Strip `<script>`, `<style>`, `<svg>` before sending to LLM.
2. **Integration:** Fetch `NEW` snapshot → Call Gemini → Save `groundTruth`.

**🛡️ The Gate (Test First):**

* **Test:** `tests/oracle.spec.ts`.
* Insert a Snapshot into Mongo.
* Mock the Gemini API response.
* Run the Oracle function.
* **ASSERT:** The Snapshot status is now `ANNOTATED` and `groundTruth` matches the mock.

---

### 🚧 Phase 4: The Forge & Runtime (The Hardest Part)

**Context & Strategy:**

> This is where the magic happens. We are asking an AI to write code that runs inside a hostile environment (a browser content script).
> * **The Constraint:** The AI loves to use modern library features (like Playwright locators) that don't exist in the browser. We must force it to use "Vanilla JS" or provide it with a "Runtime Library" (`EHR_UTILS`) of helper functions (like `queryDeep` for shadow traversal) so it doesn't have to reinvent the wheel every time.
> * **The Loop:** Code rarely works the first time. We need a feedback loop. If the code returns `null` or throws an error, we don't give up. We feed that error back to the AI: "You tried `querySelector('#foo')` but it returned null. Try again."
> 
> 

**Goal:** Code Generation with Self-Correction.
**Deliverables:** `src/forge/`, `src/runtime/ehr-utils.ts`.

**Requirements:**

1. **`EHR_UTILS`:** The runtime library (`queryDeep`, `smarterFrame`) injected into the browser.
2. **The Harness:** A runner that executes the AI's code against the *stored HTML blob*.
3. **The Retry Loop:** If `result !== groundTruth`:
* Log error to DB.
* Re-prompt Gemini with the diff.
* Repeat (Max 3).



**🛡️ The Gate (Test First):**

* **Test:** `tests/forge_retry.spec.ts`.
* **Scenario:** "The stubborn AI."
* Mock Gemini to return **broken code** on Attempt #1 and Attempt #2.
* Mock Gemini to return **working code** on Attempt #3.
* **ASSERT:** The DB shows 2 Error Logs, and the final state is `VERIFIED` with the correct code. (This proves the self-healing loop works).

---

## 5. Instructions for the LLM Coder

Copy/Paste this to start the project:

> "You are the Lead Full-Stack Engineer.
> **Current Objective:** Execute **Phase 1 (Infrastructure & The Vault)**.
> 1. **Repo Setup:** Initialize a Monorepo (Node/TypeScript).
> 2. **Docker:** Create `docker-compose.yml` for MongoDB and the App.
> 3. **Test:** Write `tests/backend.spec.ts`. Crucial: Ensure the API accepts **10MB+ JSON payloads** (to simulate massive EHR pages) without crashing or truncating.
> 4. **Implementation:** Write the Express API and Mongoose Schemas to pass the test.
> 
> 
> **Constraint:** Do not write any Miner or AI code yet. Stop when Phase 1 tests pass."
