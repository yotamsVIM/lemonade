# Implementation Plan: Lemonade AI-EHR Integration

## Overview
This plan implements a TDD-driven, containerized pipeline for autonomous EHR data extraction using the "Database as State" architecture. All phases communicate through MongoDB, ensuring a decoupled, testable system.

**Testing Strategy:**
- **Unit Tests:** Vitest for service logic, utilities, and data transformations
- **Integration Tests:** Playwright for end-to-end pipeline testing and HTML parsing scenarios

---

## Phase 1: Infrastructure & The Vault (Backend)

### Goal
Establish a Dockerized backend API capable of ingesting massive (10MB+) EHR DOM snapshots with full CRUD operations.

### Prerequisites
- Docker & Docker Compose installed
- Node.js 20+ (handled by devcontainer)
- pnpm package manager

### Implementation Steps

#### 1.1 Project Initialization
**Deliverables:**
- `package.json` with dependencies
- `tsconfig.json` for TypeScript configuration
- `.env.example` for environment variables
- Basic project structure

**Dependencies:**
```json
{
  "express": "^4.18.x",
  "mongoose": "^8.x",
  "cors": "^2.8.x",
  "dotenv": "^16.x",
  "express-async-errors": "^3.1.x",

  "devDependencies": {
    "typescript": "^5.x",
    "@types/express": "^4.x",
    "@types/node": "^20.x",
    "vitest": "^1.x",
    "supertest": "^6.x",
    "@types/supertest": "^6.x",
    "playwright": "^1.x",
    "tsx": "^4.x",
    "nodemon": "^3.x"
  }
}
```

**Directory Structure:**
```
/workspaces/lemonade/
├── src/
│   ├── backend/
│   │   ├── server.ts          # Express app entry point
│   │   ├── config/
│   │   │   └── db.ts          # MongoDB connection
│   │   ├── models/
│   │   │   └── Snapshot.ts    # Mongoose schema
│   │   ├── routes/
│   │   │   └── snapshots.ts   # API routes
│   │   └── middleware/
│   │       └── errorHandler.ts # Basic error handling
│   ├── oracle/                 # (Phase 3)
│   ├── forge/                  # (Phase 4)
│   ├── miner/                  # (Phase 2)
│   └── runtime/                # (Phase 4)
├── tests/
│   ├── backend.spec.ts        # Integration tests (Vitest + Supertest)
│   ├── miner.spec.ts          # (Phase 2 - Playwright)
│   ├── oracle.spec.ts         # (Phase 3 - Vitest)
│   └── forge.spec.ts          # (Phase 4 - Playwright)
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

#### 1.2 Docker Configuration
**File: `docker-compose.yml`**
```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    container_name: lemonade-mongo
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_DATABASE: lemonade_dev
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build: .
    container_name: lemonade-api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - MONGODB_URI=mongodb://mongodb:27017/lemonade_dev
      - PORT=3000
    volumes:
      - ./src:/app/src
      - ./tests:/app/tests
    depends_on:
      mongodb:
        condition: service_healthy
    command: npm run dev

volumes:
  mongo_data:
```

**File: `Dockerfile`**
```dockerfile
FROM node:20-bullseye-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install

# Copy source
COPY . .

# Expose port
EXPOSE 3000

