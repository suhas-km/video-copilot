/**
 * Gemini Prompt Builder for Thumbnail Generation
 *
 * Builds natural language prompts optimized for Gemini image generation.
 * Supports free-form descriptions and clickable helper options.
 */

// ============================================================================
// Clickable Helper Options
// ============================================================================

/**
 * Visual element helpers users can click to add to their prompt
 */
export const VISUAL_ELEMENTS = {
  EXPRESSIVE_FACE: "with an expressive, eye-catching human face showing strong emotion",
  BOLD_TEXT: "with large, bold, attention-grabbing text overlay",
  ARROWS: "with arrows or pointers drawing attention to key elements",
  EMOJI: "with relevant emoji elements for visual appeal",
  SPLIT_SCREEN: "in a split-screen or comparison layout",
  BEFORE_AFTER: "showing a dramatic before and after transformation",
  GLOWING_EFFECTS: "with glowing, luminous effects and highlights",
  THREE_D_OBJECTS: "with glossy 3D rendered objects floating in space",
  FIRE_EXPLOSIONS: "with dramatic fire, explosions, or energy effects",
  MONEY_CHARTS: "featuring money, charts, or financial imagery",
  QUESTION_MARKS: "with question marks or mystery elements",
  CHECKMARKS: "with checkmarks or success indicators",
} as const;

/**
 * Style modifier helpers
 */
export const STYLE_MODIFIERS = {
  PHOTOREALISTIC: "photorealistic, studio-quality photography",
  ILLUSTRATED: "digital illustration, hand-drawn artistic style",
  NEON_GLOW: "neon glow aesthetic with dark background and vibrant colors",
  MINIMALIST: "clean, minimalist design with lots of whitespace",
  DARK_DRAMATIC: "dark, dramatic, cinematic lighting",
  BRIGHT_VIBRANT: "bright, vibrant, saturated colors",
  RETRO_VINTAGE: "retro, vintage aesthetic with nostalgic feel",
  COMIC_STYLE: "comic book or manga style illustration",
  GRADIENT: "modern gradient backgrounds with smooth color transitions",
} as const;

/**
 * Mood/energy helpers
 */
export const MOOD_OPTIONS = {
  SHOCKING: "shocking, jaw-dropping, unbelievable",
  EXCITING: "exciting, high-energy, action-packed",
  CALM: "calm, professional, trustworthy",
  MYSTERIOUS: "mysterious, intriguing, curiosity-inducing",
  URGENT: "urgent, time-sensitive, FOMO-inducing",
  PLAYFUL: "playful, fun, lighthearted",
  INSPIRATIONAL: "inspirational, motivational, uplifting",
  CONTROVERSIAL: "controversial, debate-sparking, thought-provoking",
} as const;

/**
 * Color scheme helpers
 */
export const COLOR_SCHEMES = {
  HIGH_CONTRAST: "high contrast with bold red, yellow, and blue",
  WARM_ENERGY: "warm colors with oranges, reds, and yellows",
  COOL_TECH: "cool tech colors with blues, cyans, and purples",
  DARK_POP: "dark background with bright accent color pops",
  PASTEL_SOFT: "soft pastel colors for approachable feel",
  MONOCHROME_ACCENT: "black and white with single color accent",
  SUNSET: "sunset gradient colors from orange to purple",
  NATURE: "natural earthy tones and greens",
} as const;

// ============================================================================
// Types
// ============================================================================

export type VisualElement = keyof typeof VISUAL_ELEMENTS;
export type StyleModifier = keyof typeof STYLE_MODIFIERS;
export type MoodOption = keyof typeof MOOD_OPTIONS;
export type ColorScheme = keyof typeof COLOR_SCHEMES;

/**
 * Thumbnail generation options for the new flexible system
 */
