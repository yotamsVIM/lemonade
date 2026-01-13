/**
 * EHR_UTILS - Browser-safe runtime library for EHR data extraction
 *
 * This library is injected into the browser context alongside AI-generated
 * extraction code. It provides helpers for traversing Shadow DOM, iframes,
 * and extracting data from complex EHR pages.
 *
 * IMPORTANT: This code must be browser-safe (no Node.js APIs)
 */

export const EHR_UTILS = {
  /**
   * Query across shadow DOM boundaries recursively
   *
   * @param selector - CSS selector to find
   * @param root - Root element to start search from (default: document)
   * @returns First matching element or null
   */
  queryDeep(selector: string, root: Document | Element = document): Element | null {
    const queue: (Document | Element | ShadowRoot)[] = [root];

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Try standard querySelector first
      if ('querySelector' in current) {
        const found = current.querySelector(selector);
        if (found) return found;
      }

      // Traverse into shadow roots
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

  /**
   * Query all elements across shadow DOM boundaries
   *
   * @param selector - CSS selector to find
   * @param root - Root element to start search from (default: document)
   * @returns Array of all matching elements
   */
  queryAllDeep(selector: string, root: Document | Element = document): Element[] {
    const results: Element[] = [];
    const queue: (Document | Element | ShadowRoot)[] = [root];

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Collect matches
      if ('querySelectorAll' in current) {
        const matches = Array.from(current.querySelectorAll(selector));
        results.push(...matches);

        // Also traverse into shadow roots
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

  /**
   * Extract text content from element, traversing shadow DOMs
   *
   * @param element - Element to extract text from
   * @returns Trimmed text content
   */
  getTextDeep(element: Element | null): string {
    if (!element) return '';

    let text = element.textContent || '';

    // If element has shadow root, also get its text
    if ((element as any).shadowRoot) {
      const shadowRoot = (element as any).shadowRoot as ShadowRoot;
      const shadowElements = Array.from(shadowRoot.querySelectorAll('*'));
      for (const el of shadowElements) {
        text += ' ' + (el.textContent || '');
      }
    }

    return text.trim();
  },

  /**
   * Safe attribute getter with null handling
   *
   * @param element - Element to get attribute from
   * @param attr - Attribute name
   * @returns Attribute value or null
   */
  getAttr(element: Element | null, attr: string): string | null {
    return element?.getAttribute(attr) || null;
  },

  /**
   * Extract text from iframe content (same-origin only)
   *
   * @param iframe - Iframe element
   * @returns Text content from iframe or null if cross-origin
   */
  getIframeText(iframe: HTMLIFrameElement): string | null {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        return iframeDoc.body?.textContent?.trim() || null;
      }
    } catch (e) {
      // Cross-origin iframe - cannot access
      console.warn('Cannot access cross-origin iframe', e);
    }
    return null;
  },

  /**
   * Parse date from common EHR formats
   *
   * @param dateStr - Date string in various formats
   * @returns ISO date string or null
   */
  parseDate(dateStr: string | null): string | null {
    if (!dateStr) return null;

    // Try common formats: MM/DD/YYYY, Month DD, YYYY, etc.
    const cleaned = dateStr.trim();

    try {
      const date = new Date(cleaned);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
      }
    } catch (e) {
      // Invalid date
    }

    return null;
  },

  /**
   * Extract data from table by headers
   *
   * @param table - Table element
   * @param headers - Array of header names to find
   * @returns Object mapping header names to values
   */
  extractTableData(table: HTMLTableElement, headers: string[]): Record<string, string | null> {
    const result: Record<string, string | null> = {};

    // Find header row
    const headerRow = table.querySelector('thead tr, tr:first-child');
    if (!headerRow) return result;

    const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
    const headerMap = new Map<number, string>();

    // Map column indices to header names
    headerCells.forEach((cell, index) => {
      const text = cell.textContent?.trim().toLowerCase() || '';
      for (const header of headers) {
        if (text.includes(header.toLowerCase())) {
          headerMap.set(index, header);
        }
      }
    });

    // Extract data rows
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

  /**
   * Wait for element to appear (with timeout)
   *
   * @param selector - CSS selector to wait for
   * @param timeoutMs - Timeout in milliseconds (default: 5000)
   * @returns Promise resolving to element or null
   */
  async waitForElement(selector: string, timeoutMs: number = 5000): Promise<Element | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const element = this.queryDeep(selector);
      if (element) return element;

      // Wait 100ms before next check
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return null;
  }
};

// Make EHR_UTILS available globally for AI-generated code
if (typeof window !== 'undefined') {
  (window as any).EHR_UTILS = EHR_UTILS;
}
