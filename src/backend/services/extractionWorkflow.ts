import { aiService } from './aiService';
import { Snapshot } from '../models/Snapshot';
import { EHRRecord } from '../models/EHRRecord';
import { AITask } from '../models/AITask';

/**
 * State interface for the extraction workflow
 */
interface ExtractionState {
  snapshotId: string;
  patientId?: string;
  htmlContent?: string;
  extractedData?: any;
  analysis?: any;
  verification?: any;
  errors: string[];
  step: string;
}

/**
 * Simplified extraction workflow without LangGraph complexity
 *
 * Flow: Load -> Extract -> Analyze -> Verify -> Save
 */
export class ExtractionWorkflow {
  /**
   * Step 1: Load snapshot from database
   */
  private async loadSnapshot(state: ExtractionState): Promise<ExtractionState> {
    try {
      console.log(`[Workflow] Loading snapshot: ${state.snapshotId}`);

      const snapshot = await Snapshot.findById(state.snapshotId);
      if (!snapshot) {
        return {
          ...state,
          step: 'load',
          errors: [...state.errors, 'Snapshot not found']
        };
      }

      return {
        ...state,
        step: 'load',
        htmlContent: snapshot.htmlBlob
      };
    } catch (error) {
      return {
        ...state,
        step: 'load',
        errors: [...state.errors, `Load error: ${error}`]
      };
    }
  }

  /**
   * Step 2: Extract structured data from HTML
   */
  private async extractData(state: ExtractionState): Promise<ExtractionState> {
    try {
      console.log('[Workflow] Extracting data from HTML');

      const fields = [
        'patientName',
        'dateOfBirth',
        'visitDate',
        'chiefComplaint',
        'diagnosis',
        'medications',
        'vitals',
        'allergies',
        'labResults'
      ];

      const result = await aiService.extractFromHTML(state.htmlContent!, fields);

      if (!result.success) {
        return {
          ...state,
          step: 'extract',
          errors: [...state.errors, `Extraction error: ${result.error}`]
        };
      }

      return {
        ...state,
        step: 'extract',
        extractedData: result.extractedData
      };
    } catch (error) {
      return {
        ...state,
        step: 'extract',
        errors: [...state.errors, `Extract error: ${error}`]
      };
    }
  }

  /**
   * Step 3: Analyze and classify the content
   */
  private async analyzeData(state: ExtractionState): Promise<ExtractionState> {
    try {
      console.log('[Workflow] Analyzing content');

      const result = await aiService.analyzeContent(state.htmlContent!);

      if (!result.success) {
        return {
          ...state,
          step: 'analyze',
          errors: [...state.errors, `Analysis error: ${result.error}`]
        };
      }

      return {
        ...state,
        step: 'analyze',
        analysis: result.extractedData
      };
    } catch (error) {
      return {
        ...state,
        step: 'analyze',
        errors: [...state.errors, `Analyze error: ${error}`]
      };
    }
  }

  /**
   * Step 4: Verify extraction accuracy
   */
  private async verifyData(state: ExtractionState): Promise<ExtractionState> {
    try {
      console.log('[Workflow] Verifying extraction');

      const result = await aiService.verifyExtraction(
        state.htmlContent!,
        state.extractedData
      );

      if (!result.success) {
        return {
          ...state,
          step: 'verify',
          errors: [...state.errors, `Verification error: ${result.error}`]
        };
      }

      return {
        ...state,
        step: 'verify',
        verification: result.extractedData
      };
    } catch (error) {
      return {
        ...state,
        step: 'verify',
        errors: [...state.errors, `Verify error: ${error}`]
      };
    }
  }

  /**
   * Step 5: Save results to database
   */
  private async saveResults(state: ExtractionState): Promise<ExtractionState> {
    try {
      console.log('[Workflow] Saving results');

      // Update snapshot status
      await Snapshot.findByIdAndUpdate(state.snapshotId, {
        status: state.errors.length > 0 ? 'EXTRACTED' : 'VERIFIED',
        groundTruth: {
          extracted: state.extractedData,
          analysis: state.analysis,
          verification: state.verification
        }
      });

      // Create or update EHR record if patient ID is provided
      if (state.patientId) {
        await EHRRecord.create({
          patientId: state.patientId,
          snapshotId: state.snapshotId,
          recordType: state.analysis?.documentType?.toUpperCase() || 'OTHER',
          sourceSystem: 'AI_EXTRACTION',
          recordDate: new Date(state.extractedData?.visitDate || Date.now()),
          data: {
            raw: state.extractedData,
            structured: {
              ...state.extractedData,
              analysis: state.analysis,
              verification: state.verification
            }
          },
          extractionStatus: state.errors.length > 0 ? 'COMPLETED' : 'COMPLETED',
          metadata: {
            workflowVersion: '1.0',
            confidence: state.verification?.confidence || 0.85
          }
        });
      }

      return {
        ...state,
        step: 'save'
      };
    } catch (error) {
      return {
        ...state,
        step: 'save',
        errors: [...state.errors, `Save error: ${error}`]
      };
    }
  }

  /**
   * Execute the workflow sequentially through all steps
   */
  async execute(snapshotId: string, patientId?: string): Promise<ExtractionState> {
    let state: ExtractionState = {
      snapshotId,
      patientId,
      errors: [],
      step: 'init'
    };

    try {
      // Execute workflow steps sequentially
      state = await this.loadSnapshot(state);
      if (state.errors.length > 0) return state;

      state = await this.extractData(state);
      if (state.errors.length > 0) return state;

      state = await this.analyzeData(state);
      if (state.errors.length > 0) return state;

      state = await this.verifyData(state);
      if (state.errors.length > 0) return state;

      state = await this.saveResults(state);

      return state;
    } catch (error) {
      return {
        ...state,
        step: 'error',
        errors: [...state.errors, `Workflow error: ${error}`]
      };
    }
  }

  /**
   * Execute workflow for an AI task
   */
  async executeTask(taskId: string): Promise<void> {
    const task = await AITask.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    try {
      // Update task status
      await AITask.findByIdAndUpdate(taskId, {
        status: 'PROCESSING',
        startedAt: new Date(),
        $push: {
          logs: {
            timestamp: new Date(),
            level: 'INFO',
            message: 'Starting extraction workflow'
          }
        }
      });

      // Execute workflow
      const result = await this.execute(
        task.targetId.toString(),
        task.input?.patientId
      );

      // Update task with results
      if (result.errors.length > 0) {
        await AITask.findByIdAndUpdate(taskId, {
          status: 'FAILED',
          error: result.errors.join('; '),
          completedAt: new Date(),
          $push: {
            logs: {
              timestamp: new Date(),
              level: 'ERROR',
              message: `Workflow failed: ${result.errors.join('; ')}`
            }
          }
        });
      } else {
        await AITask.findByIdAndUpdate(taskId, {
          status: 'COMPLETED',
          output: {
            extracted: result.extractedData,
            analysis: result.analysis,
            verification: result.verification
          },
          completedAt: new Date(),
          $push: {
            logs: {
              timestamp: new Date(),
              level: 'INFO',
              message: 'Workflow completed successfully'
            }
          }
        });
      }
    } catch (error) {
      await AITask.findByIdAndUpdate(taskId, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
        $push: {
          logs: {
            timestamp: new Date(),
            level: 'ERROR',
            message: `Task execution failed: ${error}`
          }
        }
      });
      throw error;
    }
  }
}

// Export singleton instance
export const extractionWorkflow = new ExtractionWorkflow();
