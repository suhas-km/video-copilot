/**
 * Gemini Thumbnail Generation API Route
 *
 * Generates YouTube thumbnails using Google Gemini AI.
 */

import {
  geminiThumbnailService,
  type GeminiThumbnailRequest,
} from "@/lib/thumbnail/application/gemini-thumbnail-service";
import type { ThumbnailOptions } from "@/lib/thumbnail/application/gemini-prompt-builder";
import { NextRequest, NextResponse } from "next/server";

interface RequestBody {
  options?: ThumbnailOptions;
  videoId?: string;
  geminiApiKey?: string;
}

interface ThumbnailResponse {
  id: string;
  imageData: string;
  width: number;
  height: number;
  model: string;
  strategy: string;
  latencyMs: number;
  seed: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const { options, geminiApiKey } = body;

    // Get API key from request or environment
    const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json<{ error: string }>(
        { error: "Gemini API key is required. Set GEMINI_API_KEY environment variable or provide geminiApiKey in request." },
        { status: 400 }
      );
    }

    // Initialize service with API key
    try {
      geminiThumbnailService.initialize(apiKey);
    } catch (initError) {
      // Already initialized, that's fine
      if (!(initError instanceof Error && initError.message.includes("already"))) {
        // Re-initialize with new key if different
        geminiThumbnailService.initialize(apiKey);
      }
    }

    // Build request
    const thumbnailRequest: GeminiThumbnailRequest = {
      description: options?.description,
      titleText: options?.titleText,
      videoTitle: options?.videoTitle,
      videoDescription: options?.videoDescription,
      options,
    };

    // Generate thumbnail
    const result = await geminiThumbnailService.generateThumbnail(thumbnailRequest);

    // Return result
    return NextResponse.json<ThumbnailResponse>({
      id: result.id,
      imageData: result.imageData,
      width: result.width,
      height: result.height,
      model: result.model,
      strategy: result.strategy,
      latencyMs: result.latencyMs,
      seed: result.seed,
    });
  } catch (error) {
    console.error("[Gemini Thumbnail API] Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Failed to generate thumbnail";

    return NextResponse.json<{ error: string }>(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