CMD ["pnpm", "dev"]
```

#### 1.3 Mongoose Schema (Critical: Handle Large Payloads)
**File: `src/backend/models/Snapshot.ts`**

Key considerations:
- `htmlBlob` must support 10MB+ strings
- Status enum for state machine transitions
- Logs array for debugging pipeline stages
- Timestamps for audit trail

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface ILog {
  phase: 'MINER' | 'ORACLE' | 'FORGE' | 'RUNTIME';
  level: 'INFO' | 'WARN' | 'ERROR';
  msg: string;
  timestamp: Date;
}

export interface ISnapshot extends Document {
  htmlBlob: string;           // The raw DOM (5-10MB+)
  groundTruth?: object;       // From Oracle (semantic analysis)
  extractorCode?: string;     // From Forge (generated JS)
  logs: ILog[];
  status: 'NEW' | 'ANNOTATED' | 'EXTRACTED' | 'VERIFIED';
  createdAt: Date;
  updatedAt: Date;
}

const SnapshotSchema = new Schema<ISnapshot>(
  {
    htmlBlob: {
      type: String,
      required: true,
      // No maxlength - MongoDB supports up to 16MB per document
    },
    groundTruth: {
      type: Schema.Types.Mixed,
      default: null
    },
    extractorCode: {
      type: String,
      default: null
    },
    logs: [{
      phase: {
        type: String,
        enum: ['MINER', 'ORACLE', 'FORGE', 'RUNTIME'],
        required: true
      },
      level: {
        type: String,
        enum: ['INFO', 'WARN', 'ERROR'],
        required: true
      },
      msg: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    }],
    status: {
      type: String,
      enum: ['NEW', 'ANNOTATED', 'EXTRACTED', 'VERIFIED'],
      default: 'NEW'
    }
  },
  { timestamps: true }
);

export const Snapshot = mongoose.model<ISnapshot>('Snapshot', SnapshotSchema);
```

#### 1.4 Express API Configuration
**File: `src/backend/server.ts`**

Critical settings:
- Increase JSON payload limit to 50MB (safety buffer)
- CORS enabled for Chrome extension
- Async error handling

```typescript
import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import { connectDB } from './config/db';
import snapshotRoutes from './routes/snapshots';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3000;

// CRITICAL: Increase payload limit for large DOMs
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS for Chrome Extension
app.use(cors({
  origin: ['chrome-extension://*', 'http://localhost:*'],
  credentials: true
}));

// Routes
app.use('/api/snapshots', snapshotRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Start server
const start = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { app };
```

#### 1.5 API Routes
**File: `src/backend/routes/snapshots.ts`**

```typescript
import { Router } from 'express';
import { Snapshot } from '../models/Snapshot';

const router = Router();

// Create snapshot
router.post('/', async (req, res) => {
  const { htmlBlob } = req.body;

  if (!htmlBlob) {
    return res.status(400).json({ error: 'htmlBlob is required' });
  }

  const snapshot = await Snapshot.create({
    htmlBlob,
    status: 'NEW',
    logs: [{
      phase: 'MINER',
      level: 'INFO',
      msg: 'Snapshot created',
      timestamp: new Date()
    }]
  });

  res.status(201).json({ id: snapshot._id, status: snapshot.status });
});

// Get snapshot by ID
router.get('/:id', async (req, res) => {
  const snapshot = await Snapshot.findById(req.params.id);

  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }

  res.json(snapshot);
});

// Update snapshot (for Oracle/Forge)
router.patch('/:id', async (req, res) => {
  const snapshot = await Snapshot.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }

  res.json(snapshot);
});

// List snapshots (with status filter)
router.get('/', async (req, res) => {
  const { status } = req.query;
  const query = status ? { status } : {};

  const snapshots = await Snapshot.find(query).sort({ createdAt: -1 });
  res.json(snapshots);
});

export default router;
```

#### 1.6 The Gate: Test First (Integration Test)
**File: `tests/backend.spec.ts`**

This test validates the core requirement: handling 10MB+ payloads without truncation.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../src/backend/server';

