/**
 * JSON Schema Converter for Gemini API
 *
 * Converts Zod schemas to JSON Schema format compatible with Gemini's responseSchema.
 * Uses zod-to-json-schema for reliable conversion.
 *
 * @module schema-converter
 */

import { ResponseSchema } from "@google/generative-ai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { logger } from "../logger";

// ============================================================================
// Schema Conversion
// ============================================================================

// ============================================================================
// Schema Conversion
// ============================================================================

/**
 * Fields that Gemini API doesn't support in response_schema
 * These must be stripped or API returns 400 Bad Request
 */
const UNSUPPORTED_SCHEMA_FIELDS = [
  "$ref",
  "$defs", 
  "$schema",
  "definitions",
  "$id",
  "additionalProperties", // Gemini doesn't support this either
] as const;

/**
 * Remove all unsupported fields from schema recursively (Gemini doesn't support them)
 */
function removeUnsupportedFields(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUnsupportedFields);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Skip unsupported fields
    if (UNSUPPORTED_SCHEMA_FIELDS.includes(key as typeof UNSUPPORTED_SCHEMA_FIELDS[number])) {
      continue;
    }
    result[key] = removeUnsupportedFields(value);
  }

  return result;
}

/**
 * Convert a Zod schema to Gemini-compatible JSON Schema
 *
 * @param schema - Zod schema to convert
 * @param name - Optional name for the schema (used as $ref)
 * @returns JSON Schema object compatible with Gemini API
 */
export function zodToGeminiSchema<T extends z.ZodTypeAny>(
  schema: T,
  name?: string
): ResponseSchema {
  const jsonSchema = zodToJsonSchema(schema, {
    name: name || "response",
    $refStrategy: "none", // Inline all refs for Gemini compatibility
    target: "jsonSchema7", // Use JSON Schema draft-07
  });

  // Remove unwanted fields
  const { ...cleanSchema } = jsonSchema as Record<string, unknown>;

  // Remove all unsupported fields recursively ($ref, $defs, $schema, definitions, etc.)
  return removeUnsupportedFields(cleanSchema) as unknown as ResponseSchema;
}

/**
 * Create generation config with JSON schema for structured output
 */
export function createJsonGenerationConfig<T extends z.ZodTypeAny>(
  schema: T,
  options?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  }
): {
  responseMimeType: string;
  responseSchema: ResponseSchema;
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
} {
  return {
    responseMimeType: "application/json",
    responseSchema: zodToGeminiSchema(schema),
    ...options,
  };
}

// ============================================================================
// Response Parsing with Validation
// ============================================================================

/**
 * Detect if an array is a flat key-value sequence that needs reconstruction
 * Pattern: ["id", "value1", "timestamp", "start", 45, "end", 55, "category", "scripting", ...]
 * These are object properties flattened into an array
 */
function isFlatKeyValueArray(arr: unknown[]): boolean {
  if (arr.length < 2) {
    return false;
  }
  
  // Check if first element is a known key name (string) and not an object
  const knownKeys = ["id", "timestamp", "category", "severity", "title", "description", "issue", "recommendation", "confidence", "start", "end"];
  
  // If array starts with a known key followed by a non-object value, it's likely flat
  if (typeof arr[0] === "string" && knownKeys.includes(arr[0].toLowerCase())) {
    // Verify it's not already objects
    const hasObjects = arr.some(item => typeof item === "object" && item !== null);
    if (!hasObjects) {
      return true;
    }
  }
  
  return false;
}

/**
 * Reconstruct objects from a flat key-value array
 * Input: ["id", "abc", "timestamp", "start", 45, "end", 55, "category", "scripting", "id", "xyz", ...]
 * Output: [{id: "abc", timestamp: {start: 45, end: 55}, category: "scripting"}, {id: "xyz", ...}]
 */
