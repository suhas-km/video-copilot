"use client";

import { Check, Loader2, Settings as SettingsIcon, X } from "lucide-react";
import { useState } from "react";

type ApiTier = "free" | "pay_as_you_go" | "enterprise";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deepgramApiKey: string;
  geminiApiKey: string;
  onDeepgramKeyChange: (key: string) => void;
  onGeminiKeyChange: (key: string) => void;
  apiTier?: ApiTier;
  onApiTierChange?: (tier: ApiTier) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  deepgramApiKey,
  geminiApiKey,
  onDeepgramKeyChange,
  onGeminiKeyChange,
  apiTier = "pay_as_you_go",
  onApiTierChange,
}: SettingsModalProps) {
  const [testingDeepgram, setTestingDeepgram] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [deepgramStatus, setDeepgramStatus] = useState<"idle" | "success" | "error">("idle");
  const [geminiStatus, setGeminiStatus] = useState<"idle" | "success" | "error">("idle");
  const [deepgramError, setDeepgramError] = useState("");
  const [geminiError, setGeminiError] = useState("");

  const testDeepgramKey = async () => {
    if (!deepgramApiKey) {
      setDeepgramError("Please enter an API key first");
      return;
    }

    setTestingDeepgram(true);
    setDeepgramStatus("idle");
    setDeepgramError("");

    try {
      const response = await fetch("/api/deepgram/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: deepgramApiKey }),
      });

      const data = (await response.json()) as { valid?: boolean; error?: string };

      if (response.ok && data.valid) {
        setDeepgramStatus("success");
      } else {
        setDeepgramError(data.error || "Invalid API key");
        setDeepgramStatus("error");
      }
    } catch (err) {
      setDeepgramError("Failed to validate API key");
      setDeepgramStatus("error");
    } finally {
      setTestingDeepgram(false);
    }
  };

  const testGeminiKey = async () => {
    if (!geminiApiKey) {
      setGeminiError("Please enter an API key first");
      return;
    }

    setTestingGemini(true);
    setGeminiStatus("idle");
    setGeminiError("");

    try {
      const response = await fetch("/api/gemini/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: geminiApiKey }),
      });

      const data = (await response.json()) as { valid?: boolean; error?: string };

      if (response.ok && data.valid) {
        setGeminiStatus("success");
      } else {
        setGeminiError(data.error || "Invalid API key");
        setGeminiStatus("error");
      }
    } catch (err) {
      setGeminiError("Failed to validate API key");
      setGeminiStatus("error");
    } finally {
      setTestingGemini(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-gray-700 bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-700 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20">
              <SettingsIcon className="h-4 w-4 text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Configure your API keys</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Deepgram API Key */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Deepgram API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={deepgramApiKey}
                onChange={(e) => {
                  onDeepgramKeyChange(e.target.value);
                  setDeepgramStatus("idle");
                  setDeepgramError("");
                }}
                placeholder="Enter your Deepgram API key"
                className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={testDeepgramKey}
                disabled={!deepgramApiKey || testingDeepgram}
                className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-300 transition-all hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testingDeepgram ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : deepgramStatus === "success" ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  "Test"
                )}
              </button>
            </div>
            {deepgramError && <p className="mt-1 text-xs text-red-400">{deepgramError}</p>}
            {deepgramStatus === "success" && (
              <p className="mt-1 text-xs text-green-400">API key is valid!</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Required for video transcription. Get your key from{" "}
              <a
                href="https://console.deepgram.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                Deepgram Console
              </a>
            </p>
          </div>

          {/* Gemini API Key */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Gemini API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => {
                  onGeminiKeyChange(e.target.value);
                  setGeminiStatus("idle");
                  setGeminiError("");
                }}
                placeholder="Enter your Gemini API key"
                className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={testGeminiKey}
                disabled={!geminiApiKey || testingGemini}
                className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-300 transition-all hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testingGemini ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : geminiStatus === "success" ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  "Test"
                )}
              </button>
            </div>
            {geminiError && <p className="mt-1 text-xs text-red-400">{geminiError}</p>}
            {geminiStatus === "success" && (
              <p className="mt-1 text-xs text-green-400">API key is valid!</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Required for video analysis and insights. Get your key from{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300"
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {/* Analysis Speed / API Tier */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Analysis Speed
            </label>
            <select
              value={apiTier}
              onChange={(e) => onApiTierChange?.(e.target.value as ApiTier)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="free">🐢 Conservative (Sequential) - Free tier API</option>
              <option value="pay_as_you_go">⚡ Fast (3 Parallel) - Pay-as-you-go API</option>
              <option value="enterprise">🚀 Maximum Speed (8 Parallel) - High-rate API</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {apiTier === "free" && "Analyzes categories one at a time. Best for free-tier Gemini API keys (5 req/min)."}
              {apiTier === "pay_as_you_go" && "Runs 3 categories in parallel. Recommended for paid Gemini API keys."}
              {apiTier === "enterprise" && "Runs all 8 categories simultaneously. Fastest but requires high rate limits."}
            </p>
          </div>

          {/* Status Indicators - Inline */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-700/30 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  deepgramStatus === "success"
                    ? "bg-green-500"
                    : deepgramStatus === "error"
                      ? "bg-red-500"
                      : deepgramApiKey
                        ? "bg-green-500"
                        : "bg-red-500"
                }`}
              />
              <span className="text-xs text-gray-400">Deepgram</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  geminiStatus === "success"
                    ? "bg-green-500"
                    : geminiStatus === "error"
                      ? "bg-red-500"
                      : geminiApiKey
                        ? "bg-green-500"
                        : "bg-red-500"
                }`}
              />
              <span className="text-xs text-gray-400">Gemini</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end border-t border-gray-700 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
