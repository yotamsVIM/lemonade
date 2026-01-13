/**
 * Code Generator for EHR Data Extraction
 *
 * Uses Claude Bedrock to generate browser-executable JavaScript code
 * that extracts data from EHR HTML based on ground truth examples.
 */

import { ChatBedrockConverse } from '@langchain/aws';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const MAX_HTML_CHARS = 50000; // Limit HTML sent to AI

export interface CodeGenerationOptions {
  htmlBlob: string;
  groundTruth: Record<string, any>;
  previousError?: string | null;
}

export class CodeGenerator {
  private model: ChatBedrockConverse;

  constructor() {
    const awsRegion = process.env.AWS_REGION || 'us-east-1';
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0';

    this.model = new ChatBedrockConverse({
      model: modelId,
      region: awsRegion,
      temperature: 0.1, // Low temperature for deterministic code
      maxTokens: 4096
    });
  }

  /**
   * Generate extraction code from HTML and ground truth
   */
  async generateExtractor(options: CodeGenerationOptions): Promise<string> {
    const { htmlBlob, groundTruth, previousError } = options;

    const systemPrompt = `You are an expert code generator for EHR (Electronic Health Record) data extraction.

Your task is to write browser-executable JavaScript code that extracts data from HTML pages.

CRITICAL REQUIREMENTS:
1. Write ONLY browser-safe JavaScript (no Node.js APIs like 'fs', 'path', etc.)
2. The code runs in page.evaluate() context - you cannot use Playwright selectors
3. You have access to EHR_UTILS global object with these methods:
   - EHR_UTILS.queryDeep(selector) - Query across shadow DOM boundaries
   - EHR_UTILS.queryAllDeep(selector) - Get all matching elements
   - EHR_UTILS.getTextDeep(element) - Extract text from element (handles shadow DOM)
   - EHR_UTILS.getAttr(element, attr) - Safely get attribute value
   - EHR_UTILS.getIframeText(iframe) - Extract text from iframe (same-origin only)
   - EHR_UTILS.parseDate(dateStr) - Parse common date formats
   - EHR_UTILS.extractTableData(table, headers) - Extract data from tables

CODE STRUCTURE:
- You MUST return a function named 'extract' that returns an object
- The function should be self-contained and use try-catch for error handling
- Use EHR_UTILS methods instead of direct DOM queries when possible
- Return null for fields that cannot be found

EXAMPLE OUTPUT:
\`\`\`javascript
function extract() {
  try {
    const patientName = EHR_UTILS.getTextDeep(EHR_UTILS.queryDeep('.patient-name'));
    const dob = EHR_UTILS.getTextDeep(EHR_UTILS.queryDeep('.dob'));

    return {
      patientName: patientName || null,
      dateOfBirth: dob ? EHR_UTILS.parseDate(dob) : null
    };
  } catch (error) {
    console.error('Extraction error:', error);
    return null;
  }
}
\`\`\`

Remember: Keep it simple, handle errors gracefully, and return null for missing data.`;

    // Truncate HTML to fit in context
    const truncatedHTML = htmlBlob.length > MAX_HTML_CHARS
      ? htmlBlob.substring(0, MAX_HTML_CHARS) + '\n\n[...HTML truncated...]'
      : htmlBlob;

    let userPrompt = `Generate extraction code for this EHR page.

EXPECTED OUTPUT (ground truth):
${JSON.stringify(groundTruth, null, 2)}

HTML SAMPLE:
${truncatedHTML}

Generate a JavaScript function named 'extract()' that extracts this data from the HTML.
Return ONLY the function code wrapped in triple backticks with javascript language tag.`;

    if (previousError) {
      userPrompt += `\n\nPREVIOUS ATTEMPT FAILED WITH ERROR:
${previousError}

Please fix the error and generate corrected code. Common issues:
- Using Playwright APIs (page.locator, etc.) - use EHR_UTILS instead
- Not handling null/undefined elements
- Syntax errors
- Using Node.js APIs`;
    }

    try {
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ];

      const response = await this.model.invoke(messages);
      const content = response.content as string;

      // Extract code from markdown code block
      const codeMatch = content.match(/```(?:javascript|js)?\s*\n([\s\S]+?)\n```/);
      if (codeMatch) {
        return codeMatch[1].trim();
      }

      // If no code block found, try to extract function directly
      const functionMatch = content.match(/function\s+extract\s*\([^)]*\)\s*\{[\s\S]+\}/);
      if (functionMatch) {
        return functionMatch[0].trim();
      }

      throw new Error('Could not extract valid JavaScript function from AI response');
    } catch (error) {
      throw new Error(`Code generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate generated code syntax without executing
   */
  validateSyntax(code: string): { valid: boolean; error?: string } {
    try {
      // Use Function constructor to check syntax without executing
      new Function(`return (${code})`);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Syntax error'
      };
    }
  }
}

// Export singleton instance
export const codeGenerator = new CodeGenerator();
