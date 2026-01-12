import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface ExtractionResult {
  success: boolean;
  extractedData?: any;
  error?: string;
  confidence?: number;
}

export class AIService {
  private model: ChatGoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || 'dummy_key';

    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      temperature: 0.1, // Low temperature for consistent extraction
      maxOutputTokens: 2048
    });
  }

  /**
   * Extract nested iframe and shadow DOM content from HTML
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
   * Extract structured data from HTML snapshot
   */
  async extractFromHTML(html: string, fields: string[]): Promise<ExtractionResult> {
    try {
      const systemPrompt = `You are an expert medical data extraction system.
Extract structured data from EHR HTML snapshots.
Focus on accuracy and extract only what is clearly present in the HTML.
The HTML may contain nested iframe content in data-iframe-content attributes and Shadow DOM in data-shadow-root attributes.
Return data in JSON format.`;

      // Extract nested content from iframes and shadow DOM
      const enrichedHtml = this.extractNestedContent(html);

      // Gemini 2.5 Flash supports up to 1M tokens (~750K characters)
      // Prioritize the end of the HTML where nested content is stored
      const maxChars = 500000;
      let htmlToSend = enrichedHtml;

      if (enrichedHtml.length > maxChars) {
        // Take last 400K chars (where nested content is) + first 100K chars (metadata)
        const start = enrichedHtml.substring(0, 100000);
        const end = enrichedHtml.substring(enrichedHtml.length - 400000);
        htmlToSend = start + '\n\n<!-- [Middle section truncated] -->\n\n' + end;
      }

      const userPrompt = `Extract the following fields from this EHR HTML:
Fields to extract: ${fields.join(', ')}

HTML Content (${enrichedHtml.length} bytes, nested content extracted):
${htmlToSend}

Return a JSON object with the extracted data. Use null for fields not found.
Format: { "field_name": "extracted_value", ... }`;

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ];

      const response = await this.model.invoke(messages);
      const content = response.content as string;

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: 'Failed to parse JSON from AI response'
        };
      }

      const extractedData = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        extractedData,
        confidence: 0.85 // Could implement confidence scoring
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Summarize patient records
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

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ];

      const response = await this.model.invoke(messages);
      const content = response.content as string;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: 'Failed to parse summary from AI response'
        };
      }

      const summary = JSON.parse(jsonMatch[0]);

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
   */
  async analyzeContent(content: string): Promise<ExtractionResult> {
    try {
      const systemPrompt = `You are a medical document classifier.
Analyze EHR content and identify the document type, key entities, and medical concepts.`;

      // Extract nested content for analysis too
      const enrichedContent = this.extractNestedContent(content);

      // Use more context for analysis
      const maxChars = 100000;
      let contentToAnalyze = enrichedContent;

      if (enrichedContent.length > maxChars) {
        // Prioritize end where nested content is stored
        contentToAnalyze = enrichedContent.substring(Math.max(0, enrichedContent.length - maxChars));
      }

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

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ];

      const response = await this.model.invoke(messages);
      const responseContent = response.content as string;

      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: 'Failed to parse analysis from AI response'
        };
      }

      const analysis = JSON.parse(jsonMatch[0]);

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
   */
  async verifyExtraction(original: string, extracted: any): Promise<ExtractionResult> {
    try {
      const systemPrompt = `You are a medical data quality assurance system.
Verify that extracted data accurately represents the source material.
Flag any inconsistencies or errors.
Be lenient - if the extracted data appears in the HTML at all, mark it as accurate.`;

      // Extract nested content for verification
      const enrichedOriginal = this.extractNestedContent(original);

      // Use more context for verification - include area where data was found
      const maxChars = 150000;
      let htmlToVerify = enrichedOriginal;

      if (enrichedOriginal.length > maxChars) {
        // Take last 150K chars where nested content is stored
        htmlToVerify = enrichedOriginal.substring(enrichedOriginal.length - maxChars);
      }

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

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ];

      const response = await this.model.invoke(messages);
      const content = response.content as string;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: 'Failed to parse verification from AI response'
        };
      }

      const verification = JSON.parse(jsonMatch[0]);

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