function reconstructObjectsFromFlatArray(arr: unknown[]): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  let currentObj: Record<string, unknown> = {};
  let i = 0;
  
  const objectBoundaryKeys = ["id"]; // Keys that indicate start of a new object
  
  while (i < arr.length) {
    const key = arr[i];
    
    if (typeof key !== "string") {
      i++;
      continue;
    }
    
    const keyLower = key.toLowerCase();
    
    // Check if this is a new object boundary
    if (objectBoundaryKeys.includes(keyLower) && Object.keys(currentObj).length > 0) {
      objects.push(currentObj);
      currentObj = {};
    }
    
    // Handle nested objects like timestamp: {start, end}
    if (keyLower === "timestamp" && i + 4 < arr.length) {
      const nextKey = arr[i + 1];
      if (nextKey === "start" || nextKey === "end") {
        // Reconstruct nested timestamp object
        const timestamp: Record<string, number> = { start: 0, end: 0 };
        let j = i + 1;
        while (j + 1 < arr.length && (arr[j] === "start" || arr[j] === "end")) {
          const subKey = arr[j] as string;
          const subVal = arr[j + 1];
          if (typeof subVal === "number") {
            timestamp[subKey] = subVal;
          }
          j += 2;
        }
        currentObj["timestamp"] = timestamp;
        i = j;
        continue;
      }
    }
    
    // Standard key-value pair
    if (i + 1 < arr.length) {
      const value = arr[i + 1];
      // Skip if value is another key name (indicates missing value)
      if (typeof value === "string" && ["id", "timestamp", "category", "severity", "title", "description", "issue", "recommendation", "confidence"].includes(value.toLowerCase())) {
        currentObj[keyLower] = "";
        i++;
      } else {
        currentObj[keyLower] = value;
        i += 2;
      }
    } else {
      i++;
    }
  }
  
  // Don't forget the last object
  if (Object.keys(currentObj).length > 0) {
    objects.push(currentObj);
  }
  
  // Ensure each object has required fields with defaults
  return objects.map(obj => ({
    id: obj.id || `issue-${Math.random().toString(36).substring(7)}`,
    timestamp: obj.timestamp || { start: 0, end: 0 },
    category: obj.category || "core_concepts",
    severity: obj.severity || "medium",
    title: obj.title || "Issue",
    description: obj.description || "",
    issue: obj.issue || "",
    recommendation: obj.recommendation || "",
    confidence: typeof obj.confidence === "number" ? obj.confidence : 0.7,
  }));
}

/**
 * Normalize Gemini response by fixing common schema violations
 * This handles cases where Gemini returns:
 * - JSON strings in object arrays: ["{\"id\": \"...\"}"] -> [{"id": "..."}]
 * - Primitive values in object arrays: [-1, -1] -> []
 * - Null values in object arrays: [null] -> []
 * - Strings instead of empty objects: ["No issues"] -> []
 * - Invalid enum values: "high" -> "critical"
 * - Arrays as strings: "strength1, strength2" -> ["strength1", "strength2"]
 * - checklistResults as array instead of object
 * - Truncated/malformed category-specific fields
 */
