import { AITask } from '../models/AITask';
import { extractionWorkflow } from './extractionWorkflow';
import { aiService } from './aiService';

export class TaskWorker {
  private isRunning = false;
  private pollInterval: number;
  private maxConcurrent: number;
  private activeTaskCount = 0;

  constructor() {
    this.pollInterval = parseInt(process.env.AI_WORKER_POLL_INTERVAL || '5000');
    this.maxConcurrent = parseInt(process.env.AI_WORKER_MAX_CONCURRENT || '3');
  }

  /**
   * Start the task worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[TaskWorker] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[TaskWorker] Starting worker...');
    console.log(`[TaskWorker] Poll interval: ${this.pollInterval}ms`);
    console.log(`[TaskWorker] Max concurrent: ${this.maxConcurrent}`);

    this.poll();
  }

  /**
   * Stop the task worker
   */
  stop(): void {
    console.log('[TaskWorker] Stopping worker...');
    this.isRunning = false;
  }

  /**
   * Poll for new tasks
   */
  private async poll(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check if we can process more tasks
        if (this.activeTaskCount < this.maxConcurrent) {
          const availableSlots = this.maxConcurrent - this.activeTaskCount;

          // Get pending tasks
          const tasks = await AITask.find({ status: 'QUEUED' })
            .sort({ priority: -1, createdAt: 1 })
            .limit(availableSlots);

          if (tasks.length > 0) {
            console.log(`[TaskWorker] Found ${tasks.length} pending task(s)`);

            // Process tasks concurrently
            tasks.forEach(task => this.processTask(task._id.toString()));
          }
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      } catch (error) {
        console.error('[TaskWorker] Poll error:', error);
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      }
    }

