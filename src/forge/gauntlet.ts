/**
 * The Gauntlet - Validation Harness for Generated Extraction Code
 *
 * Runs AI-generated extraction code in a real browser using Playwright
 * and validates that it produces the expected output (ground truth).
 */

import { chromium, Browser, Page } from 'playwright';

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
   * Get pure JavaScript version of EHR_UTILS runtime library
   *
   * This is a browser-safe version with no TypeScript syntax
   */
  private getRuntimeLibrary(): string {
    return `
window.EHR_UTILS = {
  queryDeep(selector, root = document) {
    const queue = [root];

    while (queue.length > 0) {
      const current = queue.shift();

      if ('querySelector' in current) {
        const found = current.querySelector(selector);
        if (found) return found;
      }

      if ('querySelectorAll' in current) {
        const elements = Array.from(current.querySelectorAll('*'));
        for (const el of elements) {
          if (el.shadowRoot) {
            queue.push(el.shadowRoot);
          }
        }
      }
    }

    return null;
  },

  queryAllDeep(selector, root = document) {
    const results = [];
    const queue = [root];

    while (queue.length > 0) {
      const current = queue.shift();

      if ('querySelectorAll' in current) {
        const matches = Array.from(current.querySelectorAll(selector));
        results.push(...matches);

        const elements = Array.from(current.querySelectorAll('*'));
        for (const el of elements) {
          if (el.shadowRoot) {
            queue.push(el.shadowRoot);
          }
        }
      }
    }

    return results;
  },

  getTextDeep(element) {
    if (!element) return '';

    let text = element.textContent || '';

    if (element.shadowRoot) {
      const shadowElements = Array.from(element.shadowRoot.querySelectorAll('*'));
      for (const el of shadowElements) {
        text += ' ' + (el.textContent || '');
      }
    }

    return text.trim();
  },

  getAttr(element, attr) {
    return element?.getAttribute(attr) || null;
  },

  getIframeText(iframe) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        return iframeDoc.body?.textContent?.trim() || null;
      }
    } catch (e) {
      console.warn('Cannot access cross-origin iframe', e);
    }
    return null;
  },

  parseDate(dateStr) {
    if (!dateStr) return null;

    const cleaned = dateStr.trim();

    try {
      const date = new Date(cleaned);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
      // Invalid date
    }

    return null;
  },

  extractTableData(table, headers) {
    const result = {};

    const headerRow = table.querySelector('thead tr, tr:first-child');
    if (!headerRow) return result;

    const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
    const headerMap = new Map();

    headerCells.forEach((cell, index) => {
      const text = cell.textContent?.trim().toLowerCase() || '';
      for (const header of headers) {
        if (text.includes(header.toLowerCase())) {
          headerMap.set(index, header);
        }
      }
    });

    const dataRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
    dataRows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      cells.forEach((cell, index) => {
        const headerName = headerMap.get(index);
        if (headerName && !result[headerName]) {
          result[headerName] = cell.textContent?.trim() || null;
        }
      });
    });

    return result;
  },

  async waitForElement(selector, timeoutMs = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const element = this.queryDeep(selector);
      if (element) return element;

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return null;
  }
};
    `.trim();
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