describe('Phase 1: Backend Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    // Spin up in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should handle 10MB+ HTML blob without truncation', async () => {
    // Generate a 10MB dummy string (simulating bloated EHR page)
    const chunkSize = 1024; // 1KB
    const totalSize = 10 * 1024 * 1024; // 10MB
    const iterations = Math.ceil(totalSize / chunkSize);

    let dummyHTML = '<html><body>';
    for (let i = 0; i < iterations; i++) {
      dummyHTML += `<div id="test-${i}">${'x'.repeat(chunkSize - 30)}</div>`;
    }
    dummyHTML += '</body></html>';

    const originalSize = Buffer.byteLength(dummyHTML, 'utf8');
    console.log(`Generated test HTML: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);

    // POST to API
    const createRes = await request(app)
      .post('/api/snapshots')
      .send({ htmlBlob: dummyHTML })
      .expect(201);

    const { id } = createRes.body;
    expect(id).toBeDefined();

    // Fetch it back
    const getRes = await request(app)
      .get(`/api/snapshots/${id}`)
      .expect(200);

    // CRITICAL ASSERTION: No truncation occurred
    expect(getRes.body.htmlBlob).toBe(dummyHTML);
    expect(Buffer.byteLength(getRes.body.htmlBlob, 'utf8')).toBe(originalSize);
    expect(getRes.body.status).toBe('NEW');
  });

  it('should return 400 if htmlBlob is missing', async () => {
    await request(app)
      .post('/api/snapshots')
      .send({})
      .expect(400);
  });

  it('should filter snapshots by status', async () => {
    // Create snapshots with different statuses
    const snap1 = await request(app)
      .post('/api/snapshots')
      .send({ htmlBlob: '<div>test1</div>' });

    await request(app)
      .patch(`/api/snapshots/${snap1.body.id}`)
      .send({ status: 'ANNOTATED' });

    const snap2 = await request(app)
      .post('/api/snapshots')
      .send({ htmlBlob: '<div>test2</div>' });

    // Query for NEW status
    const newSnaps = await request(app)
      .get('/api/snapshots?status=NEW')
      .expect(200);

    expect(newSnaps.body.length).toBeGreaterThanOrEqual(1);
    expect(newSnaps.body.every(s => s.status === 'NEW')).toBe(true);
  });
});
```

**File: `vitest.config.ts`**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30s for DB operations
  },
});
```

#### 1.7 Supporting Files

**File: `src/backend/config/db.ts`**
```typescript
import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lemonade_dev';
    await mongoose.connect(uri);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
};
```

**File: `src/backend/middleware/errorHandler.ts`**
```typescript
import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
};
```

**File: `.env.example`**
```
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/lemonade_dev
GEMINI_API_KEY=your_api_key_here
```

**File: `tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**File: `package.json` scripts section**
```json
{
  "scripts": {
    "dev": "nodemon --exec tsx src/backend/server.ts",
    "build": "tsc",
    "start": "node dist/backend/server.js",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f"
  }
}
```

### Phase 1 Success Criteria
✅ Docker Compose stack starts without errors
✅ MongoDB container is healthy and accessible
✅ API accepts POST requests with 10MB+ payloads
✅ Test suite passes: `tests/backend.spec.ts`
✅ No truncation of large HTML blobs
✅ Status filtering works correctly

---

## Phase 2: The Miner (Chrome Extension)

### Goal
Build a Chrome Extension (Manifest V3) that recursively flattens Shadow DOMs and Iframes, then POSTs the complete DOM to the backend.

### Context
EHR vendors use Shadow DOMs and Iframes aggressively. Standard DOM serialization misses hidden content. We need a custom recursive serializer.

### Implementation Steps

#### 2.1 Extension Structure
```
src/miner/
├── manifest.json           # Manifest V3 config
├── background.js           # Service worker
├── content.js              # Main capture logic
├── popup/
│   ├── popup.html
│   └── popup.js            # UI for triggering capture
└── utils/
    ├── serializer.ts       # Recursive DOM flattener
    └── iframe-handler.ts   # Iframe content extraction
```

#### 2.2 Key Implementation: Recursive Serializer
**File: `src/miner/utils/serializer.ts`**

Challenges:
1. Shadow DOM content is not included in `outerHTML`
2. Iframes are cross-origin restricted
3. Need to preserve structure for AI analysis

Solution:
- Walk the DOM tree recursively
- Replace Shadow Roots with `<template shadowroot="open">` tags
- Attempt to access iframe content (handle cross-origin gracefully)

```typescript
export function serializeDOM(rootNode: Document | ShadowRoot | HTMLElement): string {
  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_ELEMENT
  );

  let node: Element | null = walker.currentNode as Element;
  let html = '';

  while (node) {
    // Handle Shadow Root
    if (node.shadowRoot) {
      const shadowContent = serializeDOM(node.shadowRoot);
      html += `<template shadowroot="open">${shadowContent}</template>`;
    }

    // Handle Iframe
    if (node.tagName === 'IFRAME') {
      try {
        const iframe = node as HTMLIFrameElement;
        const iframeDoc = iframe.contentDocument;
        if (iframeDoc) {
          const iframeContent = serializeDOM(iframeDoc);
          html += `<iframe data-captured="true">${iframeContent}</iframe>`;
        }
      } catch (e) {
        // Cross-origin iframe - skip
        console.warn('Cross-origin iframe skipped', e);
      }
    }

    node = walker.nextNode() as Element;
  }

  return html || rootNode.toString();
}
```