function normalizeGeminiResponse(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== "object") {
    return parsed;
  }

  if (Array.isArray(parsed)) {
    // Try to parse JSON strings in arrays
    const normalized = parsed.map((item) => {
      if (typeof item === "string") {
        try {
          return JSON.parse(item);
        } catch {
          // If it's not JSON, keep as is if it's a valid primitive, otherwise filter out
          return item;
        }
      }
      return item;
    });

    // Filter out nulls, -1, and non-object values from object arrays
    return normalized.filter(
      (item) =>
        item !== null &&
        item !== -1 &&
        (typeof item === "object" || typeof item === "string" || typeof item === "number")
    );
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      // Special handling for known object arrays
      const objectArrayFields = [
        "issues",
        "criticalDropoffPoints",
        "visualGaps",
        "pacingViolations",
        "audioIssues",
        "styleRecommendations",
        "toolRecommendations",
        "failedItems",
      ];

      if (objectArrayFields.includes(key)) {
        // Check if this is a flat key-value array that needs reconstruction
        // Pattern: ["id", "value1", "timestamp", "start", 45, "end", 55, ...]
        if (isFlatKeyValueArray(value)) {
          logger.debug("Reconstructing flat key-value array", { field: key, length: value.length });
          result[key] = reconstructObjectsFromFlatArray(value);
        } else {
          // Parse JSON strings, filter invalid values, and recursively normalize
          result[key] = value
            .map((item) => {
              if (typeof item === "string") {
                try {
                  return JSON.parse(item);
                } catch {
                  // If parsing fails, return null to be filtered
                  return null;
                }
              }
              return item;
            })
            .filter((item) => item !== null && item !== -1 && typeof item === "object")
            .map((item) => normalizeGeminiResponse(item)); // Recursively normalize parsed objects
        }
      } else {
        result[key] = normalizeGeminiResponse(value);
      }
    } else if (typeof value === "object" && value !== null) {
      result[key] = normalizeGeminiResponse(value);
    } else if (key === "severity" && typeof value === "string") {
      // Normalize severity enum values
      result[key] = normalizeEnumValue("severity", value);
    } else if (key === "category" && typeof value === "string") {
      // Normalize category enum values
      result[key] = normalizeEnumValue("category", value);
    } else if (key === "type" && typeof value === "string") {
      // Normalize type enum values (for audio issues)
      result[key] = normalizeEnumValue("type", value);
    } else if ((key === "strengths" || key === "priorityActions") && typeof value === "string") {
      // Convert string to array for strengths and priorityActions
      result[key] = value
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else {
      result[key] = value;
    }
  }

  // Fix checklistResults: Gemini sometimes returns array instead of expected object
  if ("checklistResults" in result && Array.isArray(result.checklistResults)) {
    logger.debug("Converting checklistResults from array to object structure");
    result.checklistResults = {
      retentionChecklist: { passed: 0, failed: 0, total: 8 },
      seoChecklist: { passed: 0, failed: 0, total: 6 },
    };
  }

  // Fix workflowMetrics: ensure it's an object or null
  if ("workflowMetrics" in result && Array.isArray(result.workflowMetrics)) {
    logger.debug("Converting workflowMetrics from array to null");
    result.workflowMetrics = null;
  }

  // Fix scriptMetrics: Gemini sometimes returns array instead of expected object
  if ("scriptMetrics" in result && Array.isArray(result.scriptMetrics)) {
    logger.debug("Converting scriptMetrics from array to default object");
    result.scriptMetrics = {
      hookStrength: 0.7,
      pacing: 0.7,
      clarity: 0.7,
      callToAction: 0.7,
    };
  }

  // Fix toolRecommendations: ensure array items are objects
  if ("toolRecommendations" in result && Array.isArray(result.toolRecommendations)) {
    result.toolRecommendations = (result.toolRecommendations as unknown[])
      .filter((item) => item !== null && typeof item === "object" && !Array.isArray(item));
  }

  // Fix retentionMetrics: Gemini sometimes returns string instead of object
  if ("retentionMetrics" in result && typeof result.retentionMetrics === "string") {
    try {
      result.retentionMetrics = JSON.parse(result.retentionMetrics as string);
      logger.debug("Parsed retentionMetrics from string to object");
    } catch {
      logger.debug("Converting invalid retentionMetrics string to null");
      result.retentionMetrics = null;
    }
  }

  // Fix pacingMetrics: Gemini sometimes returns string instead of object
  if ("pacingMetrics" in result && typeof result.pacingMetrics === "string") {
    try {
      result.pacingMetrics = JSON.parse(result.pacingMetrics as string);
      logger.debug("Parsed pacingMetrics from string to object");
    } catch {
      logger.debug("Converting invalid pacingMetrics string to null");
      result.pacingMetrics = null;
    }
  }

  // Fix audioMetrics: Gemini sometimes returns string instead of object
  if ("audioMetrics" in result && typeof result.audioMetrics === "string") {
    try {
      result.audioMetrics = JSON.parse(result.audioMetrics as string);
      logger.debug("Parsed audioMetrics from string to object");
    } catch {
      logger.debug("Converting invalid audioMetrics string to null");
      result.audioMetrics = null;
    }
  }

  // Fix styleMetrics: Gemini sometimes returns string instead of object
  if ("styleMetrics" in result && typeof result.styleMetrics === "string") {
    try {
      result.styleMetrics = JSON.parse(result.styleMetrics as string);
      logger.debug("Parsed styleMetrics from string to object");
    } catch {
      logger.debug("Converting invalid styleMetrics string to null");
      result.styleMetrics = null;
    }
  }

  // Fix seoMetrics: Gemini sometimes returns string instead of object
  if ("seoMetrics" in result && typeof result.seoMetrics === "string") {
    try {
      result.seoMetrics = JSON.parse(result.seoMetrics as string);
      logger.debug("Parsed seoMetrics from string to object");
    } catch {
      logger.debug("Converting invalid seoMetrics string to null");
      result.seoMetrics = null;
    }
  }

  return result;
}

