/**
 * Code Generator for EHR Data Extraction
 *
 * Uses Claude Bedrock to generate browser-executable JavaScript code
 * that extracts data from EHR HTML based on ground truth examples.
 */

import { ChatBedrockConverse } from '@langchain/aws';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { htmlCompressor } from '../backend/services/htmlCompressor';
import { HTMLToolProvider } from '../backend/services/htmlTools';

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
   * Generate extraction code from HTML and ground truth using tool-based HTML exploration
   */
  async generateExtractor(options: CodeGenerationOptions): Promise<string> {
    const { htmlBlob, groundTruth, previousError } = options;

    console.log('[CodeGenerator] Starting code generation with tool-based approach');
    console.log(`[CodeGenerator] HTML size: ${(htmlBlob.length / 1024 / 1024).toFixed(2)}MB`);
    console.log(`[CodeGenerator] Ground truth fields: ${Object.keys(groundTruth).join(', ')}`);

    // Step 1: Compress HTML to remove non-semantic content
    console.log('[CodeGenerator] Compressing HTML...');
    const { compressedHTML, compressionRatio } = htmlCompressor.compress(htmlBlob);
    console.log(`[CodeGenerator] Compression: ${compressionRatio.toFixed(1)}% reduction`);

    // Step 2: Set up HTML tools for Claude to explore
    const toolProvider = new HTMLToolProvider(compressedHTML);
    const tools = toolProvider.getTools();

    // Bind tools to the model
    const modelWithTools = this.model.bindTools(tools);

    const systemPrompt = `You are an expert code generator for EHR (Electronic Health Record) data extraction.

You have tools to explore the HTML structure:
- get_html_stats: Get document statistics and potential data sections
- search_html: Search for elements by CSS selector
- search_html_text: Search for elements containing specific text
- read_html_section: Read specific line ranges

STRATEGY FOR CODE GENERATION:
1. First, get HTML stats to understand the document structure
2. Search for elements related to the ground truth fields (e.g., search for "patient name", "date of birth")
3. Once you find the right selectors, generate extraction code targeting those elements
4. Use the tools to explore, but generate code based on what you find

Your task is to write browser-executable JavaScript code that extracts data from HTML pages.

CRITICAL REQUIREMENTS:
1. Write ONLY browser-safe JavaScript (no Node.js APIs like 'fs', 'path', etc.)
2. The code runs in page.evaluate() context - you cannot use Playwright selectors
3. You have access to EHR_UTILS global object with these methods:
   - EHR_UTILS.queryDeep(selector) - Query across shadow DOM boundaries (EXPENSIVE - use sparingly!)
   - EHR_UTILS.queryAllDeep(selector) - Get all matching elements (EXPENSIVE)
   - EHR_UTILS.getTextDeep(element) - Extract text from element (handles shadow DOM)
   - EHR_UTILS.getAttr(element, attr) - Safely get attribute value
   - EHR_UTILS.getIframeText(iframe) - Extract text from iframe (same-origin only)
   - EHR_UTILS.parseDate(dateStr) - Parse common date formats
   - EHR_UTILS.extractTableData(table, headers) - Extract data from tables

CODE STRUCTURE:
- You MUST return a function named 'extract' that returns an object
- The function should be self-contained and use try-catch for error handling
- Return null for fields that cannot be found

PERFORMANCE OPTIMIZATION (CRITICAL):
1. **Avoid excessive queryDeep calls** - queryDeep is EXPENSIVE as it recursively traverses all shadow DOM boundaries
2. **Find the container first** - Identify the main content frame/shadow root ONCE, then query within it:
   \`\`\`javascript
   // GOOD: Find the frame first, then query locally (fast)
   const contentFrame = document.querySelector('#main-content-frame');
   const firstName = contentFrame?.querySelector('.first-name')?.textContent?.trim();
   const lastName = contentFrame?.querySelector('.last-name')?.textContent?.trim();

   // BAD: Don't use queryDeep repeatedly for every field (very slow!)
   const firstName = EHR_UTILS.queryDeep('.first-name');  // Scans entire DOM tree
   const lastName = EHR_UTILS.queryDeep('.last-name');    // Scans entire DOM tree again
   const address = EHR_UTILS.queryDeep('.address');       // Scans entire DOM tree again!
   \`\`\`

3. **Performance strategy**:
   - Step 1: Use queryDeep() ONCE to find the correct iframe/shadow root container
   - Step 2: Use standard querySelector() within that container for all fields
   - Step 3: Only use queryDeep() again if elements are truly in nested shadow DOM

\`\`\`javascript
function extract() {
  try {
    // STEP 1: Find the correct container ONCE (use queryDeep if needed)
    const contentFrame = EHR_UTILS.queryDeep('#main-content, .patient-details-container');

    // STEP 2: Query WITHIN that frame using standard DOM (fast!)
    const firstName = contentFrame?.querySelector('.first-name')?.textContent?.trim() || null;
    const lastName = contentFrame?.querySelector('.last-name')?.textContent?.trim() || null;
    const dob = contentFrame?.querySelector('.dob')?.textContent?.trim() || null;

    return { firstName, lastName, dateOfBirth: dob };
  } catch (error) {
    console.error('Extraction error:', error);
    return null;
  }
}
\`\`\`

NAME EXTRACTION BEST PRACTICES:
1. **Prefer Separated Fields**: ALWAYS look for individual firstName, lastName, middleName fields FIRST
   - Check for selectors: .first-name, .last-name, .middle-name, [data-first-name], etc.
   - Separated fields are more reliable than parsing full names
   - Many names have multiple middle names or compound last names (e.g., "María José García López")

2. **Avoid Manual Name Parsing**: If only fullName is available, DO NOT write custom parsing logic
   - Names are complex: prefixes (Dr., Mr.), suffixes (Jr., III), hyphens, apostrophes
   - Multiple middle names, compound last names
   - Different cultures have different name orders

3. **Name Parser Utility**: If you must parse a full name, use this helper:
\`\`\`javascript
function parseFullName(fullName) {
  if (!fullName) return { firstName: null, middleName: null, lastName: null };

  // Handle "LastName, FirstName MiddleName" format
  if (fullName.includes(',')) {
    const [lastName, rest] = fullName.split(',').map(s => s.trim());
    const parts = rest.split(/\\s+/);
    return {
      firstName: parts[0] || null,
      middleName: parts.slice(1).join(' ') || null,
      lastName: lastName
    };
  }

  // Handle "FirstName MiddleName LastName" format
  const parts = fullName.trim().split(/\\s+/);
  if (parts.length === 1) return { firstName: parts[0], middleName: null, lastName: null };
  if (parts.length === 2) return { firstName: parts[0], middleName: null, lastName: parts[1] };

  // For 3+ parts: first is firstName, last is lastName, everything else is middleName
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1]
  };
}
\`\`\`

4. **Name Extraction Priority**:
   - ✅ Best: Separated fields (firstName, lastName, middleName elements)
   - ✅ Good: Use parseFullName() helper for full name parsing
   - ❌ Avoid: Custom name parsing logic (too complex, error-prone)

Remember:
- Performance: Find frame once, query within it (fast) > queryDeep for every field (slow)
- Names: Separated fields > parseFullName helper > manual parsing (avoid)
- Keep it simple, handle errors gracefully, return null for missing data`;

    let userPrompt = `Generate extraction code for this EHR page.

EXPECTED OUTPUT (ground truth):
${JSON.stringify(groundTruth, null, 2)}

Use the HTML exploration tools to:
1. Get document stats to understand structure
2. Search for elements containing the ground truth values or related labels
3. Identify the right CSS selectors
4. Generate extraction code targeting those selectors

Once you've explored the HTML and found the right elements, generate a JavaScript function named 'extract()' that extracts this data.
Return the function code wrapped in triple backticks with javascript language tag.`;

    if (previousError) {
      userPrompt += `\n\nPREVIOUS ATTEMPT FAILED WITH ERROR:
${previousError}

Please fix the error and generate corrected code. Common issues:
- Using Playwright APIs (page.locator, etc.) - use document.querySelector or EHR_UTILS instead
- Not handling null/undefined elements
- Syntax errors
- Using Node.js APIs
- Expensive repeated queryDeep calls - find the container ONCE, then query locally
- Complex manual name parsing - prefer separated fields or use the parseFullName helper`;
    }

    try {
      // Iterative tool-based exploration
      const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ];

      let iterationsLeft = 10; // Max iterations to prevent infinite loops (increased for complex HTML)
      let generatedCode: string | null = null;

      console.log('[CodeGenerator] Starting iterative HTML exploration...');

      while (iterationsLeft > 0 && !generatedCode) {
        console.log(`[CodeGenerator] Iteration ${11 - iterationsLeft}/10`);

        const response = await modelWithTools.invoke(messages);
        const content = response.content as string;
        const toolCalls = (response as any).tool_calls || [];

        // Add AI response to message history
        messages.push(new AIMessage({
          content,
          tool_calls: toolCalls
        }));

        // Check if AI generated code (no more tool calls)
        if (toolCalls.length === 0) {
          console.log('[CodeGenerator] No tool calls, checking for generated code...');

          // Extract code from markdown code block
          const codeMatch = content.match(/```(?:javascript|js)?\s*\n([\s\S]+?)\n```/);
          if (codeMatch) {
            generatedCode = codeMatch[1].trim();
            console.log('[CodeGenerator] ✓ Code extracted from response');
            break;
          }

          // If no code block found, try to extract function directly
          const functionMatch = content.match(/function\s+extract\s*\([^)]*\)\s*\{[\s\S]+\}/);
          if (functionMatch) {
            generatedCode = functionMatch[0].trim();
            console.log('[CodeGenerator] ✓ Function extracted from response');
            break;
          }

          // No code found, prompt for code
          console.log('[CodeGenerator] No code found, prompting for code generation...');
          messages.push(new HumanMessage(
            'You have explored the HTML structure. Now generate the JavaScript extract() function based on your findings. ' +
            'Look for input elements with name attributes or value attributes that match the ground truth data. ' +
            'Return ONLY the function code wrapped in triple backticks with the javascript language tag.'
          ));
        } else {
          // Execute tool calls
          console.log(`[CodeGenerator] Executing ${toolCalls.length} tool call(s)...`);

          for (const toolCall of toolCalls) {
            const toolName = toolCall.name;
            const toolArgs = toolCall.args;
            const toolCallId = toolCall.id;

            console.log(`[CodeGenerator] Tool: ${toolName}`);

            try {
              const toolResult = toolProvider.executeTool(toolName, toolArgs);
              messages.push(new ToolMessage({
                content: toolResult,
                tool_call_id: toolCallId
              }));
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              console.error(`[CodeGenerator] Tool ${toolName} failed: ${errorMsg}`);
              messages.push(new ToolMessage({
                content: JSON.stringify({ error: errorMsg }),
                tool_call_id: toolCallId
              }));
            }
          }

          // After 5 exploration iterations, nudge Claude to generate code
          if (iterationsLeft === 5) {
            console.log('[CodeGenerator] Nudging AI to generate code after exploration...');
            messages.push(new HumanMessage(
              'You\'ve explored the HTML. Now please generate the extract() function based on what you found. ' +
              'Remember to look for <input> elements with name and value attributes.'
            ));
          }
        }

        iterationsLeft--;
      }

      if (!generatedCode) {
        throw new Error('Failed to generate code after maximum iterations');
      }

      console.log('[CodeGenerator] ✓ Code generation complete');
      return generatedCode;
    } catch (error) {
      console.error('[CodeGenerator] ✗ Code generation failed:', error);
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
