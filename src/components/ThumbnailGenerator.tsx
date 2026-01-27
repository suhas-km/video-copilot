/**
 * Video Copilot - YouTube Thumbnail Generator Component
 * Generates YouTube thumbnails using Google Gemini AI
 */

"use client";

import {
  browserHistoryService,
  type StoredThumbnail,
} from "@/lib/database/browser-history-service";
import {
  COLOR_SCHEMES,
  type ColorScheme,
  getOptionLabel,
  MOOD_OPTIONS,
  type MoodOption,
  STYLE_MODIFIERS,
  type StyleModifier,
  type ThumbnailOptions,
  VISUAL_ELEMENTS,
  type VisualElement,
} from "@/lib/thumbnail/application/gemini-prompt-builder";
import { cn } from "@/utils/cn";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

/** Generation status */
type GenerationStatus = "idle" | "generating" | "success" | "error";

/** Result type for thumbnail generation */
interface ThumbnailResult {
  id: string;
  imageData: string;
  width: number;
  height: number;
  model: string;
  strategy: string;
  latencyMs: number;
  seed: number;
}

interface ThumbnailGeneratorProps {
  /** Video ID for linking thumbnail to analysis */
  videoId?: string;
  /** Video title for context */
  videoTitle?: string;
  /** Video description for context */
  videoDescription?: string;
  /** Video tags for context */
  videoTags?: string[];
  /** Transcription text for magic prompt */
  transcription?: string;
  /** Keyframe descriptions for magic prompt */
  keyframeDescriptions?: string[];
  /** Video duration in seconds */
  videoDuration?: number;
  /** Gemini API key for thumbnail generation */
  geminiApiKey?: string;
  /** Callback when thumbnail is generated */
  onGenerated?: (result: { id: string; imageData: string }) => void;
}

