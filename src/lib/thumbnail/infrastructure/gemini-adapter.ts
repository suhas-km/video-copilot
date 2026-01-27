/**
 * Gemini Image Generation Adapter
 *
 * Implements InferenceProviderPort for Google Gemini image generation.
 * Uses gemini-3-pro-image-preview (primary) and gemini-2.5-flash-image (fallback).
 */

import type {
  GenerationStrategy,
  ImageData,
  InferenceProviderPort,
  TextToImageParams,
} from "../domain";
import {
  APIResponseError,
  APITimeoutError,
  InvalidImageResponseError,
  ProviderUnavailableError,
  RETRY_CONFIG,
} from "../domain";
import { CircuitBreakerFactory } from "./circuit-breaker";

// ============================================================================
// Gemini Configuration
// ============================================================================

/**
 * Gemini model configurations
 */
export const GEMINI_IMAGE_CONFIG = {
  /** Primary model - Gemini 3 Pro Image for professional quality */
  PRO_MODEL: "gemini-2.0-flash-exp",
  /** Fallback model - Gemini 2.5 Flash Image for speed */
  FLASH_MODEL: "gemini-2.0-flash-exp",
  /** API base URL */
  API_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/models",
  /** API timeout in ms */
  API_TIMEOUT_MS: 60000,
  /** Default image dimensions for YouTube thumbnails (16:9) */
  DEFAULT_WIDTH: 1280,
  DEFAULT_HEIGHT: 720,
  /** Aspect ratio for YouTube thumbnails */
  ASPECT_RATIO: "16:9",
};

// ============================================================================
// Circuit Breaker Configuration for Gemini
// ============================================================================

const GEMINI_CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 5,
  RESET_TIMEOUT_MS: 60000,
  HALT_OPEN_TIMEOUT_MS: 10000,
};

// ============================================================================
// Gemini Adapter Implementation
// ============================================================================

/**
 * Gemini image generation adapter
 *
 * Implements the InferenceProviderPort interface for Gemini models.
 * Handles automatic retries and circuit breaking.
 */
export class GeminiImageAdapter implements InferenceProviderPort {
  private apiKey: string;
  private model: string;
  private strategy: GenerationStrategy;
  private circuitBreaker: ReturnType<typeof CircuitBreakerFactory.getOrCreate>;
  private requestCount: number = 0;
  private failureCount: number = 0;

  constructor(apiKey: string, modelName: string, strategy: GenerationStrategy) {
    if (!apiKey) {
      throw new Error("Gemini API key is required");
    }

    this.apiKey = apiKey;
    this.model = modelName;
    this.strategy = strategy;
    this.circuitBreaker = CircuitBreakerFactory.getOrCreate(
      `gemini-${modelName}`,
      GEMINI_CIRCUIT_BREAKER_CONFIG
    );
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return "Gemini";
  }

  /**
   * Get model name
   */
  getModelName(): string {
    return this.model;
  }

  /**
   * Get generation strategy
   */
  getStrategy(): GenerationStrategy {
    return this.strategy;
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.circuitBreaker.isOpen()) {
      return false;
    }

