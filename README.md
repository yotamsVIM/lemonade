# Lemonade AI-EHR Integration

Automated AI-EHR data extraction pipeline using "Database as State" architecture with recursive DOM capture and AI-powered extraction.

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- pnpm
- Chrome browser (for extension testing)

### Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Start MongoDB:**
   ```bash
   docker-compose up -d
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env if you need to override AWS region (defaults to us-east-1)
   # AWS profile ai-developer will be used automatically
   ```

4. **Run development server:**
   ```bash
   pnpm dev
   ```

5. **Run tests:**
   ```bash
   # Backend tests (70 passing)
   pnpm test

   # Extension tests (14 passing)
   pnpm test:extension
   ```

## Project Structure

```
lemonade/
├── src/
│   ├── backend/                    # Express API & MongoDB
│   │   ├── models/                 # Data models (Patient, EHRRecord, AITask, Snapshot)
│   │   ├── routes/                 # REST API endpoints
│   │   └── services/               # AI extraction workflow (Phase 3)
│   ├── extension/                  # Chrome Extension - The Miner (Phase 2)
│   │   ├── manifest.json          # Manifest V3
│   │   ├── popup.{html,js}        # Extension UI with E2E pipeline testing
│   │   ├── content.js             # Recursive DOM capture + code execution
│   │   └── background.js          # Service worker
│   ├── forge/                      # Code Generation - The Forge (Phase 4)
│   │   ├── index.ts               # Main orchestrator with retry loop
│   │   ├── code-generator.ts      # Claude Bedrock code generation
│   │   └── gauntlet.ts            # Playwright validation harness
│   ├── runtime/                    # Browser-safe utilities
│   │   └── ehr-utils.ts           # DOM query helpers (injected with extractors)
│   └── frontend/                   # React UI (patient management)
├── tests/
│   ├── backend/                    # Backend API tests (70 tests)
│   ├── extension/                  # Extension E2E tests (14 tests)
│   ├── forge/                      # Forge unit tests (7 tests)
│   └── fixtures/                   # Test fixtures
├── docker-compose.yml             # MongoDB container
└── package.json
```

## Current Status

### ✅ Phase 1: Core Infrastructure (COMPLETE)
- Backend API with Express + MongoDB
- Patient, EHR Record, AI Task, and Snapshot models
- Full REST API with 20+ endpoints
- **70 passing backend tests**

### ✅ Phase 2: The Miner - Chrome Extension (COMPLETE)
- Manifest V3 Chrome Extension
- **Recursive frame capture** at any depth (iframe + frame elements)
- **Shadow DOM capture** at all levels
- Cross-origin iframe support via postMessage
- Style preservation with computed CSS inlining
- Manual and auto-capture modes
- E2E pipeline testing UI with real-time status
- **14 passing E2E tests with Playwright**

### ✅ Phase 3: The Oracle - AI Extraction (COMPLETE)
- AWS Bedrock with Claude 3.5 Sonnet integration (configurable for Claude 4.5 in prod)
- Extraction workflow (Load → Extract → Analyze → Verify → Save)
- Background task worker with retry logic
- Nested content extraction from iframes and Shadow DOM
- **Successfully extracts patient demographics** from complex EHR systems (Athena Health tested)

### ✅ Phase 4: The Forge - Code Generation & Validation (COMPLETE)
- AI-powered JavaScript extractor generation using Claude Bedrock
- Playwright-based validation harness (The Gauntlet)
- Retry loop with error feedback (up to 3 attempts)
- Performance-optimized prompts (efficient DOM queries)
- Name parsing best practices (handles complex names)
- E2E pipeline testing UI in Chrome Extension
- Real-time status updates and code execution

## Key Features

### Robust DOM Capture
- **Recursive frame traversal**: Captures nested iframes and framesets at ANY depth
- **Shadow DOM extraction**: Serializes all Shadow DOM content as data attributes
- **Cross-origin support**: Uses postMessage for cross-domain iframe content
- **Style preservation**: Inlines computed CSS for visual fidelity
- **Large DOM handling**: Tested with 3.6MB+ EHR pages

### AI-Powered Extraction
- **Intelligent parsing**: Extracts nested iframe and Shadow DOM content
- **Patient demographics**: firstName, lastName, middleName, fullName, DOB, visitDate
- **Clinical data**: medications, vitals, allergies, lab results (when available)
- **Verification**: Multi-stage analysis with confidence scoring

### Production-Ready
- **91 passing tests**: 70 backend + 14 extension + 7 forge tests
- **Retry logic**: Automatic retry with exponential backoff (Oracle + Forge)
- **Validation**: Playwright-based code validation (The Gauntlet)
- **Logging**: Comprehensive logging across all pipeline stages
- **Monitoring**: Worker status API and health checks
- **Performance**: Optimized DOM queries (< 100ms extraction time)

## Usage

### Chrome Extension

1. **Load Extension:**
   ```bash
   # Open Chrome: chrome://extensions/
   # Enable "Developer mode"
   # Click "Load unpacked" → select src/extension/
   ```

2. **Capture EHR Page:**
   - Navigate to an EHR page
   - Click the Lemonade extension icon
   - Click "📸 Capture Current Page"
   - Snapshot automatically queued for AI extraction

3. **Run E2E Pipeline:**
   - Click "🚀 Run E2E Pipeline" in extension popup
   - Watch real-time status: Capture → Oracle → Forge
   - View performance metrics for each stage
   - Test generated extractor code with "▶️ Run Code"

4. **Enable Auto-Capture:**
   - Toggle "Auto-Capture Mode" in extension popup
   - Extension automatically captures page changes
   - Throttled to max 1 capture per 5 seconds