export function ThumbnailGenerator({
  videoId,
  videoTitle = "",
  videoDescription = "",
  videoTags,
  transcription,
  keyframeDescriptions,
  videoDuration,
  geminiApiKey,
  onGenerated,
}: ThumbnailGeneratorProps) {
  // Generation state
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [result, setResult] = useState<ThumbnailResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state - free-form description
  const [description, setDescription] = useState("");
  const [titleText, setTitleText] = useState("");

  // Clickable option states
  const [selectedVisualElements, setSelectedVisualElements] = useState<VisualElement[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StyleModifier | null>(null);
  const [selectedMood, setSelectedMood] = useState<MoodOption | null>(null);
  const [selectedColorScheme, setSelectedColorScheme] = useState<ColorScheme | null>(null);

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");

  // History state
  const [history, setHistory] = useState<StoredThumbnail[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Track last generation config for change detection
  const [lastGeneratedConfig, setLastGeneratedConfig] = useState<string | null>(null);
  const [configUnchangedWarning, setConfigUnchangedWarning] = useState(false);

  // Magic prompt state
  const [magicPromptLoading, setMagicPromptLoading] = useState(false);
  const [magicPromptError, setMagicPromptError] = useState<string | null>(null);

  /**
   * Load thumbnail history on mount
   */
  const loadHistory = useCallback(async () => {
    try {
      const thumbnails = await browserHistoryService.getThumbnails(20);
      setHistory(thumbnails);
    } catch (err) {
      console.error("Failed to load thumbnail history:", err);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /**
   * Handle magic prompt generation
   */
  const handleMagicPrompt = async () => {
    // Check if we have any context data
    if (!transcription && !keyframeDescriptions?.length && !videoTitle && !videoDescription) {
      setMagicPromptError("No video data available for magic prompt. Complete analysis first.");
      setTimeout(() => setMagicPromptError(null), 3000);
      return;
    }

    setMagicPromptLoading(true);
    setMagicPromptError(null);

    try {
      const response = await fetch("/api/thumbnails/magic-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription,
          keyframeDescriptions,
          title: videoTitle,
          description: videoDescription,
          tags: videoTags,
          duration: videoDuration,
          geminiApiKey,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Magic prompt failed: ${response.status}`);
      }

      const data = await response.json();

      // Auto-populate the description field
      setDescription(data.prompt);

      // Optionally set mood and color scheme if available
      if (data.mood) {
        const moodKey = data.mood.toUpperCase().replace(/\s+/g, "_") as MoodOption;
        if (MOOD_OPTIONS[moodKey]) {
          setSelectedMood(moodKey);
        }
      }

      if (data.colorScheme) {
        const colorKey = data.colorScheme.toUpperCase().replace(/\s+/g, "_") as ColorScheme;
        if (COLOR_SCHEMES[colorKey]) {
          setSelectedColorScheme(colorKey);
        }
      }
    } catch (err) {
      setMagicPromptError(err instanceof Error ? err.message : "Failed to generate magic prompt");
    } finally {
      setMagicPromptLoading(false);
    }
  };

  /**
   * Check if magic prompt is available
   */
  const hasMagicPromptData = !!(transcription || keyframeDescriptions?.length || videoTitle || videoDescription);

  /**
   * Toggle visual element selection
   */
  const toggleVisualElement = (element: VisualElement) => {
    setSelectedVisualElements((prev) =>
      prev.includes(element) ? prev.filter((e) => e !== element) : [...prev, element]
    );
  };

  /**
   * Get current config as string for comparison
   */
  const getCurrentConfigHash = () => {
    return JSON.stringify({
      description: description.trim(),
      titleText: titleText.trim(),
      visualElements: selectedVisualElements,
      style: selectedStyle,
      mood: selectedMood,
      colorScheme: selectedColorScheme,
      customInstructions: customInstructions.trim(),
    });
  };

  /**
   * Handle thumbnail generation
   */
  const handleGenerate = async () => {
    // At least description or some options should be provided
    if (!description.trim() && selectedVisualElements.length === 0 && !selectedStyle && !selectedMood) {
      setError("Please provide a description or select some options");
      return;
    }

    // Check if config is unchanged from last generation
    const currentConfig = getCurrentConfigHash();
    if (lastGeneratedConfig === currentConfig && result) {
      setConfigUnchangedWarning(true);
      setTimeout(() => setConfigUnchangedWarning(false), 3000);
      return;
    }

    setStatus("generating");
    setError(null);
    setSaveStatus("idle"); // Reset save status for new generation
    setConfigUnchangedWarning(false);

    try {
      const options: ThumbnailOptions = {
        description: description.trim() || undefined,
        titleText: titleText.trim() || undefined,
        videoTitle: videoTitle || undefined,
        videoDescription: videoDescription || undefined,
        visualElements: selectedVisualElements.length > 0 ? selectedVisualElements : undefined,
        style: selectedStyle || undefined,
        mood: selectedMood || undefined,
        colorScheme: selectedColorScheme || undefined,
        customInstructions: customInstructions.trim() || undefined,
      };

      const response = await fetch("/api/thumbnails/generate-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          options,
          videoId,
          geminiApiKey,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Generation failed: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      setStatus("success");
      setLastGeneratedConfig(currentConfig); // Store config for comparison

      if (onGenerated) {
        onGenerated({ id: data.id, imageData: data.imageData });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate thumbnail");
      setStatus("error");
    }
  };

  /**
   * Download thumbnail as PNG
   */
  const handleDownload = () => {
    if (!result) return;

    const link = document.createElement("a");
    link.href = result.imageData;
    link.download = `thumbnail-${result.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * Reset form
   */
  const handleReset = () => {
    setStatus("idle");
    setResult(null);
    setError(null);
    setSaveStatus("idle");
  };

  /**
   * Save thumbnail to history
   */
  const handleSave = async () => {
    if (!result) return;

    setSaveStatus("saving");
    try {
      const thumbnailToSave: StoredThumbnail = {
        id: result.id,
        videoId: videoId,
        imageData: result.imageData,
        titleText: titleText || description.slice(0, 50),
        topic: description || videoTitle || "thumbnail",
        style: selectedStyle || "CUSTOM",
        model: result.model,
        strategy: result.strategy,
        seed: result.seed,
        generatedAt: new Date(),
      };

      await browserHistoryService.saveThumbnail(thumbnailToSave);
      setSaveStatus("saved");
      await loadHistory();
    } catch (err) {
      console.error("Failed to save thumbnail:", err);
      setError("Failed to save thumbnail to history");
      setSaveStatus("idle");
    }
  };

  /**
   * Delete thumbnail from history
   */
  const handleDeleteFromHistory = async (thumbnailId: string) => {
    try {
      await browserHistoryService.deleteThumbnail(thumbnailId);
      await loadHistory();
    } catch (err) {
      console.error("Failed to delete thumbnail:", err);
    }
  };

  /**
   * Check if form has any input
   */
  const hasInput =
    description.trim().length > 0 ||
    selectedVisualElements.length > 0 ||
    selectedStyle !== null ||
    selectedMood !== null;

  return (
    <div className="mx-auto w-full max-w-4xl rounded-xl border border-gray-700/50 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 shadow-2xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-white">
            <span className="text-3xl">🎨</span>
            YouTube Thumbnail Generator
          </h2>
          <p className="mt-1 text-sm text-gray-400">AI-powered thumbnails using Google Gemini</p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "rounded-lg px-4 py-2 font-medium transition-all",
              showHistory
                ? "bg-purple-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            )}
          >
            {showHistory ? "Hide History" : `History (${history.length})`}
          </button>
        )}
      </div>

      {/* History Panel */}
      {showHistory && history.length > 0 && (
        <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
          <h3 className="mb-3 text-lg font-semibold text-white">Saved Thumbnails</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {history.slice(0, 8).map((thumb) => (
              <div
                key={thumb.id}
                className="group relative cursor-pointer overflow-hidden rounded-lg border border-gray-600 transition-all hover:border-purple-500"
              >
                <Image
                  src={thumb.imageData}
                  alt={thumb.titleText}
                  className="aspect-video w-full object-cover"
                  width={320}
                  height={180}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1 text-xs text-white truncate">
                  {thumb.titleText}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFromHistory(thumb.id);
                  }}
                  className="absolute right-1 top-1 h-6 w-6 rounded-full bg-red-600 text-xs text-white opacity-0 transition-opacity hover:bg-red-700 group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      <div className="mb-6 space-y-5">
        {/* Free-form Description with Magic Prompt */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Describe your thumbnail
            </label>
            <button
              onClick={handleMagicPrompt}
              disabled={magicPromptLoading || !hasMagicPromptData}
              title={hasMagicPromptData ? "Generate AI-powered prompt from video analysis" : "Complete video analysis to use Magic Prompt"}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                magicPromptLoading
                  ? "cursor-wait bg-purple-700/50 text-purple-300"
                  : hasMagicPromptData
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg hover:from-purple-700 hover:to-pink-700 hover:shadow-purple-500/25"
                    : "cursor-not-allowed bg-gray-700 text-gray-500"
              )}
            >
              {magicPromptLoading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Generating...
                </>
              ) : (
                <>
                  <span className="text-lg">✨</span>
                  Magic Prompt
                </>
              )}
            </button>
          </div>
          <div className="relative">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you want to see... e.g., 'A shocked person looking at a computer screen showing crypto charts going up'"
              rows={3}
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-transparent focus:ring-2 focus:ring-purple-500"
            />
          </div>
          {magicPromptError && (
            <p className="mt-2 text-sm text-red-400">{magicPromptError}</p>
          )}
        </div>

        {/* Optional Title Text */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">
            Text to include <span className="text-gray-500">(optional)</span>
          </label>
          <input
            type="text"
            value={titleText}
            onChange={(e) => setTitleText(e.target.value)}
            placeholder="e.g., SHOCKING RESULTS!"
            maxLength={50}
            className="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-transparent focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Visual Elements - Clickable Chips */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Visual Elements</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(VISUAL_ELEMENTS) as VisualElement[]).map((element) => (
              <button
                key={element}
                onClick={() => toggleVisualElement(element)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-all",
                  selectedVisualElements.includes(element)
                    ? "bg-purple-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                )}
              >
                {selectedVisualElements.includes(element) ? "✓ " : "+ "}
                {getOptionLabel("visualElements", element)}
              </button>
            ))}
          </div>
        </div>

        {/* Style Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Style</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STYLE_MODIFIERS) as StyleModifier[]).map((style) => (
              <button
                key={style}
                onClick={() => setSelectedStyle(selectedStyle === style ? null : style)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-all",
                  selectedStyle === style
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                )}
              >
                {getOptionLabel("styles", style)}
              </button>
            ))}
          </div>
        </div>

        {/* Mood Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Mood / Energy</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MOOD_OPTIONS) as MoodOption[]).map((mood) => (
              <button
                key={mood}
                onClick={() => setSelectedMood(selectedMood === mood ? null : mood)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-all",
                  selectedMood === mood
                    ? "bg-orange-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                )}
              >
                {getOptionLabel("moods", mood)}
              </button>
            ))}
          </div>
        </div>

        {/* Color Scheme Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Color Scheme</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(COLOR_SCHEMES) as ColorScheme[]).map((scheme) => (
              <button
                key={scheme}
                onClick={() => setSelectedColorScheme(selectedColorScheme === scheme ? null : scheme)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-all",
                  selectedColorScheme === scheme
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                )}
              >
                {getOptionLabel("colorSchemes", scheme)}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Options Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          <span className={cn("transition-transform", showAdvanced ? "rotate-90" : "")}>▶</span>
          Advanced Options
        </button>

        {/* Advanced Options */}
        {showAdvanced && (
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Custom Instructions
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Any additional specific requirements..."
              rows={2}
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-white placeholder-gray-500"
            />
          </div>
        )}
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={status === "generating" || !hasInput}
        className={cn(
          "w-full rounded-lg py-4 text-lg font-bold transition-all",
          status === "generating"
            ? "cursor-wait bg-purple-700 text-white"
            : hasInput
              ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg hover:from-purple-700 hover:to-pink-700 hover:shadow-purple-500/25"
              : "cursor-not-allowed bg-gray-700 text-gray-400"
        )}
      >
        {status === "generating" ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            Generating with Gemini...
          </span>
        ) : (
          "✨ Generate Thumbnail"
        )}
      </button>

      {/* Config Unchanged Warning */}
      {configUnchangedWarning && (
        <div className="mt-4 rounded-lg border border-yellow-700 bg-yellow-900/30 p-4">
          <p className="text-sm text-yellow-400">
            ⚠️ Configuration unchanged. Please modify your description, style, or other options before regenerating.
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-700 bg-red-900/30 p-4">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={handleReset}
            className="mt-2 text-xs text-red-300 underline hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Result Display */}
      {result && status === "success" && (
        <div className="mt-6 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-purple-400">
                {result.width}×{result.height}
              </p>
              <p className="text-xs text-gray-500">Resolution</p>
            </div>
            <div className="rounded-lg bg-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-purple-400">{result.model.split("/").pop()}</p>
              <p className="text-xs text-gray-500">Model</p>
            </div>
            <div className="rounded-lg bg-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-purple-400">
                {(result.latencyMs / 1000).toFixed(1)}s
              </p>
              <p className="text-xs text-gray-500">Generation Time</p>
            </div>
            <div className="rounded-lg bg-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-purple-400">{result.strategy}</p>
              <p className="text-xs text-gray-500">Strategy</p>
            </div>
          </div>

          {/* Thumbnail Preview */}
          <div className="relative overflow-hidden rounded-lg border border-gray-600">
            <Image
              src={result.imageData}
              alt="Generated thumbnail"
              className="aspect-video w-full bg-black object-contain"
              width={640}
              height={360}
            />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={handleDownload}
              className="rounded-lg bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              📥 Download
            </button>
            <button
              onClick={handleSave}
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              className={cn(
                "rounded-lg py-3 font-medium text-white transition-colors",
                saveStatus === "saved"
                  ? "bg-green-700 cursor-default"
                  : saveStatus === "saving"
                    ? "bg-green-600/50 cursor-wait"
                    : "bg-green-600 hover:bg-green-700"
              )}
            >
              {saveStatus === "saved" ? "✓ Saved" : saveStatus === "saving" ? "Saving..." : "💾 Save"}
            </button>
            <button
              onClick={handleGenerate}
              className="rounded-lg bg-gray-600 py-3 font-medium text-white transition-colors hover:bg-gray-500"
            >
              🔄 Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
