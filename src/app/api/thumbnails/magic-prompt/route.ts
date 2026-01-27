/**
 * Magic Prompt Generation API Route
 *
 * Generates optimized thumbnail prompts using Gemini AI by synthesizing
 * video transcription, keyframe analysis, and metadata.
 */

import {
  magicPromptService,
  type VideoContext,
} from "@/lib/thumbnail/application/magic-prompt-service";
import { NextRequest, NextResponse } from "next/server";

interface RequestBody {
  /** Transcription text */
  transcription?: string;
  /** Keyframe descriptions */
  keyframeDescriptions?: string[];
  /** Video title (for YouTube) */
  title?: string;
  /** Video description (for YouTube) */
  description?: string;
  /** Video tags (for YouTube) */
  tags?: string[];
  /** Video duration in seconds */
  duration?: number;
  /** Gemini API key */
  geminiApiKey?: string;
}

interface MagicPromptResponse {
  /** Generated prompt */
  prompt: string;
  /** Key visual elements */
  visualElements: string[];
  /** Suggested mood */
  mood: string;
  /** Suggested color scheme */
  colorScheme: string;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Error message if failed */
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const {
      transcription,
      keyframeDescriptions,
      title,
      description,
      tags,
      duration,
      geminiApiKey,
    } = body;

    // Get API key from request or environment
    const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json<{ error: string }>(
        {
          error:
            "Gemini API key is required. Set GEMINI_API_KEY environment variable or provide geminiApiKey in request.",
        },
        { status: 400 }
      );
    }

    // Validate that we have at least some context
    if (!transcription && !keyframeDescriptions?.length && !title && !description) {
      return NextResponse.json<{ error: string }>(
        {
          error:
            "At least one of transcription, keyframeDescriptions, title, or description is required.",
        },
        { status: 400 }
      );
    }

    // Build video context
    const context: VideoContext = {
      transcription,
      keyframeDescriptions,
      title,
      description,
      tags,
      duration,
    };

    // Generate magic prompt
    const result = await magicPromptService.generatePrompt(context, apiKey);

    // Return result
    return NextResponse.json<MagicPromptResponse>({
      prompt: result.prompt,
      visualElements: result.visualElements,
      mood: result.mood,
      colorScheme: result.colorScheme,
      processingTimeMs: result.processingTimeMs,
    });
  } catch (error) {
    console.error("[Magic Prompt API] Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate magic prompt";

    return NextResponse.json<{ error: string }>({ error: errorMessage }, { status: 500 });
  }
}
