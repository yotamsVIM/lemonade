import { z } from 'zod';
import * as cheerio from 'cheerio';

/**
 * HTMLToolProvider - Provides tools for Claude to read HTML sections
 *
 * Enables tool-based extraction where Claude can iteratively request
 * specific sections of large HTML documents instead of receiving
 * the entire document at once.
 */
export class HTMLToolProvider {
  private htmlContent: string;
  private lines: string[];
  private $: cheerio.CheerioAPI;

  constructor(html: string) {
    this.htmlContent = html;
    this.lines = html.split('\n');

    // Pre-parse HTML for searching
    try {
      this.$ = cheerio.load(html, {
        xmlMode: false,
              });
    } catch (error) {
      console.error('[HTMLToolProvider] Failed to parse HTML:', error);
      // Create empty cheerio instance as fallback
      this.$ = cheerio.load('', { xmlMode: false });
    }
  }

  /**
   * Define tools for Claude to read HTML sections
   * Compatible with LangChain bindTools() API
   */
  getTools() {
    return [
      {
        name: 'read_html_section',
        description: 'Read a specific section of the HTML document by line numbers. Use this to examine specific parts of the HTML after you know where the data is located.',
        schema: z.object({
          start_line: z.number().int().positive().describe('Starting line number (1-indexed)'),
          end_line: z.number().int().positive().describe('Ending line number (inclusive)'),
          reason: z.string().optional().describe('Why you need this section (helps with debugging)')
        })
      },
      {
        name: 'search_html',
        description: 'Search HTML for elements matching a CSS selector. Returns matching elements with their text content and attributes. Use this to find where specific data is located in the HTML.',
        schema: z.object({
          query: z.string().describe('CSS selector (e.g., ".patient-name", "#dob", "input[name=firstName]")'),
          max_results: z.number().int().positive().default(5).describe('Maximum number of results to return (default: 5)')
        })
      },
      {
        name: 'get_html_stats',
        description: 'Get statistics about the HTML document including size, line count, and structure overview. Use this first to understand the document before searching.',
        schema: z.object({})
      },
      {
        name: 'search_html_text',
        description: 'Search for elements containing specific text. Useful for finding labels, headers, or specific data values.',
        schema: z.object({
          search_text: z.string().describe('Text to search for (case-insensitive)'),
          max_results: z.number().int().positive().default(5).describe('Maximum number of results to return')
        })
      }
    ];
  }

