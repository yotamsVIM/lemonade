/**
 * The Forge - Code Generation and Validation Orchestrator
 *
 * Polls for ANNOTATED snapshots, generates extraction code using Claude,
 * validates it with the Gauntlet, and retries on failure.
 *
 * Flow: ANNOTATED → Generate Code → Validate → VERIFIED or EXTRACTED
 */

import { Snapshot } from '../backend/models/Snapshot';
import { codeGenerator } from './code-generator';
import { gauntlet } from './gauntlet';

const MAX_RETRIES = 3;
const DEFAULT_POLL_INTERVAL = 10000; // 10 seconds

export interface ForgeOptions {
  maxRetries?: number;
}

/**
 * Process a single ANNOTATED snapshot through the Forge
 *
 * @param options - Configuration options
 * @returns true if snapshot was processed (success or max retries), false if no work
 */
export async function processAnnotatedSnapshot(options: ForgeOptions = {}): Promise<boolean> {
  const maxRetries = options.maxRetries || MAX_RETRIES;

  // Find an ANNOTATED snapshot to process
  const snapshot = await Snapshot.findOne({ status: 'ANNOTATED' }).sort({ createdAt: 1 });

  if (!snapshot) {
    return false; // No work to do
  }

  console.log(`🔨 Forge processing snapshot ${snapshot._id}`);

  // Validate ground truth exists
  if (!snapshot.groundTruth) {
    snapshot.logs.push({
      phase: 'FORGE',
      level: 'ERROR',
      msg: 'No ground truth found - cannot generate extractor',
      timestamp: new Date()
    });
    snapshot.status = 'EXTRACTED'; // Mark as failed
    await snapshot.save();
    return true;
  }

  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < maxRetries) {
    attempt++;

    try {
      console.log(`  Attempt ${attempt}/${maxRetries}...`);

      // Generate extraction code
      const code = await codeGenerator.generateExtractor({
        htmlBlob: snapshot.htmlBlob,
        groundTruth: snapshot.groundTruth as Record<string, any>,
        previousError: lastError
      });

      // Validate syntax first
      const syntaxCheck = codeGenerator.validateSyntax(code);
      if (!syntaxCheck.valid) {
        lastError = `Syntax error: ${syntaxCheck.error}`;
        snapshot.logs.push({
          phase: 'FORGE',
          level: 'WARN',
          msg: `Attempt ${attempt} - Syntax validation failed: ${lastError}`,
          timestamp: new Date()
        });
        continue; // Retry
      }

      // Store the generated code
      snapshot.extractorCode = code;

      // Run the Gauntlet
      const result = await gauntlet.run(
        snapshot.htmlBlob,
        code,
        snapshot.groundTruth as Record<string, any>
      );

      if (result.success) {
        // SUCCESS! Code works correctly
        snapshot.status = 'VERIFIED';
        snapshot.logs.push({
          phase: 'FORGE',
          level: 'INFO',
          msg: `Code verified on attempt ${attempt} (execution time: ${result.executionTime}ms)`,
          timestamp: new Date()
        });
        await snapshot.save();

        console.log(`✅ Snapshot ${snapshot._id} verified (${attempt} attempt(s))`);
        return true;
      } else {
        // Gauntlet failed - prepare for retry
        lastError = result.error || 'Unknown validation error';
        snapshot.logs.push({
          phase: 'FORGE',
          level: 'WARN',
          msg: `Attempt ${attempt} failed: ${lastError}`,
          timestamp: new Date()
        });

        console.log(`  ⚠️  Attempt ${attempt} failed: ${lastError}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      snapshot.logs.push({
        phase: 'FORGE',
        level: 'ERROR',
        msg: `Attempt ${attempt} error: ${lastError}`,
        timestamp: new Date()
      });

      console.error(`  ❌ Attempt ${attempt} error:`, lastError);
    }

    // Wait a bit before retry (give AI time to "think")
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // All retries exhausted
  snapshot.status = 'EXTRACTED'; // Mark as partially complete (has code but not verified)
  snapshot.logs.push({
    phase: 'FORGE',
    level: 'ERROR',
    msg: `Failed after ${maxRetries} attempts. Last error: ${lastError}`,
    timestamp: new Date()
  });
  await snapshot.save();

  console.log(`❌ Snapshot ${snapshot._id} failed after ${maxRetries} attempts`);
  return true;
}

/**
 * Start the Forge polling service
 *
 * @param intervalMs - Polling interval in milliseconds (default: 10000)
 * @param options - Forge configuration options
 */
export async function startForge(intervalMs: number = DEFAULT_POLL_INTERVAL, options: ForgeOptions = {}): Promise<void> {
  console.log('🔨 Forge service started');
  console.log(`  Polling interval: ${intervalMs}ms`);
  console.log(`  Max retries: ${options.maxRetries || MAX_RETRIES}`);

  // Initialize Gauntlet browser
  await gauntlet.initialize();

  // Polling loop
  const poll = async () => {
    try {
      await processAnnotatedSnapshot(options);
    } catch (error) {
      console.error('Forge polling error:', error);
    }
  };

  // Initial poll
  await poll();

  // Start interval
  setInterval(poll, intervalMs);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Forge service...');
    await gauntlet.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down Forge service...');
    await gauntlet.cleanup();
    process.exit(0);
  });
}

// If run directly, start the service
if (require.main === module) {
  const intervalMs = parseInt(process.env.FORGE_POLL_INTERVAL || '10000', 10);
  const maxRetries = parseInt(process.env.FORGE_MAX_RETRIES || '3', 10);

  startForge(intervalMs, { maxRetries }).catch((error) => {
    console.error('Failed to start Forge:', error);
    process.exit(1);
  });
}
