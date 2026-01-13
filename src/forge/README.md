# The Forge - Code Generation & Validation

Phase 4 of the Lemonade AI-EHR Integration pipeline. The Forge generates deterministic, reusable JavaScript extractors from HTML and ground truth data.

## Overview

**Input:** Snapshots with status `ANNOTATED` (HTML + ground truth from Oracle)
**Output:** Snapshots with status `VERIFIED` (HTML + ground truth + validated extractor code)

**Process:**
1. Poll for `ANNOTATED` snapshots
2. Generate JavaScript extraction code using Claude Bedrock
3. Validate code with the Gauntlet (Playwright test harness)
4. Retry up to 3 times on failure
5. Mark as `VERIFIED` on success or `EXTRACTED` on exhausted retries

## Architecture

```
src/forge/
├── index.ts              # Main orchestrator with retry loop
├── code-generator.ts     # Claude Bedrock code generation
├── gauntlet.ts           # Playwright validation harness
└── README.md             # This file

src/runtime/
└── ehr-utils.ts          # Browser-safe helper library (injected with generated code)
```

## Components

### 1. Runtime Library (`src/runtime/ehr-utils.ts`)

Browser-safe utilities injected alongside AI-generated code:

**Key Methods:**
- `EHR_UTILS.queryDeep(selector)` - Query across shadow DOM boundaries
- `EHR_UTILS.queryAllDeep(selector)` - Get all matching elements
- `EHR_UTILS.getTextDeep(element)` - Extract text from element (handles shadow DOM)
- `EHR_UTILS.getAttr(element, attr)` - Safely get attribute value
- `EHR_UTILS.parseDate(dateStr)` - Parse common date formats
- `EHR_UTILS.extractTableData(table, headers)` - Extract data from tables
- `EHR_UTILS.waitForElement(selector)` - Wait for element to appear

### 2. Code Generator (`code-generator.ts`)

Uses Claude Bedrock to generate extraction functions:

**Features:**
- Truncates large HTML to fit in AI context window
- Provides detailed instructions about EHR_UTILS API
- Includes previous error feedback for retry attempts
- Validates syntax before execution

**Example Generated Code:**
```javascript
function extract() {
  try {
    const patientName = EHR_UTILS.getTextDeep(
      EHR_UTILS.queryDeep('.patient-name')
    );
    const dob = EHR_UTILS.getTextDeep(
      EHR_UTILS.queryDeep('.dob')
    );

    return {
      patientName: patientName || null,
      dateOfBirth: dob ? EHR_UTILS.parseDate(dob) : null
    };
  } catch (error) {
    console.error('Extraction error:', error);
    return null;
  }
}
```

### 3. The Gauntlet (`gauntlet.ts`)

Validation harness using Playwright:

**Responsibilities:**
1. Launch headless browser
2. Load HTML in browser context
3. Inject EHR_UTILS runtime library
4. Execute generated extraction code
5. Validate output against ground truth
6. Return detailed success/failure result

**Validation Rules:**
- Checks all fields from ground truth are present
- Allows case-insensitive string matching
- Handles nested objects and arrays
- Provides detailed error messages for debugging

### 4. Forge Orchestrator (`index.ts`)

Main service that ties everything together:

**Features:**
- Polls MongoDB for `ANNOTATED` snapshots
- Retry loop (default: 3 attempts)
- Error feedback to code generator
- Graceful shutdown handling
- Comprehensive logging

**Status Transitions:**
- `ANNOTATED` → `VERIFIED` (success)
- `ANNOTATED` → `EXTRACTED` (failed after max retries)

## Usage

### Development Mode

Start the Forge service in watch mode:
```bash
pnpm dev:forge
```

Environment variables:
```env
AWS_PROFILE=ai-developer          # Set automatically by package script
AWS_REGION=us-east-1              # AWS region (optional, default: us-east-1)
BEDROCK_MODEL_ID=...              # Model override (optional)
FORGE_POLL_INTERVAL=10000         # Polling interval in ms (default: 10000)
FORGE_MAX_RETRIES=3               # Max retry attempts (default: 3)
```

### Production Mode

Build and start:
```bash
pnpm build
pnpm start:forge
```

### Testing

Run Forge tests:
```bash
pnpm test:forge
```

Test coverage:
- ✅ Gauntlet execution with valid code
- ✅ Syntax error detection
- ✅ Runtime error handling
- ✅ Ground truth validation
- ✅ Retry loop with eventual success
- ✅ Max retries exhaustion
- ✅ Missing ground truth handling

## Complete Pipeline

```
┌─────────────┐
│   Miner     │ (Chrome Extension)
│  (Phase 2)  │
└──────┬──────┘
       │ HTML Snapshot
       ▼
┌─────────────┐
│  Backend    │ Status: NEW
│  (Phase 1)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Oracle    │ HTML → Ground Truth
│  (Phase 3)  │ Status: NEW → ANNOTATED
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Forge     │ HTML + Ground Truth → Extractor Code
│  (Phase 4)  │ Status: ANNOTATED → VERIFIED
└──────┬──────┘
       │
       ▼
  Reusable JavaScript Extractor!
```

## Benefits

Once the Forge generates and verifies extraction code:

1. **Fast Execution** - Run extractor without AI API calls
2. **Deterministic** - Same HTML always produces same output
3. **Reusable** - Use same extractor on similar EHR pages
4. **Auditable** - Code is stored and can be reviewed/modified
5. **Cost Effective** - No ongoing AI costs for repeated extractions

## Troubleshooting

### Extraction Always Fails

Check logs for common issues:
- **Wrong selectors** - AI is guessing CSS selectors from truncated HTML
- **Shadow DOM not traversed** - Ensure using `EHR_UTILS.queryDeep()`
- **Syntax errors** - Check for invalid JavaScript

### Code Generator Timeout

- Reduce HTML size sent to AI (adjust `MAX_HTML_CHARS` in code-generator.ts)
- Ensure AWS credentials are valid
- Check Bedrock model availability

### Gauntlet Hangs

- Increase Playwright timeout
- Check for infinite loops in generated code
- Verify HTML can be loaded in browser (check for CSP issues)

## Next Steps

Potential enhancements:
- [ ] Learning from verified extractors (few-shot examples)
- [ ] Pattern recognition for similar pages
- [ ] Confidence scoring for extractors
- [ ] A/B testing of multiple extractors
- [ ] Performance benchmarks
- [ ] Extractor versioning and rollback