### API Endpoints

```bash
# Health check
curl http://localhost:3000/health

# List snapshots
curl http://localhost:3000/api/snapshots

# Get specific snapshot
curl http://localhost:3000/api/snapshots/{id}

# Worker status
curl http://localhost:3000/api/worker/status

# Start worker
curl -X POST http://localhost:3000/api/worker/start
```

## Testing

### Run All Tests
```bash
pnpm test              # Backend tests
pnpm test:extension    # Extension E2E tests with Playwright
```

### Run Specific Tests
```bash
pnpm test tests/backend.spec.ts           # Backend integration
pnpm test tests/patients.spec.ts          # Patient API
pnpm playwright test -g "should capture"  # Extension capture tests
```

### Test Coverage
- **Backend**: 70 tests covering API, models, and services
- **Extension**: 14 E2E tests covering capture, UI, and integration
- **Forge**: 7 tests covering code generation, validation, and retry logic
- **Total**: 91 tests with 100% pass rate

## Real-World Testing

### Athena Health EHR
**Test Case:** Patient demographics extraction
- **DOM Size:** 2.42 MB
- **Nesting:** iframe → frame → iframe → Shadow DOM (3 levels deep)
- **Result:** ✅ Successfully extracted:
  - firstName: "LOLA"
  - lastName: "MARSH"
  - middleName: "TEST"
  - dateOfBirth: "01/25/1985"
  - visitDate: "April 11, 2025"

### eCW EHR
**Test Case:** Patient search page
- **DOM Size:** 3.61 MB
- **Expected:** No patient data (search page)
- **Status:** Pending API quota

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│           Chrome Extension (The Miner)                   │
│  • Recursive frame/Shadow DOM capture                   │
│  • Cross-origin iframe support                          │
│  • Style preservation                                   │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP POST
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Backend API (Express + MongoDB)             │
│  • Snapshot storage (50MB+ support)                     │
│  • AI task queue with retry                             │
│  • Patient & EHR record management                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│          Background Task Worker (polling)                │
│  • Polls AI task queue every 5s                         │
│  • Processes 1-3 concurrent tasks                       │
│  • Routes to extraction workflow                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│     Extraction Workflow (Phase 3: Oracle)                │
│  1. Load snapshot from MongoDB                          │
│  2. Extract patient data with Claude                    │
│  3. Analyze document type & content                     │
│  4. Verify extraction accuracy                          │
│  5. Save results (Status: ANNOTATED)                    │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│      AI Service (AWS Bedrock - Claude 3.5 Sonnet)       │
│  • Nested content extraction (iframes + Shadow DOM)     │
│  • Patient demographics parsing                         │
│  • Clinical data extraction                             │
│  • Confidence scoring                                   │
└─────────────────────┬───────────────────────────────────┘
                      │ Ground Truth Data
                      ▼
┌─────────────────────────────────────────────────────────┐
│           The Forge (Phase 4: Code Generation)           │
│  1. Generate JavaScript extractor (Claude Bedrock)      │
│  2. Validate with Gauntlet (Playwright)                 │
│  3. Retry with error feedback (3 attempts)              │
│  4. Save verified code (Status: VERIFIED)               │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
         Reusable JavaScript Extractor
         (Fast, deterministic, no AI calls)
```

## Documentation

- [spec.md](spec.md) - Original project specification
- [plan.md](plan.md) - Detailed implementation plan
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) - Development history and deviations
- [CODE_REVIEW.md](CODE_REVIEW.md) - Code quality review and refactoring plan
- [src/extension/README.md](src/extension/README.md) - Chrome Extension documentation
- [src/forge/README.md](src/forge/README.md) - Forge code generation documentation
- [tests/extension/README.md](tests/extension/README.md) - Extension testing guide

## Environment Variables

Required in `.env`:
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/lemonade_dev
TEST_MONGODB_URI=mongodb://localhost:27017/lemonade_test

# API
PORT=3000

# AWS Bedrock (required for extraction)
# AWS_PROFILE=ai-developer is automatically set in dev/start scripts
AWS_REGION=us-east-1

# Worker (Phase 3: Oracle)
AI_WORKER_ENABLED=true
AI_WORKER_POLL_INTERVAL=5000
AI_WORKER_MAX_CONCURRENT=3

# Forge (Phase 4: Code Generation)
FORGE_POLL_INTERVAL=10000
FORGE_MAX_RETRIES=3
```

**Note:** The `pnpm dev` and `pnpm start` commands automatically use the `ai-developer` AWS profile. Ensure this profile is configured in your AWS CLI (`~/.aws/config` and `~/.aws/credentials`).

## Development Commands

```bash
# Start development server with hot reload
pnpm dev

# Start individual services
pnpm dev:backend       # Backend API server
pnpm dev:forge         # Forge code generation service

# Build for production
pnpm build

# Run tests
pnpm test              # Backend tests (70 tests)
pnpm test:extension    # Extension E2E tests (14 tests)
pnpm test:forge        # Forge unit tests (7 tests)
pnpm test:watch        # Watch mode

# Docker commands
pnpm docker:up         # Start MongoDB
pnpm docker:down       # Stop MongoDB
pnpm docker:logs       # View MongoDB logs
```

## Contributing

When contributing, please:
1. Follow the TDD approach - write tests first
2. Use TypeScript strict mode
3. Follow existing code patterns
4. Update documentation for new features
5. Ensure all tests pass before committing

## License

MIT

## Support

For issues and questions:
- Check [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) for known issues
- Review test files for usage examples
- See [spec.md](spec.md) for architecture details
