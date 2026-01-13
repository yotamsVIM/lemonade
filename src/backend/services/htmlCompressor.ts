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
      // Load HTML into cheerio
      const $ = cheerio.load(html, {
        xmlMode: false,
        decodeEntities: true
      });

      // Step 1: Remove entire tags (style, script, etc.)
      this.REMOVE_TAGS.forEach(tag => {
        $(tag).remove();
      });

      // Step 2: Strip non-essential attributes from all elements
      $('*').each((_, element) => {
        const $el = $(element);
        const attrs = $el.attr();

        if (attrs) {
          Object.keys(attrs).forEach(attrName => {
            // Remove if not in keep list
            if (!this.shouldKeepAttribute(attrName)) {
              $el.removeAttr(attrName);
            }
          });
        }
      });

      // Step 3: Remove empty elements (but keep structural ones)
      this.removeEmptyElements($);

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
        xmlMode: false,
        decodeEntities: true
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

  /**
   * Remove empty elements that don't contribute to extraction
   * Keep structural elements like div, section, etc. even if empty
   */
  private removeEmptyElements($: cheerio.CheerioAPI): void {
    const structuralTags = ['html', 'body', 'head', 'div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'form', 'table', 'tr', 'td', 'th'];

    $('*').each((_, element) => {
      const $el = $(element);
      const tagName = element.tagName;

      // Don't remove structural elements
      if (structuralTags.includes(tagName)) {
        return;
      }

      // Remove if no text and no meaningful attributes
      const hasText = $el.text().trim().length > 0;
      const hasValue = $el.attr('value')?.trim().length > 0;
      const hasData = Object.keys($el.attr() || {}).some(attr =>
        attr.startsWith('data-') || attr.startsWith('aria-')
      );

      if (!hasText && !hasValue && !hasData) {
        $el.remove();
      }
    });
  }
}

// Export singleton instance
export const htmlCompressor = new HTMLCompressor();