/**
 * Comprehensive enum normalization for all enum types
 * Maps common variations to valid enum values
 */
function normalizeEnumValue(field: string, value: string | number): string {
  if (typeof value !== "string") {
    return String(value);
  }

  const lowerValue = value.toLowerCase().trim();

  // Category enum normalization (8 valid values)
  const categoryMap: Record<string, string> = {
    // Map descriptive sub-categories to parent categories
    pattern_interrupts: "core_concepts",
    dopamine_engagement: "core_concepts",
    retention_psychology: "core_concepts",
    narrative_techniques: "scripting",
    visual_cues: "scripting",
    av_format: "scripting",
    kinetic_typography: "visual_editing",
    pacing_rhythm: "visual_editing",
    spatial_dynamics: "visual_editing",
    transitions: "visual_editing",
    mixing_techniques: "audio_design",
    music_stems: "audio_design",
    sound_layers: "audio_design",
    title_optimization: "seo_metadata",
    description_engineering: "seo_metadata",
    technical_metadata: "seo_metadata",
    compliance_guidelines: "seo_metadata",
    hormozi_style: "style_guides",
    lemmino_style: "style_guides",
    high_energy_style: "style_guides",
    vox_style: "style_guides",
    workflow_templates: "tools_workflows",
    software_comparison: "tools_workflows",
    retention_checklist: "checklists",
    seo_checklist: "checklists",
    // Normalize spacing/casing variations
    "core concepts": "core_concepts",
    "core-concepts": "core_concepts",
    "visual editing": "visual_editing",
    "visual-editing": "visual_editing",
    "audio design": "audio_design",
    "audio-design": "audio_design",
    "seo metadata": "seo_metadata",
    "seo-metadata": "seo_metadata",
    "style guides": "style_guides",
    "style-guides": "style_guides",
    "tools workflows": "tools_workflows",
    "tools-workflows": "tools_workflows",
  };

  // Severity enum normalization (4 valid values)
  const severityMap: Record<string, string> = {
    high: "critical",
    urgent: "critical",
    severe: "critical",
    critical: "critical",
    medium: "major",
    moderate: "major",
    important: "major",
    major: "major",
    low: "minor",
    minor: "minor",
    info: "suggestion",
    informational: "suggestion",
    optional: "suggestion",
    suggestion: "suggestion",
  };

  // Audio issue type enum normalization (4 valid values)
  const audioIssueTypeMap: Record<string, string> = {
    sfx: "missing_sfx",
    "sound effects": "missing_sfx",
    "missing sfx": "missing_sfx",
    missing_sfx: "missing_sfx",
    silence: "silence",
    "dead air": "silence",
    pause: "silence",
    imbalance: "imbalance",
    "mix balance": "imbalance",
    "audio balance": "imbalance",
    "music timing": "music_timing",
    music_timing: "music_timing",
    music: "music_timing",
    "background music": "music_timing",
  };

  // Select appropriate mapping based on field name
  if (field === "category") {
    return categoryMap[lowerValue] || value;
  } else if (field === "severity") {
    return severityMap[lowerValue] || value;
  } else if (field === "type" || field === "audioIssueType") {
    return audioIssueTypeMap[lowerValue] || value;
  }

  return value;
}

// normalizeSeverity kept for backward compatibility but now uses normalizeEnumValue internally

