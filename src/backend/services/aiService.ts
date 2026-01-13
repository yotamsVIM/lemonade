import { ChatBedrockConverse } from '@langchain/aws';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface ExtractionResult {
  success: boolean;
  extractedData?: any;
  error?: string;
  confidence?: number;
}

interface HTMLTruncationStrategy {
  type: 'end' | 'both';
  maxChars: number;
  startChars?: number; // For 'both' strategy
}

/**
 * AI Service for EHR data extraction using AWS Bedrock Claude models
 * Provides common methods for HTML processing, prompt invocation, and response parsing
 */
export class AIService {
  private model: ChatBedrockConverse;

  constructor() {
    const awsRegion = process.env.AWS_REGION || 'us-east-1';
    // Default to Claude 3.5 Sonnet (on-demand) for dev, override in prod with BEDROCK_MODEL_ID
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0';

    console.log('[AIService] Initializing AI Service');
    console.log(`[AIService] AWS Region: ${awsRegion}`);
    console.log(`[AIService] Bedrock Model: ${modelId}`);
    console.log(`[AIService] AWS Profile: ${process.env.AWS_PROFILE || '(default)'}`);

    // AWS SDK will automatically use credentials from AWS_PROFILE environment variable
    this.model = new ChatBedrockConverse({
      model: modelId,
      region: awsRegion,
      temperature: 0.1, // Low temperature for consistent extraction
      maxTokens: 4096
    });

    console.log('[AIService] AI Service initialized successfully');
  }

