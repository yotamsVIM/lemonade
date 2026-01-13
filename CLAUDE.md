# Lemonade AI-EHR Integration - Claude Instructions

## CRITICAL: AWS Profile Configuration

**ALWAYS use the `ai-developer` AWS profile when running backend services.**

### Why This Matters
- The backend uses AWS Bedrock for AI extraction (Oracle phase)
- The `ai-developer` profile has `bedrock:InvokeModel` permissions
- The default AWS profile does NOT have these permissions
- Running without the correct profile causes IAM permission errors

### Backend Startup Commands

**Correct way to start backend:**
```bash
# Development
AWS_PROFILE=ai-developer pnpm dev

# Production
AWS_PROFILE=ai-developer pnpm start
```

**Verifying the profile is loaded:**
Check the backend logs for:
```
[AIService] AWS Profile: ai-developer
```

If you see `[AIService] AWS Profile: (default)`, the profile is NOT loaded correctly.

### When Making Changes to Backend

1. **Never restart the backend without `AWS_PROFILE=ai-developer`**
2. **If you kill backend processes, restart with the correct profile**
3. **Verify the profile in logs after every restart**

### Common Mistakes to Avoid

❌ `pnpm dev` (missing AWS_PROFILE)
❌ `nodemon --exec tsx src/backend/server.ts` (missing AWS_PROFILE)
❌ Starting backend from a different terminal without the env var

✅ `AWS_PROFILE=ai-developer pnpm dev`
✅ Check logs show `ai-developer` profile loaded

## Project Architecture

This is a 4-phase EHR data extraction pipeline:

1. **The Miner (Phase 1)** - Chrome extension captures DOM snapshots
2. **The Oracle (Phase 2)** - AI extracts structured data (requires AWS Bedrock)
3. **The Forge (Phase 3)** - Generates JavaScript extraction code
4. **Backend API (Phase 0)** - Express server with MongoDB

## Testing

- Backend tests: `pnpm test` (70 tests)
- Extension tests: `pnpm test:extension` (14 tests)
- Forge tests: `pnpm test:forge` (12 tests)

## Important Files

- `src/backend/services/aiService.ts` - AWS Bedrock integration
- `src/backend/services/extractionWorkflow.ts` - Oracle extraction workflow
- `src/backend/services/taskWorker.ts` - Background AI task processor
- `src/extension/popup.js` - Extension UI and E2E pipeline
- `src/forge/gauntlet.ts` - Code validation harness

## Environment Variables

Required in `.env`:
- `MONGODB_URI` - MongoDB connection string
- `AI_WORKER_ENABLED=true` - Enable background AI worker
- `AWS_PROFILE=ai-developer` - Set in shell, not .env (for security)

## Debugging Oracle Issues

The Oracle phase has comprehensive debug logging:
- `[AIService]` - AWS Bedrock API calls
- `[Workflow]` - Extraction workflow steps
- `[TaskWorker]` - Task processing and routing

If Oracle gets stuck, check logs for:
1. AWS profile loaded correctly
2. Bedrock API errors
3. Workflow step failures