/**
 * Enforce array size limits based on known constraints
 */
function enforceArraySizes(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(enforceArraySizes);
  }

  const result: Record<string, unknown> = {};
  const arrayLimits: Record<string, number> = {
    priorityActions: 3,
    strengths: 5,
    topInsights: 3,
  };

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (Array.isArray(value) && arrayLimits[key]) {
      const limit = arrayLimits[key];
      if (value.length > limit) {
        logger.debug(`Truncating array '${key}' from ${value.length} to ${limit}`);
        result[key] = value.slice(0, limit).map(enforceArraySizes);
      } else {
        result[key] = value.map(enforceArraySizes);
      }
    } else if (typeof value === "object" && value !== null) {
      result[key] = enforceArraySizes(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Add default values for missing required fields
 * Includes category-specific defaults for all 8 analysis categories
 */
function addRequiredDefaults(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(addRequiredDefaults);
  }

  const result: Record<string, unknown> = { ...(obj as Record<string, unknown>) };

  // Required fields with defaults
  const requiredArrays = ["strengths", "priorityActions", "issues", "topInsights"];
  const requiredNumbers = ["overallScore"];

  for (const field of requiredArrays) {
    if (result[field] === undefined || result[field] === null) {
      result[field] = [];
      logger.debug(`Added empty array default for '${field}'`);
    }
  }

  for (const field of requiredNumbers) {
    if (result[field] === undefined || result[field] === null) {
      result[field] = 0.5; // Default middle score
      logger.debug(`Added default number for '${field}'`);
    }
  }

  // Category-specific defaults based on category field
  const category = result.category as string | undefined;
  if (category) {
    switch (category) {
      case "checklists":
        if (!result.checklistResults || typeof result.checklistResults !== "object") {
          result.checklistResults = {
            retentionChecklist: { passed: 0, failed: 0, total: 8 },
            seoChecklist: { passed: 0, failed: 0, total: 6 },
          };
          logger.debug("Added default checklistResults");
        }
        if (!result.failedItems) {
          result.failedItems = [];
        }
        break;

      case "tools_workflows":
        if (!result.workflowMetrics || typeof result.workflowMetrics !== "object") {
          result.workflowMetrics = null;
        }
        if (!result.toolRecommendations) {
          result.toolRecommendations = [];
        }
        break;

      case "seo_metadata":
        if (!result.seoMetrics || typeof result.seoMetrics !== "object") {
          result.seoMetrics = {
            titleScore: 0.5,
            descriptionScore: 0.5,
            tagRelevance: 0.5,
            complianceStatus: "warning",
          };
          logger.debug("Added default seoMetrics");
        }
        if (!result.suggestions || typeof result.suggestions !== "object") {
          result.suggestions = {
            titles: [],
            description: "",
            tags: [],
          };
          logger.debug("Added default suggestions");
        }
        break;

      case "core_concepts":
        if (!result.retentionMetrics) {
          result.retentionMetrics = null;
        }
        if (!result.criticalDropoffPoints) {
          result.criticalDropoffPoints = [];
        }
        break;

      case "scripting":
        if (!result.scriptMetrics) {
          result.scriptMetrics = null;
        }
        if (!result.visualGaps) {
          result.visualGaps = [];
        }
        break;

      case "visual_editing":
        if (!result.pacingMetrics) {
          result.pacingMetrics = null;
        }
        if (!result.pacingViolations) {
          result.pacingViolations = [];
        }
        break;

      case "audio_design":
        if (!result.audioMetrics) {
          result.audioMetrics = null;
        }
        if (!result.audioIssues) {
          result.audioIssues = [];
        }
        break;

      case "style_guides":
        if (!result.styleMetrics) {
          result.styleMetrics = null;
        }
        if (!result.styleRecommendations) {
          result.styleRecommendations = [];
        }
        break;
    }
  }

  // Recursively process nested objects
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = addRequiredDefaults(value);
    }
  }

  return result;
}

/**
 * Parse and validate Gemini JSON response against a Zod schema
 *
 * @param responseText - Raw response text from Gemini
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated response
 * @throws Error if parsing or validation fails
 */