    console.log('[TaskWorker] Worker stopped');
  }

  /**
   * Process a single task
   */
  private async processTask(taskId: string): Promise<void> {
    this.activeTaskCount++;
    console.log(`[TaskWorker] ========================================`);
    console.log(`[TaskWorker] Starting task processing`);
    console.log(`[TaskWorker] Task ID: ${taskId.substring(0, 8)}...`);
    console.log(`[TaskWorker] Active tasks: ${this.activeTaskCount}/${this.maxConcurrent}`);

    try {
      const task = await AITask.findById(taskId);
      if (!task) {
        console.error(`[TaskWorker] ✗ Task not found: ${taskId}`);
        return;
      }

      console.log(`[TaskWorker] Task type: ${task.taskType}`);
      console.log(`[TaskWorker] Target type: ${task.targetType}`);
      console.log(`[TaskWorker] Target ID: ${task.targetId}`);
      console.log(`[TaskWorker] Priority: ${task.priority}`);
      console.log(`[TaskWorker] Retry count: ${task.retryCount}/${task.maxRetries}`);

      // Route to appropriate handler based on task type
      switch (task.taskType) {
        case 'EXTRACT':
          console.log(`[TaskWorker] Routing to EXTRACT handler...`);
          await this.handleExtractTask(task);
          break;
        case 'SUMMARIZE':
          console.log(`[TaskWorker] Routing to SUMMARIZE handler...`);
          await this.handleSummarizeTask(task);
          break;
        case 'ANALYZE':
          console.log(`[TaskWorker] Routing to ANALYZE handler...`);
          await this.handleAnalyzeTask(task);
          break;
        case 'VERIFY':
          console.log(`[TaskWorker] Routing to VERIFY handler...`);
          await this.handleVerifyTask(task);
          break;
        case 'CLASSIFY':
          console.log(`[TaskWorker] Routing to CLASSIFY handler...`);
          await this.handleClassifyTask(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.taskType}`);
      }

      console.log(`[TaskWorker] ✓ Task completed successfully`);
    } catch (error) {
      console.error(`[TaskWorker] ✗ Task processing failed`);
      console.error(`[TaskWorker] Error:`, error);

      // Update task with error
      const task = await AITask.findById(taskId);
      if (task && task.retryCount < task.maxRetries) {
        // Retry the task
        console.log(`[TaskWorker] Retrying task (${task.retryCount + 1}/${task.maxRetries})...`);
        await AITask.findByIdAndUpdate(taskId, {
          status: 'QUEUED',
          $inc: { retryCount: 1 },
          $push: {
            logs: {
              timestamp: new Date(),
              level: 'WARN',
              message: `Task failed, retrying (${task.retryCount + 1}/${task.maxRetries}): ${error}`
            }
          }
        });
      } else {
        // Max retries reached
        console.error(`[TaskWorker] Max retries reached, marking task as FAILED`);
        await AITask.findByIdAndUpdate(taskId, {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
          $push: {
            logs: {
              timestamp: new Date(),
              level: 'ERROR',
              message: `Task failed after max retries: ${error}`
            }
          }
        });
      }
    } finally {
      this.activeTaskCount--;
      console.log(`[TaskWorker] Task processing complete. Active: ${this.activeTaskCount}/${this.maxConcurrent}`);
      console.log(`[TaskWorker] ========================================`);
    }
  }

  /**
   * Handle EXTRACT task using LangGraph workflow
   */
  private async handleExtractTask(task: any): Promise<void> {
    await extractionWorkflow.executeTask(task._id.toString());
  }

  /**
   * Handle SUMMARIZE task
   */
  private async handleSummarizeTask(task: any): Promise<void> {
    await AITask.findByIdAndUpdate(task._id, {
      status: 'PROCESSING',
      startedAt: new Date()
    });

    const records = task.input?.records || [];
    const result = await aiService.summarizeRecords(records);

    if (result.success) {
      await AITask.findByIdAndUpdate(task._id, {
        status: 'COMPLETED',
        output: result.extractedData,
        completedAt: new Date()
      });
    } else {
      throw new Error(result.error);
    }
  }

  /**
   * Handle ANALYZE task
   */
  private async handleAnalyzeTask(task: any): Promise<void> {
    await AITask.findByIdAndUpdate(task._id, {
      status: 'PROCESSING',
      startedAt: new Date()
    });

    const content = task.input?.content || '';
    const result = await aiService.analyzeContent(content);

    if (result.success) {
      await AITask.findByIdAndUpdate(task._id, {
        status: 'COMPLETED',
        output: result.extractedData,
        completedAt: new Date()
      });
    } else {
      throw new Error(result.error);
    }
  }

  /**
   * Handle VERIFY task
   */
  private async handleVerifyTask(task: any): Promise<void> {
    await AITask.findByIdAndUpdate(task._id, {
      status: 'PROCESSING',
      startedAt: new Date()
    });

    const original = task.input?.original || '';
    const extracted = task.input?.extracted || {};
    const result = await aiService.verifyExtraction(original, extracted);

    if (result.success) {
      await AITask.findByIdAndUpdate(task._id, {
        status: 'COMPLETED',
        output: result.extractedData,
        completedAt: new Date()
      });
    } else {
      throw new Error(result.error);
    }
  }

  /**
   * Handle CLASSIFY task
   */
  private async handleClassifyTask(task: any): Promise<void> {
    await AITask.findByIdAndUpdate(task._id, {
      status: 'PROCESSING',
      startedAt: new Date()
    });

    const content = task.input?.content || '';
    const result = await aiService.analyzeContent(content);

    if (result.success) {
      await AITask.findByIdAndUpdate(task._id, {
        status: 'COMPLETED',
        output: {
          classification: result.extractedData.documentType,
          confidence: result.confidence,
          details: result.extractedData
        },
        completedAt: new Date()
      });
    } else {
      throw new Error(result.error);
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeTaskCount: this.activeTaskCount,
      maxConcurrent: this.maxConcurrent,
      pollInterval: this.pollInterval
    };
  }
}

// Export singleton instance
export const taskWorker = new TaskWorker();
