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
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is required');
    }

    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-pro',
      apiKey,
      temperature: 0.1, // Low temperature for consistent extraction
      maxOutputTokens: 2048
    });
  }

  /**
   * Extract structured data from HTML snapshot
   */
  async extractFromHTML(html: string, fields: string[]): Promise<ExtractionResult> {
    try {
      const systemPrompt = `You are an expert medical data extraction system.
Extract structured data from EHR HTML snapshots.
Focus on accuracy and extract only what is clearly present in the HTML.
Return data in JSON format.`;

      const userPrompt = `Extract the following fields from this EHR HTML:
Fields to extract: ${fields.join(', ')}

HTML Content:
${html.substring(0, 50000)} ${html.length > 50000 ? '...[truncated]' : ''}

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

      const userPrompt = `Analyze this EHR content:

${content.substring(0, 10000)}

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
Flag any inconsistencies or errors.`;

      const userPrompt = `Original HTML excerpt:
${original.substring(0, 5000)}

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