  /**
   * Extract nested iframe and shadow DOM content from HTML
   * Extracts and decodes content from data-iframe-content and data-shadow-root attributes
   */
  private extractNestedContent(html: string): string {
    const parts: string[] = [];

    // Extract content from data-iframe-content attributes
    const iframeContentRegex = /data-iframe-content="([^"]+)"/g;
    let match;
    while ((match = iframeContentRegex.exec(html)) !== null) {
      parts.push(match[1]);
    }

    // Extract content from data-shadow-root attributes
    const shadowRootRegex = /data-shadow-root="([^"]+)"/g;
    while ((match = shadowRootRegex.exec(html)) !== null) {
      parts.push(match[1]);
    }

    // If nested content found, combine it with original
    if (parts.length > 0) {
      // Decode HTML entities
      const decodedParts = parts.map(part =>
        part.replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
      );
      return html + '\n\n<!-- Nested Frame and Shadow DOM Content -->\n' + decodedParts.join('\n\n');
    }

    return html;
  }

  /**
   * Truncate HTML to fit within AI context window
   * @param html - HTML content to truncate
   * @param strategy - Truncation strategy (end: keep end only, both: keep start + end)
   */
  private truncateHTML(html: string, strategy: HTMLTruncationStrategy): string {
    if (html.length <= strategy.maxChars) {
      return html;
    }

    if (strategy.type === 'end') {
      // Keep only the end (where nested content is stored)
      return html.substring(html.length - strategy.maxChars);
    } else if (strategy.type === 'both' && strategy.startChars) {
      // Keep start (metadata) + end (nested content)
      const endChars = strategy.maxChars - strategy.startChars;
      const start = html.substring(0, strategy.startChars);
      const end = html.substring(html.length - endChars);
      return start + '\n\n<!-- [Middle section truncated] -->\n\n' + end;
    }

    return html;
  }

  /**
   * Parse JSON from AI response content
   * Extracts JSON object from text that may contain additional commentary
   */
  private parseJSONResponse(content: string): any {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse JSON from AI response');
    }
    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Invoke Claude AI model with system and user prompts
   * Common method for all AI extraction operations
   */
  private async invokeAI(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    const startTime = Date.now();

    console.log('[AIService] Invoking Bedrock AI model');
    console.log(`[AIService] System prompt length: ${systemPrompt.length} chars`);
    console.log(`[AIService] User prompt length: ${userPrompt.length} chars`);

    try {
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ];

      console.log('[AIService] Sending request to AWS Bedrock...');
      const response = await this.model.invoke(messages);

      const duration = Date.now() - startTime;
      const responseContent = response.content as string;

      console.log(`[AIService] ✓ Bedrock response received in ${duration}ms`);
      console.log(`[AIService] Response length: ${responseContent.length} chars`);

      return responseContent;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[AIService] ✗ Bedrock invocation failed after ${duration}ms`);
      console.error('[AIService] Error details:', error);

      if (error instanceof Error) {
        console.error(`[AIService] Error message: ${error.message}`);
        console.error(`[AIService] Error stack:`, error.stack);
      }

      throw error;
    }
  }

  /**
   * Extract structured data from HTML snapshot
   * @param html - Raw HTML content from EHR page
   * @param fields - Array of field names to extract
   */
  async extractFromHTML(html: string, fields: string[]): Promise<ExtractionResult> {
    console.log('[AIService] Starting HTML extraction');
    console.log(`[AIService] Input HTML size: ${html.length} bytes`);
    console.log(`[AIService] Fields to extract: ${fields.join(', ')}`);

    try {
      const systemPrompt = `You are an expert medical data extraction system specializing in EHR data.
Extract structured data from EHR HTML snapshots with high accuracy.
The HTML may contain nested iframe content in data-iframe-content attributes and Shadow DOM in data-shadow-root attributes.

IMPORTANT EXTRACTION RULES:
- Patient names often appear in "LastName, FirstName MiddleName" format (e.g., "Marsh, Lola TEST")
- When extracting name fields:
  * firstName: Extract the first name after the comma
  * lastName: Extract the name before the comma
  * middleName: Extract any additional names after the first name (may be full name or initials)
  * fullName: Keep the complete name string exactly as it appears
- Dates may appear in various formats (MM/DD/YYYY, Month DD, YYYY, etc.)
- Extract only data that is clearly present - use null for missing fields
- Return valid JSON format`;

      // Extract nested content from iframes and shadow DOM
      console.log('[AIService] Extracting nested iframe/shadow DOM content...');
      const enrichedHtml = this.extractNestedContent(html);
      console.log(`[AIService] Enriched HTML size: ${enrichedHtml.length} bytes`);

      // Truncate HTML to fit AI context window
      console.log('[AIService] Truncating HTML to fit context window...');
      const htmlToSend = this.truncateHTML(enrichedHtml, {
        type: 'both',
        maxChars: 500000,
        startChars: 100000
      });
      console.log(`[AIService] Final HTML size for AI: ${htmlToSend.length} bytes`);

      const userPrompt = `Extract the following fields from this EHR HTML:
Fields to extract: ${fields.join(', ')}

HTML Content (${enrichedHtml.length} bytes, nested content extracted):
${htmlToSend}

Return a JSON object with the extracted data. Use null for fields not found.
Example format: { "firstName": "John", "lastName": "Doe", "middleName": "M", "fullName": "Doe, John M", "dateOfBirth": "01/15/1980" }`;

      // Invoke AI and parse response
      const content = await this.invokeAI(systemPrompt, userPrompt);

      console.log('[AIService] Parsing JSON response...');
      const extractedData = this.parseJSONResponse(content);
      console.log('[AIService] ✓ Extraction completed successfully');
      console.log('[AIService] Extracted fields:', Object.keys(extractedData).join(', '));

      return {
        success: true,
        extractedData,
        confidence: 0.85 // Could implement confidence scoring
      };
    } catch (error) {
      console.error('[AIService] ✗ Extraction failed');
      console.error('[AIService] Error:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Summarize patient records
   * @param records - Array of patient medical records
   */
  async summarizeRecords(records: any[]): Promise<ExtractionResult> {
    try {
      const systemPrompt = `You are a medical data analyst.
Create concise, accurate summaries of patient medical records.
Focus on key diagnoses, medications, vitals, and trends.`;

      const userPrompt = `Summarize these patient records:

${JSON.stringify(records, null, 2)}

Provide a structured summary with:
- Key Diagnoses
- Current Medications
- Recent Vitals
- Notable Trends or Concerns

Return as JSON.`;

      // Invoke AI and parse response
      const content = await this.invokeAI(systemPrompt, userPrompt);
      const summary = this.parseJSONResponse(content);

      return {
        success: true,
        extractedData: summary,
        confidence: 0.9
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Analyze and classify EHR content
   * @param content - HTML content to analyze
   */
  async analyzeContent(content: string): Promise<ExtractionResult> {
    try {
      const systemPrompt = `You are a medical document classifier.
Analyze EHR content and identify the document type, key entities, and medical concepts.`;

      // Extract nested content for analysis
      const enrichedContent = this.extractNestedContent(content);

      // Truncate to fit context window (prioritize end)
      const contentToAnalyze = this.truncateHTML(enrichedContent, {
        type: 'end',
        maxChars: 100000
      });

      const userPrompt = `Analyze this EHR content:

${contentToAnalyze}

Return JSON with:
{
  "documentType": "visit_note" | "lab_result" | "imaging_report" | "medication_record" | "other",
  "primaryDiagnosis": "string or null",
  "medications": ["array of medication names"],
  "procedures": ["array of procedures"],
  "vitalSigns": { "key": "value" },
  "keyFindings": ["array of key findings"]
}`;

      // Invoke AI and parse response
      const responseContent = await this.invokeAI(systemPrompt, userPrompt);
      const analysis = this.parseJSONResponse(responseContent);

      return {
        success: true,
        extractedData: analysis,
        confidence: 0.85
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Verify extracted data accuracy
   * @param original - Original HTML content
   * @param extracted - Extracted data to verify
   */
  async verifyExtraction(original: string, extracted: any): Promise<ExtractionResult> {
    try {
      const systemPrompt = `You are a medical data quality assurance system.
Verify that extracted data accurately represents the source material.
Flag any inconsistencies or errors.
Be lenient - if the extracted data appears in the HTML at all, mark it as accurate.`;

      // Extract nested content for verification
      const enrichedOriginal = this.extractNestedContent(original);

      // Truncate to fit context window (prioritize end)
      const htmlToVerify = this.truncateHTML(enrichedOriginal, {
        type: 'end',
        maxChars: 150000
      });

      const userPrompt = `Original HTML excerpt (nested content extracted):
${htmlToVerify}

Extracted Data:
${JSON.stringify(extracted, null, 2)}

Verify accuracy and return JSON:
{
  "isAccurate": boolean,
  "confidence": 0.0-1.0,
  "issues": ["array of any issues found"],
  "corrections": { "field": "corrected_value" }
}`;

      // Invoke AI and parse response
      const content = await this.invokeAI(systemPrompt, userPrompt);
      const verification = this.parseJSONResponse(content);

      return {
        success: true,
        extractedData: verification
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

// Export singleton instance
export const aiService = new AIService();