    try {
      // Make a lightweight request to check availability
      const url = `${GEMINI_IMAGE_CONFIG.API_BASE_URL}/${this.model}?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Generate image from text prompt
   */
  async textToImage(params: TextToImageParams): Promise<ImageData> {
    this.requestCount++;

    // Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      throw new ProviderUnavailableError(
        this.model,
        "Circuit breaker is open due to previous failures"
      );
    }

    try {
      const result = await this.executeWithRetry(params);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      this.failureCount++;
      this.circuitBreaker.recordFailure();

      if (
        error instanceof ProviderUnavailableError ||
        error instanceof APITimeoutError ||
        error instanceof APIResponseError
      ) {
        throw error;
      }

      throw new ProviderUnavailableError(
        this.model,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * Execute API call with retry logic
   */
  private async executeWithRetry(params: TextToImageParams): Promise<ImageData> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_RETRIES; attempt++) {
      try {
        return await this.executeRequest(params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          break;
        }

        // Don't retry on last attempt
        if (attempt >= RETRY_CONFIG.MAX_RETRIES - 1) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          RETRY_CONFIG.BASE_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt),
          RETRY_CONFIG.MAX_DELAY_MS
        );

        await this.sleep(delay);
      }
    }

    // All retries failed
    throw lastError || new Error("Unknown error during image generation");
  }

  /**
   * Execute single API request to Gemini
   */
  private async executeRequest(params: TextToImageParams): Promise<ImageData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_IMAGE_CONFIG.API_TIMEOUT_MS);

    try {
      const url = `${GEMINI_IMAGE_CONFIG.API_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;

      // Build the request body for Gemini image generation
      // Gemini uses natural language prompts, so we craft a descriptive prompt
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: params.prompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 1,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-OK responses
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // Parse response
      const data = await this.parseResponse(response, params);

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new APITimeoutError(this.model, GEMINI_IMAGE_CONFIG.API_TIMEOUT_MS);
      }

      throw error;
    }
  }

  /**
   * Handle error response from API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `HTTP ${response.status}`;

    try {
      const data = await response.json();
      errorMessage = data.error?.message || data.error || errorMessage;
    } catch {
      // Ignore JSON parse errors
    }

    // Handle specific status codes
    if (response.status === 401 || response.status === 403) {
      throw new APIResponseError(
        this.model,
        response.status,
        "Invalid API key. Please check your GEMINI_API_KEY."
      );
    }

    if (response.status === 429) {
      throw new APIResponseError(this.model, 429, "Rate limit exceeded. Please try again later.");
    }

    if (response.status === 503) {
      throw new ProviderUnavailableError(
        this.model,
        "Service unavailable. The model may be loading or overloaded."
      );
    }

    throw new APIResponseError(this.model, response.status, errorMessage);
  }

  /**
   * Parse successful response from Gemini
   */
  private async parseResponse(response: Response, params: TextToImageParams): Promise<ImageData> {
    try {
      const data = await response.json();

      // Gemini response structure:
      // { candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }
      const candidates = data.candidates;
      if (!candidates || candidates.length === 0) {
        throw new InvalidImageResponseError(this.model, "No candidates in response");
      }

      const parts = candidates[0]?.content?.parts;
      if (!parts || parts.length === 0) {
        throw new InvalidImageResponseError(this.model, "No parts in response");
      }

      // Find the image part
      const imagePart = parts.find(
        (part: { inlineData?: { mimeType: string; data: string } }) => part.inlineData
      );

      if (!imagePart || !imagePart.inlineData) {
        throw new InvalidImageResponseError(this.model, "No image data in response");
      }

      const { mimeType, data: base64Data } = imagePart.inlineData;

      return {
        base64: base64Data,
        mimeType: mimeType || "image/png",
        width: params.width,
        height: params.height,
      };
    } catch (error) {
      if (error instanceof InvalidImageResponseError) {
        throw error;
      }
      throw new InvalidImageResponseError(
        this.model,
        `Failed to parse response: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    // Network errors are retryable
    if (
      error.message.includes("ECONNRESET") ||
      error.message.includes("ETIMEDOUT") ||
      error.message.includes("ENOTFOUND") ||
      error.message.includes("fetch failed")
    ) {
      return true;
    }

    // Provider unavailable errors are retryable (might be temporary)
    if (error instanceof ProviderUnavailableError) {
      return true;
    }

    // Timeout errors are retryable
    if (error instanceof APITimeoutError) {
      return true;
    }

    // Specific HTTP status codes are retryable
    if (error instanceof APIResponseError) {
      return RETRY_CONFIG.RETRYABLE_STATUS_CODES.includes(error.statusCode);
    }

    return false;
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get statistics
   */
  getStats(): {
    requestCount: number;
    failureCount: number;
    successRate: number;
    circuitState: string;
  } {
    const successCount = this.requestCount - this.failureCount;
    const successRate = this.requestCount > 0 ? successCount / this.requestCount : 0;

    return {
      requestCount: this.requestCount,
      failureCount: this.failureCount,
      successRate,
      circuitState: this.circuitBreaker.getState(),
    };
  }
}

// ============================================================================
// Gemini Adapter Factory
// ============================================================================

/**
 * Factory for creating Gemini adapters
 */
export class GeminiAdapterFactory {
  private static instances: Map<string, GeminiImageAdapter> = new Map();

  /**
   * Get or create adapter instance
   */
  static getOrCreate(
    apiKey: string,
    modelName: string,
    strategy: GenerationStrategy
  ): GeminiImageAdapter {
    const key = `${modelName}-${strategy}`;
    if (!this.instances.has(key)) {
      const adapter = new GeminiImageAdapter(apiKey, modelName, strategy);
      this.instances.set(key, adapter);
    }
    return this.instances.get(key) as GeminiImageAdapter;
  }

  /**
   * Get pro model adapter (primary - higher quality)
   */
  static getPro(apiKey: string): GeminiImageAdapter {
    return this.getOrCreate(apiKey, GEMINI_IMAGE_CONFIG.PRO_MODEL, "SPECIALIZED");
  }

  /**
   * Get flash model adapter (fallback - faster)
   */
  static getFlash(apiKey: string): GeminiImageAdapter {
    return this.getOrCreate(apiKey, GEMINI_IMAGE_CONFIG.FLASH_MODEL, "FALLBACK");
  }

  /**
   * Reset all adapters (useful for testing)
   */
  static reset(): void {
    this.instances.clear();
  }
}