export function parseAndValidateResponse<T extends z.ZodTypeAny>(
  responseText: string,
  schema: T
): z.infer<T> {
  logger.debug("Starting response parsing", {
    responseLength: responseText.length,
    schemaName: schema.constructor.name,
  });

  // Step 1: Parse JSON with error recovery
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
    logger.debug("JSON parsing successful", {
      parsedType: typeof parsed,
      hasKeys:
        typeof parsed === "object" && parsed !== null ? Object.keys(parsed).join(", ") : "N/A",
    });
  } catch (parseError) {
    logger.error("JSON parsing failed, attempting recovery", {
      error: parseError instanceof Error ? parseError.message : "Unknown",
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 500),
    });

    // Try to fix common JSON issues
    const fixedText = fixMalformedJSON(responseText);
    try {
      parsed = JSON.parse(fixedText);
      logger.warn("JSON parsing succeeded after recovery", {
        originalError: parseError instanceof Error ? parseError.message : "Unknown",
      });
    } catch (recoveryError) {
      logger.error("JSON recovery failed", {
        error: recoveryError instanceof Error ? recoveryError.message : "Unknown",
        fixedPreview: fixedText.substring(0, 500),
      });
      throw new Error(
        `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`
      );
    }
  }

  // Step 2: Normalize response to fix common Gemini mistakes
  logger.debug("Normalizing Gemini response");
  let normalized = normalizeGeminiResponse(parsed);

  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    logger.debug("Response was normalized for enum/structure issues");
  }

  // Step 2.5: Enforce array size limits
  logger.debug("Enforcing array size limits");
  normalized = enforceArraySizes(normalized);

  // Step 2.6: Add defaults for missing required fields
  logger.debug("Adding defaults for missing required fields");
  normalized = addRequiredDefaults(normalized);

  // Step 3: Validate against schema
  logger.debug("Starting schema validation", {
    schemaName: schema.constructor.name,
    parsedType: typeof normalized,
  });

  const result = schema.safeParse(normalized);

  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
      code: e.code,
    }));

    logger.error("Schema validation failed", {
      errorCount: errors.length,
      errors: errors,
      parsedStructure:
        typeof normalized === "object" && normalized !== null ? Object.keys(normalized) : "N/A",
      parsedSample: JSON.stringify(normalized).substring(0, 500),
      schemaName: schema.constructor.name,
    });

    const errorMessages = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    throw new Error(`Response validation failed: ${errorMessages}`);
  }

  logger.info("Response validation successful", {
    schemaName: schema.constructor.name,
    validatedFields:
      typeof result.data === "object" && result.data !== null
        ? Object.keys(result.data).join(", ")
        : "N/A",
  });

  return result.data;
}

/**
 * Remove duplicate JSON keys from a string
 * Handles nested arrays/objects by tracking bracket depth
 * Keeps only the first occurrence of the key
 */
function removeDuplicateJsonKeys(text: string, keyName: string): string {
  // Find all occurrences of the key
  const keyPattern = new RegExp(`"${keyName}"\\s*:\\s*`, "g");
  const matches: { index: number; length: number }[] = [];
  
  let match;
  while ((match = keyPattern.exec(text)) !== null) {
    matches.push({ index: match.index, length: match[0].length });
  }
  
  // If 0 or 1 occurrence, nothing to dedupe
  if (matches.length <= 1) {
    return text;
  }
  
  logger.debug("Found duplicate JSON keys", { keyName, count: matches.length });
  
  // For each duplicate (skip first), find the value extent and remove
  // We process from end to start to preserve indices
  let result = text;
  for (let i = matches.length - 1; i >= 1; i--) {
    const keyMatch = matches[i];
    if (!keyMatch) {
      continue;
    }
    
    const valueStart = keyMatch.index + keyMatch.length;
    const valueEnd = findJsonValueEnd(result, valueStart);
    
    if (valueEnd > valueStart) {
      // Remove from the comma before the key (if exists) to the end of value
      let removeStart = keyMatch.index;
      // Look backwards for a comma
      const beforeKey = result.substring(0, removeStart).trimEnd();
      if (beforeKey.endsWith(",")) {
        removeStart = beforeKey.lastIndexOf(",");
      }
      
      // Also remove trailing comma if exists
      let removeEnd = valueEnd;
      const afterValue = result.substring(valueEnd).trimStart();
      if (afterValue.startsWith(",")) {
        removeEnd = valueEnd + result.substring(valueEnd).indexOf(",") + 1;
      }
      
      result = result.substring(0, removeStart) + result.substring(removeEnd);
    }
  }
  
  return result;
}