#### 2.3 Content Script
**File: `src/miner/content.js`**

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CAPTURE') {
    try {
      const serializedDOM = serializeDOM(document);

      // POST to backend
      fetch('http://localhost:3000/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlBlob: serializedDOM })
      })
        .then(res => res.json())
        .then(data => sendResponse({ success: true, id: data.id }))
        .catch(err => sendResponse({ success: false, error: err.message }));

      return true; // Keep channel open for async response
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
});
```

#### 2.4 The Gate: Test First (Playwright)
**File: `tests/miner.spec.ts`**

This test validates shadow DOM flattening works correctly.

```typescript
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import mongoose from 'mongoose';
import { Snapshot } from '../src/backend/models/Snapshot';

test.describe('Phase 2: Miner Integration Tests', () => {
  test.beforeAll(async () => {
    // Connect to test DB
    await mongoose.connect('mongodb://localhost:27017/lemonade_test');
  });

  test.afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('should capture shadow DOM content', async () => {
    // Create fixture with shadow DOM
    const fixturePath = path.join(__dirname, 'fixtures', 'complex_shadow_dom.html');

    // Launch browser with extension
    const extensionPath = path.join(__dirname, '../src/miner');
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    const page = await context.newPage();
    await page.goto(`file://${fixturePath}`);

    // Trigger capture
    await page.evaluate(() => {
      chrome.runtime.sendMessage({ action: 'CAPTURE' });
    });

    // Wait for DB write
    await page.waitForTimeout(2000);

    // Query MongoDB
    const snapshots = await Snapshot.find({}).sort({ createdAt: -1 });
    expect(snapshots.length).toBeGreaterThan(0);

    const latestSnapshot = snapshots[0];

    // CRITICAL: Verify shadow DOM content is present
    expect(latestSnapshot.htmlBlob).toContain('HIDDEN_TEXT_IN_SHADOW');
    expect(latestSnapshot.status).toBe('NEW');

    await context.close();
  });
});
```

**File: `tests/fixtures/complex_shadow_dom.html`**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Shadow DOM Test</title>
</head>
<body>
  <div id="host"></div>
  <script>
    const host = document.getElementById('host');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p>HIDDEN_TEXT_IN_SHADOW</p>';
  </script>
</body>
</html>
```

### Phase 2 Success Criteria
✅ Extension loads in Playwright without errors
✅ Captures standard DOM content
✅ Flattens Shadow DOM into `<template>` tags
✅ Successfully POSTs to backend API
✅ Test finds "HIDDEN_TEXT_IN_SHADOW" in MongoDB

---

## Phase 3: The Oracle (Semantic Analysis)

### Goal
Create a polling service that:
1. Fetches snapshots with `status: 'NEW'`
2. Distills HTML (removes noise)
3. Sends to Gemini 2.0 Flash for semantic analysis
4. Updates DB with `groundTruth` and status `'ANNOTATED'`

### Implementation Steps

#### 3.1 Oracle Service Structure
```
src/oracle/
├── index.ts              # Entry point (polling loop)
├── distiller.ts          # HTML cleanup
├── gemini-client.ts      # LLM API wrapper
└── prompts.ts            # Prompt templates
```

#### 3.2 HTML Distiller
**File: `src/oracle/distiller.ts`**

Goal: Remove everything that isn't structure or text.

```typescript
import { parse } from 'node-html-parser';

export function distillHTML(rawHTML: string): string {
  const root = parse(rawHTML);

  // Remove noise
  root.querySelectorAll('script, style, svg, noscript').forEach(el => el.remove());

  // Remove base64 images
  root.querySelectorAll('img[src^="data:"]').forEach(el => el.remove());

  // Simplify to text + structure
  return root.toString();
}

export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}
```

