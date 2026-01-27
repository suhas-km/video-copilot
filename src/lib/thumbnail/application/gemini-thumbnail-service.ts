/**
 * Gemini Thumbnail Service
 *
 * Main service for thumbnail generation using Google Gemini.
 * Provides automatic fallback between Pro and Flash models.
 */

import { randomUUID } from "crypto";
import type {
  InferenceProviderPort,
  ProviderStatus,
  ThumbnailCachePort,
  ThumbnailResult,
} from "../domain";
import { APIKeyMissingError, CACHE_CONFIG, VALIDATION_RULES, redactPrompt } from "../domain";
import { CacheFactory, GeminiAdapterFactory, GEMINI_IMAGE_CONFIG } from "../infrastructure";
import {
  buildGeminiThumbnailPrompt,
  buildSimplePrompt,
  type ThumbnailOptions,
} from "./gemini-prompt-builder";

// ============================================================================
// Types
// ============================================================================

/**
 * Request for Gemini thumbnail generation
 */
export interface GeminiThumbnailRequest {
  /** Unique request identifier */
  id?: string;
  /** Free-form description of what the user wants */
  description?: string;
  /** Title text to include in thumbnail */
  titleText?: string;
  /** Video title for context */
  videoTitle?: string;
  /** Video description for context */
  videoDescription?: string;
  /** Thumbnail generation options */
  options?: ThumbnailOptions;
  /** Random seed for reproducibility */
  seed?: number;
}

// ============================================================================
// Gemini Thumbnail Service Implementation
// ============================================================================

/**
 * Gemini thumbnail generation service
 */
export class GeminiThumbnailService {
  private static instance: GeminiThumbnailService;
  private apiKey: string | null = null;
  private cache: ThumbnailCachePort;
  private proProvider: InferenceProviderPort | null = null;
  private flashProvider: InferenceProviderPort | null = null;

  private constructor() {
    this.cache = CacheFactory.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): GeminiThumbnailService {
    if (!GeminiThumbnailService.instance) {
      GeminiThumbnailService.instance = new GeminiThumbnailService();
    }
    return GeminiThumbnailService.instance;
  }

  /**
   * Initialize service with API key
   */
  public initialize(apiKey?: string): void {
    const key = apiKey || process.env.GEMINI_API_KEY;

    if (!key || key.trim().length === 0) {
      throw new APIKeyMissingError("Gemini");
    }

    this.apiKey = key.trim();

    // Initialize providers
    this.proProvider = GeminiAdapterFactory.getPro(this.apiKey);
    this.flashProvider = GeminiAdapterFactory.getFlash(this.apiKey);
  }

  /**
   * Check if service is initialized
   */
  public isInitialized(): boolean {
    return this.apiKey !== null && this.proProvider !== null && this.flashProvider !== null;
  }

  /**
   * Ensure service is initialized, throw if not
   */
  private ensureInitialized(): void {
    if (!this.isInitialized()) {
      throw new APIKeyMissingError("Gemini. Call initialize() first.");
    }
  }

  /**
   * Generate thumbnail with automatic fallback
   */
  public async generateThumbnail(request: GeminiThumbnailRequest): Promise<ThumbnailResult> {
    this.ensureInitialized();

    // Build the prompt
    const prompt = this.buildPrompt(request);

    // Generate cache key
    const cacheKey = this.calculateCacheKey(prompt, request.seed);

    // Check cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Try pro provider first, then fallback to flash
    let result: ThumbnailResult;

    try {
      result = await this.generateWithProvider(request, prompt, this.proProvider!, "SPECIALIZED");
    } catch (error) {
      console.warn("[GeminiThumbnailService] Pro model failed, falling back to Flash:", {
        error: error instanceof Error ? error.message : String(error),
        model: this.proProvider?.getModelName(),
      });
      // Use fallback if pro fails
      result = await this.generateWithProvider(request, prompt, this.flashProvider!, "FALLBACK");
    }

    // Cache the result
    await this.cache.set(cacheKey, result, CACHE_CONFIG.DEFAULT_TTL_MS);

    return result;
  }

  /**
   * Build prompt from request
   */
  private buildPrompt(request: GeminiThumbnailRequest): string {
    // If options are provided, use the full prompt builder
    if (request.options) {
      return buildGeminiThumbnailPrompt({
        ...request.options,
        description: request.description || request.options.description,
        titleText: request.titleText || request.options.titleText,
        videoTitle: request.videoTitle || request.options.videoTitle,
        videoDescription: request.videoDescription || request.options.videoDescription,
      });
    }

    // Otherwise use simple prompt
    return buildSimplePrompt(request.description || "eye-catching thumbnail", request.titleText);
  }

  /**
   * Generate using a specific provider
   */
  private async generateWithProvider(
    request: GeminiThumbnailRequest,
    prompt: string,
    provider: InferenceProviderPort,
    strategy: "SPECIALIZED" | "FALLBACK"
  ): Promise<ThumbnailResult> {
    const startTime = Date.now();
    const seed = request.seed ?? Math.floor(Math.random() * VALIDATION_RULES.MAX_SEED);

    // Call provider
    const imageData = await provider.textToImage({
      prompt,
      negative_prompt: "", // Gemini doesn't use negative prompts the same way
      width: GEMINI_IMAGE_CONFIG.DEFAULT_WIDTH,
      height: GEMINI_IMAGE_CONFIG.DEFAULT_HEIGHT,
      guidance_scale: 7.5, // Not used by Gemini but required by interface
      num_inference_steps: 30, // Not used by Gemini but required by interface
      seed,
    });

    const latencyMs = Date.now() - startTime;

    // Build result
    return {
      id: randomUUID(),
      requestId: request.id || randomUUID(),
      imageData: `data:${imageData.mimeType};base64,${imageData.base64}`,
      width: imageData.width,
      height: imageData.height,
      model: provider.getModelName(),
      strategy,
      prompt: redactPrompt(prompt, 100),
      seed,
      latencyMs,
      costEstimate: undefined,
      generatedAt: new Date(),
    };
  }

  /**
   * Calculate cache key
   */
  private calculateCacheKey(prompt: string, seed?: number): string {
    const parts = [prompt.toLowerCase().trim(), seed?.toString() || "random"];
    return parts.join("||");
  }

  /**
   * Get status of all providers
   */
  public async getStatus(): Promise<ProviderStatus[]> {
    this.ensureInitialized();

    const statuses: ProviderStatus[] = [];

    if (this.proProvider) {
      statuses.push(await this.buildProviderStatus(this.proProvider));
    }

    if (this.flashProvider) {
      statuses.push(await this.buildProviderStatus(this.flashProvider));
    }

    return statuses;
  }

  /**
   * Build provider status
   */
  private async buildProviderStatus(provider: InferenceProviderPort): Promise<ProviderStatus> {
    const available = await provider.isAvailable();

    return {
      provider: `${provider.getProviderName()}:${provider.getModelName()}`,
      available,
      circuitState: "closed",
      lastError: undefined,
      totalRequests: 0,
      failedRequests: 0,
    };
  }

  /**
   * Clear cache
   */
  public async clearCache(): Promise<void> {
    await this.cache.clear();
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const geminiThumbnailService = GeminiThumbnailService.getInstance();
