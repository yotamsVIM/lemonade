# Lemonade AI-EHR Integration

Automated AI-EHR data extraction pipeline using "Database as State" architecture.

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- pnpm (installed via devcontainer)

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
   # Edit .env and add your GEMINI_API_KEY
   ```

4. **Run development server:**
   ```bash
   pnpm dev
   ```

5. **Run tests:**
   ```bash
   pnpm test
   ```

## Project Structure

```
lemonade/
├── src/
│   ├── backend/          # Express API & MongoDB
│   ├── miner/            # Chrome extension (Phase 2)
│   ├── oracle/           # Semantic analysis service (Phase 3)
│   ├── forge/            # Code generation service (Phase 4)
│   └── runtime/          # Browser runtime utilities (Phase 4)
├── tests/
│   └── backend.spec.ts   # Phase 1 integration tests
├── docker-compose.yml    # MongoDB container
└── package.json
```

## Current Status
✅ Phase 1 structure complete
✅ Ready for MongoDB connection after container rebuild