#### 3.3 Gemini Client
**File: `src/oracle/gemini-client.ts`**

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function analyzeDOM(distilledHTML: string): Promise<object> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

  const prompt = `You are analyzing an EHR (Electronic Health Record) page.
Extract the following data points as JSON:
- patientName
- patientId
- dateOfBirth
- medications (array)
- allergies (array)
- vitals (object with BP, HR, Temp if present)

HTML:
${distilledHTML.slice(0, 100000)} // Limit to ~25k tokens

Return ONLY valid JSON. If a field is not found, use null.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  // Parse JSON response
  return JSON.parse(text);
}
```

#### 3.4 Oracle Loop
**File: `src/oracle/index.ts`**

```typescript
import { Snapshot } from '../backend/models/Snapshot';
import { distillHTML } from './distiller';
import { analyzeDOM } from './gemini-client';

export async function processNextSnapshot(): Promise<boolean> {
  const snapshot = await Snapshot.findOne({ status: 'NEW' });

  if (!snapshot) {
    return false; // No work to do
  }

  try {
    console.log(`🔍 Oracle processing snapshot ${snapshot._id}`);

    const distilled = distillHTML(snapshot.htmlBlob);
    const groundTruth = await analyzeDOM(distilled);

    snapshot.groundTruth = groundTruth;
    snapshot.status = 'ANNOTATED';
    snapshot.logs.push({
      phase: 'ORACLE',
      level: 'INFO',
      msg: 'Ground truth extracted',
      timestamp: new Date()
    });

    await snapshot.save();
    console.log(`✅ Snapshot ${snapshot._id} annotated`);
    return true;
  } catch (error) {
    console.error(`❌ Oracle failed for ${snapshot._id}:`, error);
    snapshot.logs.push({
      phase: 'ORACLE',
      level: 'ERROR',
      msg: error.message,
      timestamp: new Date()
    });
    await snapshot.save();
    return false;
  }
}

// Polling loop
export async function startOracle(intervalMs: number = 5000) {
  console.log('🧙 Oracle service started');
  setInterval(async () => {
    await processNextSnapshot();
  }, intervalMs);
}
```

#### 3.5 The Gate: Test First
**File: `tests/oracle.spec.ts`**

```typescript
import { describe, it, expect, beforeAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Snapshot } from '../src/backend/models/Snapshot';
import { processNextSnapshot } from '../src/oracle';
import * as geminiClient from '../src/oracle/gemini-client';

describe('Phase 3: Oracle Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should process NEW snapshot and set status to ANNOTATED', async () => {
    // Mock Gemini response
    const mockGroundTruth = {
      patientName: 'John Doe',
      patientId: '12345',
      medications: ['Aspirin', 'Lisinopril']
    };

    vi.spyOn(geminiClient, 'analyzeDOM').mockResolvedValue(mockGroundTruth);

    // Insert test snapshot
    const snapshot = await Snapshot.create({
      htmlBlob: '<div>Patient: John Doe</div>',
      status: 'NEW'
    });

    // Run Oracle
    const processed = await processNextSnapshot();

    expect(processed).toBe(true);

    // Verify DB update
    const updated = await Snapshot.findById(snapshot._id);
    expect(updated?.status).toBe('ANNOTATED');
    expect(updated?.groundTruth).toEqual(mockGroundTruth);
    expect(updated?.logs.some(log => log.phase === 'ORACLE')).toBe(true);
  });

  it('should return false if no NEW snapshots exist', async () => {
    const processed = await processNextSnapshot();
    expect(processed).toBe(false);
  });
});
```

### Phase 3 Success Criteria
✅ Oracle service polls MongoDB every 5 seconds
✅ Distiller removes `<script>`, `<style>`, `<svg>` tags
✅ Gemini API integration works (with mocked tests)
✅ Snapshot status transitions: `NEW` → `ANNOTATED`
✅ `groundTruth` field is populated with structured JSON

---

## Phase 4: The Forge & Runtime (Code Generation + Validation)

### Goal
The hardest phase: Generate browser-executable JavaScript that extracts data based on `groundTruth`, run it in a Playwright harness, and self-correct if extraction fails.

### Context
- AI-generated code often uses unavailable APIs (e.g., Playwright locators in browser context)
- Need a runtime library (`EHR_UTILS`) with helpers like `queryDeep` for shadow DOM traversal
- Implement a retry loop with error feedback to Gemini