  /**
   * Execute a tool call and return the result
   */
  executeTool(toolName: string, args: any): string {
    console.log(`[HTMLToolProvider] Executing tool: ${toolName}`);
    console.log(`[HTMLToolProvider] Args:`, JSON.stringify(args).substring(0, 200));

    try {
      switch (toolName) {
        case 'read_html_section':
          return this.readSection(args.start_line, args.end_line, args.reason);
        case 'search_html':
          return this.searchHTML(args.query, args.max_results || 5);
        case 'get_html_stats':
          return this.getStats();
        case 'search_html_text':
          return this.searchText(args.search_text, args.max_results || 5);
        default:
          return JSON.stringify({
            error: `Unknown tool: ${toolName}`,
            available_tools: ['read_html_section', 'search_html', 'get_html_stats', 'search_html_text']
          });
      }
    } catch (error) {
      console.error(`[HTMLToolProvider] Tool ${toolName} failed:`, error);
      return JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        tool: toolName
      });
    }
  }

  /**
   * Read a specific section of HTML by line numbers
   */
  private readSection(start: number, end: number, reason?: string): string {
    if (reason) {
      console.log(`[HTMLToolProvider] Reading lines ${start}-${end}: ${reason}`);
    }

    // Validate line numbers
    if (start < 1 || end < start || end > this.lines.length) {
      return JSON.stringify({
        error: `Invalid line range: ${start}-${end}`,
        total_lines: this.lines.length,
        valid_range: `1-${this.lines.length}`
      });
    }

    const section = this.lines.slice(start - 1, end).join('\n');
    const charCount = section.length;

    console.log(`[HTMLToolProvider] Returned ${charCount} characters`);

    return JSON.stringify({
      start_line: start,
      end_line: end,
      line_count: end - start + 1,
      char_count: charCount,
      content: section
    }, null, 2);
  }

  /**
   * Search HTML using CSS selector
   */
  private searchHTML(query: string, maxResults: number): string {
    console.log(`[HTMLToolProvider] Searching for: ${query}`);

    try {
      const results: any[] = [];
      const elements = this.$(query).slice(0, maxResults);

      elements.each((index, element) => {
        const $el = this.$(element);
        const tagName = (element as any).tagName || (element as any).name || 'unknown';
        const text = $el.text().trim();
        const html = $el.html() || '';

        // Get important attributes
        const attrs: Record<string, string> = {};
        const attrNames = ['id', 'name', 'class', 'value', 'type', 'href', 'aria-label', 'title'];
        attrNames.forEach(attr => {
          const value = $el.attr(attr);
          if (value) {
            attrs[attr] = value;
          }
        });

        results.push({
          index: index + 1,
          tag: tagName,
          text: text.length > 200 ? text.substring(0, 200) + '...' : text,
          attributes: attrs,
          html_preview: html.length > 300 ? html.substring(0, 300) + '...' : html
        });
      });

      console.log(`[HTMLToolProvider] Found ${results.length} results`);

      return JSON.stringify({
        query,
        found: results.length,
        max_results: maxResults,
        results
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query
      });
    }
  }

  /**
   * Search for elements containing specific text
   * WARNING: This can be slow on large DOMs. Use CSS selectors when possible.
   */
  private searchText(searchText: string, maxResults: number): string {
    console.log(`[HTMLToolProvider] Searching text: ${searchText}`);

    try {
      const results: any[] = [];
      const lowerSearch = searchText.toLowerCase();

      // Optimization: Use :contains selector if cheerio supports it, otherwise manual search
      // For large DOMs, limit search to likely containers
      const searchScopes = ['body', 'form', 'table', 'main', 'article'];
      let elementsChecked = 0;
      const maxElementsToCheck = 5000; // Safety limit

      for (const scope of searchScopes) {
        if (results.length >= maxResults) break;

        this.$(scope).find('*').each((_, element) => {
          if (results.length >= maxResults || elementsChecked >= maxElementsToCheck) {
            return false; // Stop early
          }

          elementsChecked++;
          const $el = this.$(element);

          // Get own text only (not children) for efficiency
          const ownText = $el.contents().filter(function() {
            return (this as any).type === 'text';
          }).text();

          if (ownText.toLowerCase().includes(lowerSearch)) {
            const tagName = (element as any).tagName || (element as any).name || 'unknown';

            results.push({
              tag: tagName,
              text: ownText.trim().length > 200 ? ownText.trim().substring(0, 200) + '...' : ownText.trim(),
              id: $el.attr('id'),
              class: $el.attr('class'),
              html_preview: $el.html()?.substring(0, 200)
            });
          }
        });
      }

      console.log(`[HTMLToolProvider] Checked ${elementsChecked} elements, found ${results.length} results`);

      console.log(`[HTMLToolProvider] Found ${results.length} elements with text "${searchText}"`);

      return JSON.stringify({
        search_text: searchText,
        found: results.length,
        results
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: `Text search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        search_text: searchText
      });
    }
  }

  /**
   * Get document statistics
   */
  private getStats(): string {
    const totalLines = this.lines.length;
    const sizeBytes = Buffer.byteLength(this.htmlContent, 'utf-8');
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

    // Count elements
    const elementCount = this.$('*').length;
    const formCount = this.$('form').length;
    const inputCount = this.$('input').length;
    const tableCount = this.$('table').length;

    // Find potential data sections
    const potentialDataSections: string[] = [];

    // Look for common EHR patterns
    const patterns = [
      { selector: '[data-testid*="patient"]', label: 'Patient data elements' },
      { selector: '[id*="patient"], [id*="demographics"]', label: 'Patient ID elements' },
      { selector: 'input[name*="name"], input[name*="dob"]', label: 'Name/DOB inputs' },
      { selector: '[class*="patient"], [class*="demographic"]', label: 'Patient classes' },
      { selector: 'table', label: 'Tables (may contain data)' }
    ];

    patterns.forEach(({ selector, label }) => {
      const count = this.$(selector).length;
      if (count > 0) {
        potentialDataSections.push(`${label}: ${count} found`);
      }
    });

    const stats = {
      document: {
        total_lines: totalLines,
        size_bytes: sizeBytes,
        size_mb: sizeMB
      },
      structure: {
        total_elements: elementCount,
        forms: formCount,
        inputs: inputCount,
        tables: tableCount
      },
      potential_data_sections: potentialDataSections,
      tips: [
        'Use search_html() to find specific elements by CSS selector',
        'Use search_html_text() to find elements containing specific text',
        'Use read_html_section() to examine specific line ranges',
        'Start with broad searches, then narrow down to specific elements'
      ]
    };

    console.log(`[HTMLToolProvider] Stats: ${totalLines} lines, ${sizeMB}MB, ${elementCount} elements`);

    return JSON.stringify(stats, null, 2);
  }
}
