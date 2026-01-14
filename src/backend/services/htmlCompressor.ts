import * as cheerio from 'cheerio';

export interface CompressionResult {
  compressedHTML: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * HTMLCompressor - Strip non-semantic content while preserving extractable data
 *
 * Removes styles, scripts, classes, and non-essential attributes
 * while keeping all text content and EHR-specific data attributes
 */
export class HTMLCompressor {
  // Attributes to preserve (critical for extraction)
  private readonly KEEP_ATTRIBUTES = [
    'id',
    'name',
    'value',
    'type',
    'placeholder',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'title',
    'alt',
    'href',
    'src',
    'data-iframe-content',  // EHR-specific: iframe content
    'data-shadow-root',     // EHR-specific: shadow DOM content
    'data-testid'           // Helpful for debugging
  ];

  // Tags to remove entirely
  private readonly REMOVE_TAGS = [
    'style',
    'script',
    'noscript',
    'link',      // CSS links
    'meta',      // Metadata
    'svg',       // Large and not extractable
    'canvas',    // Not extractable
    'iframe'     // Content already in data-iframe-content
  ];

  /**
   * Compress HTML by removing non-semantic content
   *
   * @param html - Raw HTML content
   * @returns Compression result with stats
   */
  compress(html: string): CompressionResult {
    const originalSize = Buffer.byteLength(html, 'utf-8');

    console.log('[HTMLCompressor] Starting compression');
    console.log(`[HTMLCompressor] Original size: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);

    try {
      const startTime = Date.now();

      // Load HTML into cheerio
      const $ = cheerio.load(html, {
        xmlMode: false
      });

      const loadTime = Date.now() - startTime;
      console.log(`[HTMLCompressor] Parsed HTML in ${loadTime}ms`);

      // Step 1: Remove entire tags (style, script, etc.)
      this.REMOVE_TAGS.forEach(tag => {
        // Special handling for iframes: preserve those with data-iframe-content
        if (tag === 'iframe') {
          // Remove iframes WITHOUT data-iframe-content attribute
          $('iframe:not([data-iframe-content])').remove();
        } else {
          $(tag).remove();
        }
      });

      // Step 2: Strip non-essential attributes (fast pass)
      const cleanupStartTime = Date.now();
      let elementsProcessed = 0;

      $('*').each((_, element) => {
        elementsProcessed++;
        const $el = $(element);

        // Strip non-essential attributes
        const attrs = $el.attr();
        if (attrs) {
          Object.keys(attrs).forEach(attrName => {
            if (!this.shouldKeepAttribute(attrName)) {
              $el.removeAttr(attrName);
            }
          });
        }
      });

      const cleanupTime = Date.now() - cleanupStartTime;
      console.log(`[HTMLCompressor] Processed ${elementsProcessed} elements in ${cleanupTime}ms`);

      // Step 3: Skip empty element removal (too expensive, minimal benefit)
      // Empty elements have negligible impact on token count
      // Removing them requires calling .text() on every element which is very slow

      // Step 4: Serialize back to HTML
      const compressedHTML = $.html();
      const compressedSize = Buffer.byteLength(compressedHTML, 'utf-8');
      const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

      console.log(`[HTMLCompressor] Compressed size: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`[HTMLCompressor] Compression ratio: ${compressionRatio.toFixed(1)}%`);

      return {
        compressedHTML,
        originalSize,
        compressedSize,
        compressionRatio
      };
    } catch (error) {
      console.error('[HTMLCompressor] Compression failed:', error);
      // Return original HTML if compression fails
      return {
        compressedHTML: html,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 0
      };
    }
  }

  /**
   * More aggressive compression: extract only text content and minimal structure
   *
   * @param html - Raw HTML content
   * @returns Plain text with minimal structure
   */
  extractTextOnly(html: string): string {
    try {
      const $ = cheerio.load(html, {
        xmlMode: false
      });

      // Remove all non-text elements
      $('style, script, svg, canvas, iframe').remove();

      // Extract text from body
      const textContent = $('body').text();

      // Normalize whitespace
      return textContent
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();
    } catch (error) {
      console.error('[HTMLCompressor] Text extraction failed:', error);
      return html;
    }
  }

  /**
   * Check if an attribute should be kept
   */
  private shouldKeepAttribute(attrName: string): boolean {
    // Keep exact matches
    if (this.KEEP_ATTRIBUTES.includes(attrName)) {
      return true;
    }

    // Keep all data-* attributes (might contain important EHR data)
    if (attrName.startsWith('data-')) {
      return true;
    }

    // Keep aria-* attributes (accessibility info often contains labels)
    if (attrName.startsWith('aria-')) {
      return true;
    }

    return false;
  }

}

// Export singleton instance
export const htmlCompressor = new HTMLCompressor();