### Implementation Steps

#### 4.1 Runtime Library
**File: `src/runtime/ehr-utils.ts`**

This library is injected into the browser alongside the AI-generated code.

```typescript
// Browser-safe utilities for EHR extraction

export const EHR_UTILS = {
  /**
   * Query across shadow DOM boundaries
   */
  queryDeep(selector: string, root: Document | Element = document): Element | null {
    let queue: (Document | Element | ShadowRoot)[] = [root];

    while (queue.length) {
      const current = queue.shift()!;

      // Try standard query
      const found = ('querySelector' in current)
        ? current.querySelector(selector)
        : null;

      if (found) return found;

      // Traverse shadow roots
      const elements = ('querySelectorAll' in current)
        ? Array.from(current.querySelectorAll('*'))
        : [];

      for (const el of elements) {
        if (el.shadowRoot) {
          queue.push(el.shadowRoot);
        }
      }
    }

    return null;
  },

  /**
   * Extract text content, handling shadow DOMs
   */
  getTextDeep(element: Element): string {
    let text = element.textContent || '';

    if (element.shadowRoot) {
      text += this.getTextDeep(element.shadowRoot.host);
    }

    return text.trim();
  },

  /**
   * Safe attribute getter
   */
  getAttr(element: Element | null, attr: string): string | null {
    return element?.getAttribute(attr) || null;
  }
};
```

#### 4.2 Forge Service
**File: `src/forge/index.ts`**

```typescript
import { Snapshot } from '../backend/models/Snapshot';
import { generateExtractor } from './code-generator';
import { runGauntlet } from './gauntlet';

const MAX_RETRIES = 3;

export async function processAnnotatedSnapshot(): Promise<boolean> {
  const snapshot = await Snapshot.findOne({ status: 'ANNOTATED' });

  if (!snapshot) return false;

  console.log(`🔨 Forge processing snapshot ${snapshot._id}`);

  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < MAX_RETRIES) {
    attempt++;

    try {
      // Generate code
      const code = await generateExtractor(
        snapshot.htmlBlob,
        snapshot.groundTruth!,
        lastError
      );

      snapshot.extractorCode = code;

      // Run The Gauntlet (validation test)
      const result = await runGauntlet(snapshot.htmlBlob, code);

      if (result.success) {
        snapshot.status = 'VERIFIED';
        snapshot.logs.push({
          phase: 'FORGE',
          level: 'INFO',
          msg: `Code verified on attempt ${attempt}`,
          timestamp: new Date()
        });
        await snapshot.save();
        console.log(`✅ Snapshot ${snapshot._id} verified`);
        return true;
      } else {
        // Gauntlet failed - prepare for retry
        lastError = result.error!;
        snapshot.logs.push({
          phase: 'FORGE',
          level: 'WARN',
          msg: `Attempt ${attempt} failed: ${lastError}`,
          timestamp: new Date()
        });
      }
    } catch (error) {
      lastError = error.message;
      snapshot.logs.push({
        phase: 'FORGE',
        level: 'ERROR',
        msg: error.message,
        timestamp: new Date()
      });
    }
  }

  // All retries exhausted
  snapshot.status = 'EXTRACTED'; // Mark as partially complete
  snapshot.logs.push({
    phase: 'FORGE',
    level: 'ERROR',
    msg: `Failed after ${MAX_RETRIES} attempts`,
    timestamp: new Date()
  });
  await snapshot.save();

  return false;
}
```

