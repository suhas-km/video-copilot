/**
 * Application Layer Public API
 *
 * Exports all application layer components.
 */

export { InputValidator, inputValidator, thumbnailGenerationSchema } from "./input-validator";
export type { ValidatedThumbnailGenerationRequest } from "./input-validator";

export { GeminiThumbnailService, geminiThumbnailService } from "./gemini-thumbnail-service";

export {
  buildGeminiThumbnailPrompt,
  COLOR_SCHEMES,
  getOptionLabel,
  MOOD_OPTIONS,
  STYLE_MODIFIERS,
  VISUAL_ELEMENTS,
} from "./gemini-prompt-builder";
export type {
  ColorScheme,
  MoodOption,
  StyleModifier,
  ThumbnailOptions,
  VisualElement,
} from "./gemini-prompt-builder";

export { MagicPromptService, magicPromptService } from "./magic-prompt-service";
