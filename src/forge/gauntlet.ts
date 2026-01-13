/**
 * The Gauntlet - Validation Harness for Generated Extraction Code
 *
 * Runs AI-generated extraction code in a real browser using Playwright
 * and validates that it produces the expected output (ground truth).
 */

import { chromium, Browser } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface GauntletResult {
  success: boolean;
  extractedData?: Record<string, any>;
  error?: string;
  executionTime?: number;
}

export class Gauntlet {
  private browser: Browser | null = null;

  /**
   * Initialize Gauntlet (launch browser)
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  /**
   * Cleanup (close browser)
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Run extraction code against HTML and validate results
   *
   * @param htmlBlob - Raw HTML to test against
   * @param extractorCode - AI-generated extraction code
   * @param groundTruth - Expected output for validation (optional)
   * @returns Validation result
   */
  async run(
    htmlBlob: string,
    extractorCode: string,
    groundTruth?: Record<string, any>
  ): Promise<GauntletResult> {
    const startTime = Date.now();

    try {
      await this.initialize();

      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      const page = await this.browser.newPage();

      // Load EHR_UTILS runtime library (pure JavaScript version)
      const runtimeCode = this.getRuntimeLibrary();

      try {
        // Navigate to data URL with HTML
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlBlob)}`;
        await page.goto(dataUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

        // Execute extraction in browser context
        const result = await page.evaluate(({ runtime, extractor }) => {
          try {
            // Inject runtime library (assigns to window.EHR_UTILS)
            eval(runtime);

            // Execute extractor function
            eval(extractor);

            // Call extract() function
            if (typeof extract !== 'function') {
              throw new Error('Generated code did not define an extract() function');
            }

            const extracted = extract();

            return {
              success: true,
              data: extracted
            };
          } catch (error: any) {
            return {
              success: false,
              error: error.message || String(error),
              stack: error.stack
            };
          }
        }, { runtime: runtimeCode, extractor: extractorCode });

        await page.close();

        const executionTime = Date.now() - startTime;

        if (!result.success) {
          return {
            success: false,
            error: result.error,
            executionTime
          };
        }

        // Validate against ground truth if provided
        if (groundTruth) {
          const validation = this.validateAgainstGroundTruth(result.data, groundTruth);
          if (!validation.valid) {
            return {
              success: false,
              extractedData: result.data,
              error: `Validation failed: ${validation.errors.join(', ')}`,
              executionTime
            };
          }
        }

        return {
          success: true,
          extractedData: result.data,
          executionTime
        };
      } catch (error) {
        await page.close().catch(() => {}); // Ignore close errors
        throw error;
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime
      };
    }
  }

  /**
   * Get browser-ready EHR_UTILS runtime library
   * Loads from the pre-built browser-safe version
   */
  private getRuntimeLibrary(): string {
    try {
      // Load from runtime directory
      const runtimePath = join(__dirname, '..', 'runtime', 'ehr-utils.browser.js');
      return readFileSync(runtimePath, 'utf-8');
    } catch (error) {
      // Fallback: if file not found, throw error with helpful message
      throw new Error(
        `Failed to load EHR_UTILS runtime library. ` +
        `Expected location: ${join(__dirname, '..', 'runtime', 'ehr-utils.browser.js')}. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate extracted data against ground truth
   *
   * Checks if all fields in ground truth are present and match
   * (allows for slight variations in formatting)
   */
  private validateAgainstGroundTruth(
    extracted: Record<string, any>,
    groundTruth: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [key, expectedValue] of Object.entries(groundTruth)) {
      const actualValue = extracted[key];

      // Check if key exists
      if (!(key in extracted)) {
        errors.push(`Missing field: ${key}`);
        continue;
      }

      // Allow null if expected is also null or undefined
      if (expectedValue === null || expectedValue === undefined) {
        if (actualValue !== null && actualValue !== undefined) {
          errors.push(`Field ${key}: expected null/undefined, got ${JSON.stringify(actualValue)}`);
        }
        continue;
      }

      // For arrays, check length and contents
      if (Array.isArray(expectedValue)) {
        if (!Array.isArray(actualValue)) {
          errors.push(`Field ${key}: expected array, got ${typeof actualValue}`);
          continue;
        }

        if (actualValue.length !== expectedValue.length) {
          errors.push(`Field ${key}: expected ${expectedValue.length} items, got ${actualValue.length}`);
        }
        continue;
      }

      // For objects, do deep comparison
      if (typeof expectedValue === 'object') {
        if (typeof actualValue !== 'object') {
          errors.push(`Field ${key}: expected object, got ${typeof actualValue}`);
          continue;
        }

        const nestedValidation = this.validateAgainstGroundTruth(actualValue, expectedValue);
        if (!nestedValidation.valid) {
          errors.push(`Field ${key}: ${nestedValidation.errors.join(', ')}`);
        }
        continue;
      }

      // For strings, allow case-insensitive matching and trimming
      if (typeof expectedValue === 'string' && typeof actualValue === 'string') {
        const expectedNorm = expectedValue.trim().toLowerCase();
        const actualNorm = actualValue.trim().toLowerCase();

        if (expectedNorm !== actualNorm) {
          // Check if it's a close match (contains expected value)
          if (!actualNorm.includes(expectedNorm) && !expectedNorm.includes(actualNorm)) {
            errors.push(`Field ${key}: expected "${expectedValue}", got "${actualValue}"`);
          }
        }
        continue;
      }

      // For other types, strict equality
      if (actualValue !== expectedValue) {
        errors.push(`Field ${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const gauntlet = new Gauntlet();
