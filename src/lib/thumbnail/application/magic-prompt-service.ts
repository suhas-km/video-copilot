/**
 * Magic Prompt Service
 *
 * Uses Gemini to generate high-quality thumbnail prompts by synthesizing
 * transcription data, keyframe analysis, and video metadata.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================================================
// Types
// ============================================================================

/**
 * Video context data for prompt generation
 */
export interface VideoContext {
  /** Transcription text (from Deepgram) */
  transcription?: string;
  /** Keyframe descriptions from vision analysis */
  keyframeDescriptions?: string[];
  /** Video title (for YouTube videos) */
  title?: string;
  /** Video description (for YouTube videos) */
  description?: string;
  /** Video tags (for YouTube videos) */
  tags?: string[];
  /** Video duration in seconds */
  duration?: number;
}

/**
 * Magic prompt generation result
 */
export interface MagicPromptResult {
  /** Generated thumbnail prompt */
  prompt: string;
  /** Key visual elements identified */
  visualElements: string[];
  /** Suggested mood/tone */
  mood: string;
  /** Suggested color scheme */
  colorScheme: string;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ============================================================================
// System Prompt for Gemini
// ============================================================================

const MAGIC_PROMPT_SYSTEM = `You are an expert YouTube thumbnail designer and prompt engineer. Your task is to analyze video content and generate a highly effective image generation prompt for creating click-worthy YouTube thumbnails.

ANALYSIS APPROACH:
1. **Transcript Analysis**: Identify "hooks" - compelling statements, surprising facts, emotional moments, or controversial points that would make viewers curious.
2. **Visual Anchors**: From keyframe descriptions, identify the most visually striking elements, subjects, and compositions.
3. **Branding Alignment**: For YouTube videos, ensure the thumbnail aligns with the video's title, description, and tags.

PROMPT ENGINEERING GUIDELINES:
- Create a descriptive, visual-heavy prompt optimized for high Click-Through Rate (CTR)
- Include specific details about:
  - **Subject/Focus**: What is the main visual element?
  - **Lighting**: Dramatic, soft, neon, natural, etc.
  - **Style**: Photorealistic, illustrated, cinematic, etc.
  - **Composition**: Close-up, wide shot, split-screen, etc.
  - **Mood**: Exciting, shocking, mysterious, inspiring, etc.
  - **Color palette**: Vibrant, dark, warm, cool, contrasting, etc.
- Focus on creating visual curiosity and emotional impact
- Avoid logos, watermarks, or brand names

RESPONSE FORMAT (JSON):
{
  "prompt": "A detailed, visual-heavy prompt for thumbnail generation",
  "visualElements": ["element1", "element2", "element3"],
  "mood": "primary mood/emotion",
  "colorScheme": "suggested color palette"
}`;

// ============================================================================
// Magic Prompt Service
// ============================================================================

/**
 * Magic Prompt Service
 * Generates optimized thumbnail prompts using Gemini AI
 */
export class MagicPromptService {
  private static instance: MagicPromptService;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): MagicPromptService {
    if (!MagicPromptService.instance) {
      MagicPromptService.instance = new MagicPromptService();
    }
    return MagicPromptService.instance;
  }

  /**
   * Generate a magic prompt from video context
   */
  public async generatePrompt(
    context: VideoContext,
    apiKey: string
  ): Promise<MagicPromptResult> {
    const startTime = Date.now();

    // Build the context message for Gemini
    const contextMessage = this.buildContextMessage(context);

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    // Generate the prompt
    const result = await model.generateContent([
      { text: MAGIC_PROMPT_SYSTEM },
      { text: contextMessage },
    ]);

    const response = result.response;
    const text = response.text();

    // Parse the JSON response
    const parsed = this.parseResponse(text);

    return {
      ...parsed,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Build context message from video data
   */
  private buildContextMessage(context: VideoContext): string {
    const parts: string[] = [];

    parts.push("Analyze the following video content and generate an optimized thumbnail prompt:\n");

    // Add YouTube metadata if available
    if (context.title) {
      parts.push(`## Video Title\n${context.title}\n`);
    }

    if (context.description) {
      // Truncate long descriptions
      const desc = context.description.length > 500 
        ? context.description.slice(0, 500) + "..." 
        : context.description;
      parts.push(`## Video Description\n${desc}\n`);
    }

    if (context.tags && context.tags.length > 0) {
      parts.push(`## Video Tags\n${context.tags.join(", ")}\n`);
    }

    // Add transcription for tone/content analysis
    if (context.transcription) {
      // Extract key portions - first 30 seconds and any hooks
      const transcript = this.extractKeyTranscriptParts(context.transcription);
      parts.push(`## Transcript Excerpts (for tone and hooks)\n${transcript}\n`);
    }

    // Add keyframe descriptions for visual anchors
    if (context.keyframeDescriptions && context.keyframeDescriptions.length > 0) {
      parts.push(`## Visual Analysis (from keyframes)\n`);
      context.keyframeDescriptions.forEach((desc, i) => {
        parts.push(`- Frame ${i + 1}: ${desc}`);
      });
      parts.push("");
    }

    // Add duration context
    if (context.duration) {
      const minutes = Math.floor(context.duration / 60);
      const seconds = Math.floor(context.duration % 60);
      parts.push(`## Video Duration\n${minutes}:${seconds.toString().padStart(2, "0")}\n`);
    }

    parts.push("\nNow generate an optimized thumbnail prompt in the specified JSON format.");

    return parts.join("\n");
  }

  /**
   * Extract key parts from transcript for analysis
   */
  private extractKeyTranscriptParts(transcript: string): string {
    // Get first ~500 chars (intro/hook)
    const intro = transcript.slice(0, 500);
    
    // Look for hook patterns
    const hookPatterns = [
      /\b(amazing|incredible|shocking|unbelievable|surprising|secret|revealed|discover|learn|how to|why|what if)\b/gi,
    ];

    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const hookSentences: string[] = [];

    for (const sentence of sentences.slice(0, 20)) {
      for (const pattern of hookPatterns) {
        if (pattern.test(sentence) && hookSentences.length < 5) {
          hookSentences.push(sentence.trim());
          break;
        }
      }
    }

    let result = `### Opening:\n${intro}...\n`;
    
    if (hookSentences.length > 0) {
      result += `\n### Key Hooks:\n${hookSentences.map(s => `- "${s}"`).join("\n")}`;
    }

    return result;
  }

  /**
   * Parse Gemini response into structured result
   */
  private parseResponse(text: string): Omit<MagicPromptResult, "processingTimeMs"> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          prompt: parsed.prompt || this.fallbackPrompt(text),
          visualElements: parsed.visualElements || [],
          mood: parsed.mood || "engaging",
          colorScheme: parsed.colorScheme || "vibrant",
        };
      }
    } catch {
      // JSON parsing failed, extract what we can
    }

    // Fallback: use the text as the prompt
    return {
      prompt: this.fallbackPrompt(text),
      visualElements: [],
      mood: "engaging",
      colorScheme: "vibrant",
    };
  }

  /**
   * Create a fallback prompt from raw text
   */
  private fallbackPrompt(text: string): string {
    // Clean up and use as prompt
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .replace(/\{|\}/g, "")
      .trim();
    
    // Take first 500 chars if too long
    return cleaned.length > 500 ? cleaned.slice(0, 500) : cleaned;
  }
}

// ============================================================================
// Export singleton
// ============================================================================

export const magicPromptService = MagicPromptService.getInstance();