export interface ThumbnailOptions {
  /** Free-form description of what the user wants */
  description?: string;
  /** Title text to potentially include (optional) */
  titleText?: string;
  /** Video title for context */
  videoTitle?: string;
  /** Video description for context */
  videoDescription?: string;
  /** Selected visual elements */
  visualElements?: VisualElement[];
  /** Selected style modifier */
  style?: StyleModifier;
  /** Selected mood */
  mood?: MoodOption;
  /** Selected color scheme */
  colorScheme?: ColorScheme;
  /** Custom additional instructions */
  customInstructions?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Common brand/source names to filter out from video titles
 */
const BRAND_PATTERNS = [
  /\b(BBC|CNN|Fox|NBC|ABC|CBS|MSNBC|Reuters|AP|AFP)\b/gi,
  /\|.*$/,  // Everything after pipe character
  /-\s*(Official|HD|4K|Full|Episode).*$/i,
  /\[.*?\]/g,  // Anything in square brackets
  /\(.*?\)/g,  // Anything in parentheses (often contains channel names)
];

/**
 * Sanitize video title to remove source branding
 */
function sanitizeVideoTitle(title: string): string {
  if (!title) {
    return "";
  }
  
  let sanitized = title;
  for (const pattern of BRAND_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }
  
  return sanitized.trim();
}

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Build a natural language prompt for Gemini image generation
 * optimized for YouTube thumbnail creation
 */
export function buildGeminiThumbnailPrompt(options: ThumbnailOptions): string {
  const parts: string[] = [];

  // Professional quality prefix for Gemini 3 Pro Image
  parts.push("Generate a professional, high-resolution YouTube thumbnail image");
  
  // Technical specifications
  parts.push("Technical specs: 16:9 aspect ratio, 1280x720 minimum resolution, vibrant colors optimized for small preview sizes");

  // Main subject/description
  if (options.description && options.description.trim()) {
    parts.push(`Main subject: ${options.description.trim()}`);
  }

  // Context from video
  if (options.videoTitle) {
    const cleanTitle = sanitizeVideoTitle(options.videoTitle);
    if (cleanTitle) {
      parts.push(`Content theme: "${cleanTitle}"`);
    }
  }

  // Style with enhanced descriptors
  if (options.style && STYLE_MODIFIERS[options.style]) {
    parts.push(`Visual style: ${STYLE_MODIFIERS[options.style]}, with professional studio-quality rendering`);
  } else {
    parts.push("Visual style: cinematic, professional photography with dramatic lighting");
  }

  // Mood with intensity
  if (options.mood && MOOD_OPTIONS[options.mood]) {
    parts.push(`Emotional tone: intensely ${MOOD_OPTIONS[options.mood]}`);
  }

  // Color scheme with specifics
  if (options.colorScheme && COLOR_SCHEMES[options.colorScheme]) {
    parts.push(`Color palette: ${COLOR_SCHEMES[options.colorScheme]}, with rich saturation and strong contrast`);
  } else {
    parts.push("Color palette: vibrant, eye-catching colors with high contrast for visibility");
  }

  // Visual elements
  if (options.visualElements && options.visualElements.length > 0) {
    const elementDescriptions = options.visualElements
      .map((el) => VISUAL_ELEMENTS[el])
      .filter(Boolean);
    if (elementDescriptions.length > 0) {
      parts.push(`Key visual elements: ${elementDescriptions.join("; ")}`);
    }
  }

  // Text overlay with strict requirements
  if (options.titleText && options.titleText.trim()) {
    parts.push(`Text overlay: Display "${options.titleText.trim()}" prominently - use bold, sans-serif typography with high contrast, drop shadow for readability, perfectly centered or rule-of-thirds positioned`);
  }

  // Custom instructions
  if (options.customInstructions && options.customInstructions.trim()) {
    parts.push(`Special requirements: ${options.customInstructions.trim()}`);
  }

  // Quality enforcement
  parts.push("Quality requirements: Ultra-sharp focus, professional composition using rule of thirds, dramatic depth of field, cinematic color grading");
  
  // CTR optimization
  parts.push("Optimize for click-through: Create visual curiosity, use focal point to draw the eye, ensure the thumbnail is compelling even at 120x90 pixel preview size");
  
  // Strict prohibitions
  parts.push("STRICTLY FORBIDDEN: No logos, no watermarks, no brand names, no copyright symbols, no UI elements, no text other than specified");

  return parts.join(". ") + ".";
}

/**
 * Build a simple prompt from just description and optional title
 * For users who want maximum creative freedom
 */
export function buildSimplePrompt(description: string, titleText?: string): string {
  let prompt = `Generate a professional YouTube thumbnail image: ${description}. Technical specs: 16:9 aspect ratio, high resolution, vibrant colors.`;

  if (titleText) {
    prompt += ` Display this text prominently: "${titleText}" - bold sans-serif typography, high contrast, drop shadow for readability.`;
  }

  prompt += " Quality: Ultra-sharp focus, cinematic lighting, professional composition. Optimize for click-through rate. STRICTLY FORBIDDEN: No logos, watermarks, brand names, or UI elements.";

  return prompt;
}

/**
 * Get all available options for UI display
 */
export function getAvailableOptions() {
  return {
    visualElements: Object.keys(VISUAL_ELEMENTS) as VisualElement[],
    styles: Object.keys(STYLE_MODIFIERS) as StyleModifier[],
    moods: Object.keys(MOOD_OPTIONS) as MoodOption[],
    colorSchemes: Object.keys(COLOR_SCHEMES) as ColorScheme[],
  };
}

/**
 * Get human-readable label for an option
 */
export function getOptionLabel(
  _category: "visualElements" | "styles" | "moods" | "colorSchemes",
  key: string
): string {
  // Convert SNAKE_CASE to Title Case
  return key
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Get description for an option (for tooltips)
 */
export function getOptionDescription(
  category: "visualElements" | "styles" | "moods" | "colorSchemes",
  key: string
): string {
  switch (category) {
    case "visualElements":
      return VISUAL_ELEMENTS[key as VisualElement] || "";
    case "styles":
      return STYLE_MODIFIERS[key as StyleModifier] || "";
    case "moods":
      return MOOD_OPTIONS[key as MoodOption] || "";
    case "colorSchemes":
      return COLOR_SCHEMES[key as ColorScheme] || "";
    default:
      return "";
  }
}