#### 4.3 Code Generator
**File: `src/forge/code-generator.ts`**

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateExtractor(
  htmlBlob: string,
  groundTruth: object,
  previousError: string | null = null
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

  let prompt = `You are a code generator for EHR data extraction.

**Context:**
- You must write browser-executable JavaScript (no Node.js APIs)
- You have access to EHR_UTILS (queryDeep, getTextDeep, getAttr)
- The code will run in a Playwright page.evaluate() context

**Task:**
Extract the following data from the HTML:
${JSON.stringify(groundTruth, null, 2)}

**HTML (truncated):**
${htmlBlob.slice(0, 50000)}

**Return a function:**
\`\`\`javascript
function extract() {
  // Your code here using EHR_UTILS
  return {
    patientName: '...',
    patientId: '...',
    // etc
  };
}
\`\`\`
`;

  if (previousError) {
    prompt += `\n\n**PREVIOUS ATTEMPT FAILED:**
${previousError}

Please fix the issue and try again.`;
  }

  const result = await model.generateContent(prompt);
  const code = result.response.text();

  // Extract function from markdown code block
  const match = code.match(/```javascript\n([\s\S]+?)\n```/);
  return match ? match[1] : code;
}
```

#### 4.4 The Gauntlet (Validation Harness)
**File: `src/forge/gauntlet.ts`**

```typescript
import { chromium } from 'playwright';
import { EHR_UTILS } from '../runtime/ehr-utils';

export interface GauntletResult {
  success: boolean;
  extractedData?: object;
  error?: string;
}

export async function runGauntlet(
  htmlBlob: string,
  extractorCode: string
): Promise<GauntletResult> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Create a data URL with the HTML
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(htmlBlob)}`);

    // Inject runtime + extractor
    const result = await page.evaluate((code) => {
      // @ts-ignore - EHR_UTILS is injected
      const EHR_UTILS = window.EHR_UTILS;

      try {
        // eslint-disable-next-line no-eval
        eval(code);
        // @ts-ignore
        return { success: true, data: extract() };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, `${EHR_UTILS.toString()}\n\n${extractorCode}`);

    await browser.close();

    return result.success
      ? { success: true, extractedData: result.data }
      : { success: false, error: result.error };
  } catch (error) {
    await browser.close();
    return { success: false, error: error.message };
  }
}
```

#### 4.5 The Gate: Test First
**File: `tests/forge.spec.ts`**

This test validates the self-correction loop.

```typescript
import { describe, it, expect, beforeAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Snapshot } from '../src/backend/models/Snapshot';
import { processAnnotatedSnapshot } from '../src/forge';
import * as codeGenerator from '../src/forge/code-generator';

describe('Phase 4: Forge Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should retry and eventually succeed (stubborn AI scenario)', async () => {
    // Insert annotated snapshot
    const snapshot = await Snapshot.create({
      htmlBlob: '<div id="patient-name">John Doe</div>',
      groundTruth: { patientName: 'John Doe' },
      status: 'ANNOTATED'
    });

    let callCount = 0;

    // Mock Gemini to fail twice, then succeed
    vi.spyOn(codeGenerator, 'generateExtractor').mockImplementation(async () => {
      callCount++;

      if (callCount === 1) {
        // Broken code (wrong selector)
        return `function extract() {
          return { patientName: document.querySelector('#wrong-id')?.textContent };
        }`;
      }

      if (callCount === 2) {
        // Still broken (syntax error)
        return `function extract() {
          return { patientName: invalid syntax here };
        }`;
      }

      // Finally correct
      return `function extract() {
        return { patientName: document.querySelector('#patient-name')?.textContent };
      }`;
    });

    // Run Forge
    const success = await processAnnotatedSnapshot();

    expect(success).toBe(true);
    expect(callCount).toBe(3);

    // Verify DB state
    const updated = await Snapshot.findById(snapshot._id);
    expect(updated?.status).toBe('VERIFIED');
    expect(updated?.logs.filter(log => log.level === 'WARN').length).toBe(2); // 2 failures
    expect(updated?.logs.some(log => log.msg.includes('verified'))).toBe(true);
  });
});
```

### Phase 4 Success Criteria
✅ Runtime library (`EHR_UTILS`) provides shadow DOM helpers
✅ Forge generates browser-executable code
✅ Gauntlet validates extraction against `groundTruth`
✅ Retry loop activates on failure (max 3 attempts)
✅ Test passes: "stubborn AI" eventually succeeds
✅ Final status: `VERIFIED`

---

## Post-Implementation: Integration & Polish

### 5.1 Orchestrator Service
Once all phases work independently, create an orchestrator to run them concurrently:

