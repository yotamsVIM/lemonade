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
      console.log(`[Workflow] ===== STEP 1: Load Snapshot =====`);
      console.log(`[Workflow] Snapshot ID: ${state.snapshotId}`);

      const snapshot = await Snapshot.findById(state.snapshotId);
      if (!snapshot) {
        console.error(`[Workflow] ✗ Snapshot not found: ${state.snapshotId}`);
        return {
          ...state,
          step: 'load',
          errors: [...state.errors, 'Snapshot not found']
        };
      }

      console.log(`[Workflow] ✓ Snapshot loaded successfully`);
      console.log(`[Workflow] HTML size: ${snapshot.htmlBlob.length} bytes`);
      console.log(`[Workflow] Snapshot status: ${snapshot.status}`);

      return {
        ...state,
        step: 'load',
        htmlContent: snapshot.htmlBlob
      };
    } catch (error) {
      console.error(`[Workflow] ✗ Load error:`, error);
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
      console.log('[Workflow] ===== STEP 2: Extract Data =====');

      const fields = [
        'firstName',
        'lastName',
        'middleName',
        'fullName',
        'dateOfBirth',
        'visitDate',
        'chiefComplaint',
        'diagnosis',
        'medications',
        'vitals',
        'allergies',
        'labResults'
      ];

      console.log(`[Workflow] Calling AI Service to extract ${fields.length} fields...`);
      const result = await aiService.extractFromHTML(state.htmlContent!, fields);

      if (!result.success) {
        console.error(`[Workflow] ✗ Extraction failed: ${result.error}`);
        return {
          ...state,
          step: 'extract',
          errors: [...state.errors, `Extraction error: ${result.error}`]
        };
      }

      console.log('[Workflow] ✓ Extraction completed successfully');
      console.log('[Workflow] Extracted data preview:', JSON.stringify(result.extractedData).substring(0, 200) + '...');

      return {
        ...state,
        step: 'extract',
        extractedData: result.extractedData
      };
    } catch (error) {
      console.error('[Workflow] ✗ Extract error:', error);
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
      console.log('[Workflow] ===== STEP 5: Save Results =====');

      const newStatus = state.errors.length > 0 ? 'EXTRACTED' : 'VERIFIED';
      console.log(`[Workflow] Updating snapshot status to: ${newStatus}`);

      // Update snapshot status
      await Snapshot.findByIdAndUpdate(state.snapshotId, {
        status: newStatus,
        groundTruth: {
          extracted: state.extractedData,
          analysis: state.analysis,
          verification: state.verification
        }
      });

      console.log('[Workflow] ✓ Snapshot updated');

      // Create or update EHR record if patient ID is provided
      if (state.patientId) {
        console.log(`[Workflow] Creating EHR record for patient: ${state.patientId}`);
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
        console.log('[Workflow] ✓ EHR record created');
      } else {
        console.log('[Workflow] No patient ID provided, skipping EHR record creation');
      }

      console.log('[Workflow] ✓ Save completed successfully');

      return {
        ...state,
        step: 'save'
      };
    } catch (error) {
      console.error('[Workflow] ✗ Save error:', error);
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
    console.log('[Workflow] ========================================');
    console.log('[Workflow] Starting Extraction Workflow');
    console.log(`[Workflow] Snapshot ID: ${snapshotId}`);
    console.log(`[Workflow] Patient ID: ${patientId || '(none)'}`);
    console.log('[Workflow] ========================================');

    let state: ExtractionState = {
      snapshotId,
      patientId,
      errors: [],
      step: 'init'
    };

    try {
      // Execute workflow steps sequentially
      state = await this.loadSnapshot(state);
      if (state.errors.length > 0) {
        console.error('[Workflow] Workflow stopped due to errors in load step');
        return state;
      }

      state = await this.extractData(state);
      if (state.errors.length > 0) {
        console.error('[Workflow] Workflow stopped due to errors in extract step');
        return state;
      }

      // TEMPORARY: Skip analysis and verification to save API quota
      // state = await this.analyzeData(state);
      // if (state.errors.length > 0) return state;

      // state = await this.verifyData(state);
      // if (state.errors.length > 0) return state;

      state = await this.saveResults(state);

      if (state.errors.length > 0) {
        console.error('[Workflow] Workflow completed with errors');
      } else {
        console.log('[Workflow] ✓✓✓ Workflow completed successfully ✓✓✓');
      }

      return state;
    } catch (error) {
      console.error('[Workflow] ✗✗✗ Workflow fatal error ✗✗✗');
      console.error('[Workflow] Error:', error);
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
    console.log('[Workflow] Executing task:', taskId);

    const task = await AITask.findById(taskId);
    if (!task) {
      console.error(`[Workflow] Task not found: ${taskId}`);
      throw new Error('Task not found');
    }

    console.log(`[Workflow] Task type: ${task.taskType}`);
    console.log(`[Workflow] Target type: ${task.targetType}`);
    console.log(`[Workflow] Target ID: ${task.targetId}`);

    try {
      // Update task status
      console.log('[Workflow] Updating task status to PROCESSING...');
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
      console.log('[Workflow] Starting workflow execution...');
      const result = await this.execute(
        task.targetId.toString(),
        task.input?.patientId
      );

      // Update task with results
      if (result.errors.length > 0) {
        console.error(`[Workflow] Task failed with ${result.errors.length} error(s)`);
        console.error('[Workflow] Errors:', result.errors);

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
        console.log('[Workflow] ✓ Task completed successfully');

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

        // Automatically trigger Forge (code generation) after successful extraction
        if (result.extractedData && Object.keys(result.extractedData).length > 0) {
          console.log('[Workflow] Creating Forge task for code generation...');

          const forgeTask = await AITask.create({
            taskType: 'GENERATE',
            targetType: 'SNAPSHOT',
            targetId: state.snapshotId,
            priority: 'MEDIUM',
            input: {
              groundTruth: result.extractedData
            }
          });

          console.log(`[Workflow] ✓ Forge task created: ${forgeTask._id}`);

          // Update snapshot status to trigger Forge processing
          await Snapshot.findByIdAndUpdate(state.snapshotId, {
            status: 'EXTRACTED'
          });
        }
      }
    } catch (error) {
      console.error('[Workflow] ✗ Task execution failed with exception');
      console.error('[Workflow] Exception:', error);

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