/**
 * Find the end index of a JSON value starting at the given position
 * Handles nested arrays and objects by tracking bracket depth
 */
function findJsonValueEnd(text: string, startIndex: number): number {
  const firstChar = text[startIndex];
  
  if (firstChar === "[" || firstChar === "{") {
    // Track bracket depth
    const openBracket = firstChar;
    const closeBracket = firstChar === "[" ? "]" : "}";
    let depth = 1;
    let i = startIndex + 1;
    let inString = false;
    let escaped = false;
    
    while (i < text.length && depth > 0) {
      const char = text[i];
      
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = !inString;
      } else if (!inString) {
        if (char === openBracket) {
          depth++;
        } else if (char === closeBracket) {
          depth--;
        }
      }
      i++;
    }
    return i;
  } else if (firstChar === '"') {
    // String value - find closing quote
    let i = startIndex + 1;
    let escaped = false;
    while (i < text.length) {
      const char = text[i];
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        return i + 1;
      }
      i++;
    }
    return i;
  } else {
    // Primitive value (number, boolean, null) - find next comma, bracket, or brace
    let i = startIndex;
    while (i < text.length) {
      const char = text[i];
      if (!char || /[,\]}]/.test(char)) {
        break;
      }
      i++;
    }
    return i;
  }
}

/**
 * Fix common JSON formatting issues in Gemini responses
 * Handles truncated responses, malformed syntax, duplicate keys, and common AI mistakes
 */
function fixMalformedJSON(text: string): string {
  let fixed = text.trim();

  // CRITICAL FIX: Handle duplicate JSON keys (Gemini sometimes outputs multiple "issues" keys)
  // This happens when Gemini "stutters" and outputs the same key multiple times
  // We need to remove all but the first occurrence of each duplicated key
  fixed = removeDuplicateJsonKeys(fixed, "issues");
  fixed = removeDuplicateJsonKeys(fixed, "strengths");
  fixed = removeDuplicateJsonKeys(fixed, "priorityActions");
  fixed = removeDuplicateJsonKeys(fixed, "failedItems");

  // Handle truncated JSON by closing open brackets/braces
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/]/g) || []).length;

  // If truncated, try to close the JSON properly
  if (openBraces > closeBraces || openBrackets > closeBrackets) {
    logger.debug("Attempting to fix truncated JSON", {
      openBraces,
      closeBraces,
      openBrackets,
      closeBrackets,
    });

    // Remove any trailing incomplete key-value pair
    fixed = fixed.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, "");
    fixed = fixed.replace(/,\s*$/, "");

    // Close remaining open brackets/braces
    const bracesToClose = openBraces - closeBraces;
    const bracketsToClose = openBrackets - closeBrackets;

    // Close arrays first, then objects (reverse nesting order)
    for (let i = 0; i < bracketsToClose; i++) {
      fixed += "]";
    }
    for (let i = 0; i < bracesToClose; i++) {
      fixed += "}";
    }
  }

  // Remove trailing commas before closing brackets/braces
  fixed = fixed.replace(/,(\s*[}\]])/g, "$1");

  // Fix unquoted keys (common in some AI responses)
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // Fix single quotes to double quotes
  fixed = fixed.replace(/'/g, '"');

  // Fix missing commas between array items
  fixed = fixed.replace(/("]"\s*|[a-zA-Z0-9_]+\s*})\s*([a-zA-Z_][a-zA-Z0-9_]*)/g, "$1,\n$2");

  return fixed;
}
