/**
 * EHR_UTILS Runtime Library - Browser-ready version
 *
 * This is a pure JavaScript version (no TypeScript) that can be safely
 * evaluated in browser contexts by Playwright's Gauntlet or Chrome extensions.
 *
 * Provides utilities for DOM querying (including Shadow DOM and iframes),
 * text extraction, date parsing, and table data extraction.
 *
 * NOTE: This file must be kept in sync with ehr-utils.ts
 */

window.EHR_UTILS = {
  /**
   * Query for a single element, traversing Shadow DOM boundaries
   * @param {string} selector - CSS selector
   * @param {Document|ShadowRoot} root - Root to start search from
   * @returns {Element|null} Found element or null
   */
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

  /**
   * Query for all matching elements, traversing Shadow DOM boundaries
   * @param {string} selector - CSS selector
   * @param {Document|ShadowRoot} root - Root to start search from
   * @returns {Element[]} Array of matching elements
   */
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

  /**
   * Get text content from element, including Shadow DOM
   * @param {Element} element - Element to extract text from
   * @returns {string} Trimmed text content
   */
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

  /**
   * Safely get attribute value from element
   * @param {Element} element - Element to get attribute from
   * @param {string} attr - Attribute name
   * @returns {string|null} Attribute value or null
   */
  getAttr(element, attr) {
    return element?.getAttribute(attr) || null;
  },

  /**
   * Get text content from iframe
   * @param {HTMLIFrameElement} iframe - Iframe element
   * @returns {string|null} Text content or null
   */
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

  /**
   * Parse date string to ISO format (YYYY-MM-DD)
   * @param {string} dateStr - Date string to parse
   * @returns {string|null} ISO date string or null
   */
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

  /**
   * Extract data from table based on header names
   * @param {HTMLTableElement} table - Table element
   * @param {string[]} headers - Array of header names to look for
   * @returns {Object} Object with extracted data
   */
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

  /**
   * Wait for element to appear on page
   * @param {string} selector - CSS selector to wait for
   * @param {number} timeoutMs - Maximum wait time in milliseconds
   * @returns {Promise<Element|null>} Found element or null
   */
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