**File: `src/orchestrator.ts`**
```typescript
import { startOracle } from './oracle';
import { startForge } from './forge';

async function main() {
  console.log('🚀 Starting Lemonade Pipeline...');

  // Run services in parallel
  await Promise.all([
    startOracle(5000),    // Poll every 5s
    startForge(10000)     // Poll every 10s
  ]);
}

main();
```

### 5.2 Monitoring Dashboard (Optional)
Simple Express endpoint to view pipeline status:

```typescript
app.get('/api/stats', async (req, res) => {
  const stats = {
    new: await Snapshot.countDocuments({ status: 'NEW' }),
    annotated: await Snapshot.countDocuments({ status: 'ANNOTATED' }),
    verified: await Snapshot.countDocuments({ status: 'VERIFIED' })
  };
  res.json(stats);
});
```

---

## Development Workflow

### Daily Development Cycle
1. **Start Infrastructure:**
   ```bash
   docker-compose up -d
   pnpm run dev
   ```

2. **Run Tests:**
   ```bash
   pnpm test                    # All tests
   pnpm test tests/backend.spec.ts  # Specific phase
   ```

3. **Monitor Logs:**
   ```bash
   docker-compose logs -f api
   ```

4. **Database Inspection:**
   ```bash
   mongosh mongodb://localhost:27017/lemonade_dev
   ```

### Debugging Tips
- **Large Payload Issues:** Check Express `limit` settings
- **Shadow DOM Not Captured:** Verify `serializer.ts` walks tree correctly
- **Gemini Timeouts:** Increase timeout, reduce distilled HTML size
- **Playwright Hangs:** Check headless mode, increase timeout values

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| MongoDB 16MB document limit | High | Compress HTML or split into chunks |
| Gemini API rate limits | Medium | Implement exponential backoff |
| Cross-origin iframe blocking | Low | Document limitation, skip gracefully |
| AI-generated code fails repeatedly | High | Manual fallback, improve prompts |
| Shadow DOM serialization edge cases | Medium | Extensive fixture testing |

---

## Success Metrics

### Phase 1
- API handles 10MB+ payloads without errors
- Test suite runs in <30 seconds

### Phase 2
- Extension captures 95%+ of visible content
- Shadow DOM fixture test passes

### Phase 3
- Oracle processes snapshot in <10 seconds
- Gemini returns valid JSON 90%+ of time

### Phase 4
- Forge succeeds on first attempt 70%+ of time
- Retry loop resolves failures within 3 attempts

---

## Next Steps After MVP

1. **Production Hardening:**
   - Add authentication (JWT for API)
   - Implement rate limiting
   - Add structured logging (Winston)

2. **Scalability:**
   - Replace polling with MongoDB Change Streams
   - Add Redis queue for high-throughput scenarios
   - Horizontal scaling with Docker Swarm/K8s

3. **AI Improvements:**
   - Fine-tune prompts based on real EHR data
   - Implement few-shot learning with examples
   - Add confidence scores to extractions

4. **Observability:**
   - Prometheus metrics
   - Grafana dashboards
   - Sentry error tracking

---

## Appendix: Key Commands

```bash
# Setup
pnpm install
cp .env.example .env
# (Add your GEMINI_API_KEY to .env)

# Development
docker-compose up -d              # Start MongoDB + API
pnpm run dev                       # Start API in watch mode
pnpm test                          # Run all tests
pnpm test:watch                    # Watch mode

# Phase-specific tests
pnpm test tests/backend.spec.ts
pnpm test tests/miner.spec.ts
pnpm test tests/oracle.spec.ts
pnpm test tests/forge.spec.ts

# Production
pnpm run build
pnpm start

# Cleanup
docker-compose down -v             # Remove containers + volumes
```

---

## Conclusion

This plan follows strict TDD principles: every phase has a "Gate" test that must pass before moving forward. The architecture is deliberately simple:

- **One database** (MongoDB) as the source of truth
- **Four independent modules** that only communicate via DB reads/writes
- **No complex orchestration** until all phases work independently

**Estimated Implementation Order:**
1. Phase 1: 2-3 days (Foundation)
2. Phase 2: 1-2 days (Extension)
3. Phase 3: 1 day (Oracle)
4. Phase 4: 3-4 days (Most complex)

**Total:** ~7-10 days for a working MVP with all gates passing.
