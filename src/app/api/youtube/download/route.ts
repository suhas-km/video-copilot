import { videoRepository } from "@/lib/database/repositories/video-repository";
import { logError, logInfo } from "@/lib/logger";
import { existsSync } from "fs";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { platform } from "os";
import path from "path";
import { create } from "youtube-dl-exec";
import { validateRequestBody, youtubeDownloadSchema } from "../../../../lib/security/api-schemas";

/**
 * Detects the yt-dlp binary path based on the operating system.
 * Prefers system-installed yt-dlp (has proper SSL certs) over bundled binary.
 */
function findYtDlpPath(): string {
  const os = platform();

  // OS-specific system paths to check (preferred - has proper SSL certificates)
  const systemPaths: Record<string, string[]> = {
    darwin: [
      "/opt/homebrew/bin/yt-dlp", // macOS ARM (Apple Silicon)
      "/usr/local/bin/yt-dlp", // macOS Intel (Homebrew)
    ],
    linux: [
      "/usr/local/bin/yt-dlp", // Linux local install
      "/usr/bin/yt-dlp", // Linux system package
      "/snap/bin/yt-dlp", // Linux Snap package
    ],
    win32: [
      "C:\\Program Files\\yt-dlp\\yt-dlp.exe",
      "C:\\ProgramData\\chocolatey\\bin\\yt-dlp.exe", // Chocolatey
      path.join(
        process.env.LOCALAPPDATA || "",
        "Microsoft",
        "WinGet",
        "Packages",
        "yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe",
        "yt-dlp.exe"
      ), // WinGet
    ],
  };

  // Try system paths first (preferred - proper SSL certificates)
  const pathsToCheck = systemPaths[os] || [];
  for (const p of pathsToCheck) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Fallback to bundled binary in node_modules
  const bundledPath = path.join(
    process.cwd(),
    "node_modules",
    "youtube-dl-exec",
    "bin",
    os === "win32" ? "yt-dlp.exe" : "yt-dlp"
  );

  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  // Return 'yt-dlp' to try PATH as last resort
  return "yt-dlp";
}

/**
 * Returns OS-specific installation instructions for yt-dlp.
 */
function getInstallInstructions(): string {
  const os = platform();

  switch (os) {
    case "darwin":
      return "yt-dlp not found. Install with: brew install yt-dlp";
    case "linux":
      return "yt-dlp not found. Install with: sudo apt install yt-dlp OR sudo pip install yt-dlp OR sudo snap install yt-dlp";
    case "win32":
      return "yt-dlp not found. Install with: winget install yt-dlp OR choco install yt-dlp OR download from https://github.com/yt-dlp/yt-dlp/releases";
    default:
      return "yt-dlp not found. Please install yt-dlp from https://github.com/yt-dlp/yt-dlp#installation";
  }
}

// Create ytdl instance with detected yt-dlp path
const ytdlPath = findYtDlpPath();
const ytdl = create(ytdlPath);
logInfo(`[YouTube Download] Using yt-dlp at: ${ytdlPath}`, "youtube-download");

interface DownloadResponse {
  success: boolean;
  filePath?: string;
  filename?: string;
  duration?: number;
  width?: number;
  height?: number;
  fileSize?: number;
  title?: string;
  description?: string;
  sourceUrl?: string;
  error?: string;
  /** If true, this video was already imported before */
  isDuplicate?: boolean;
  /** Existing video ID if duplicate */
  existingVideoId?: string;
  /** Existing filename if duplicate */
  existingFilename?: string;
}

/**
 * Sanitizes a string to be safe for use as a filename.
 * Removes/replaces characters that are invalid on most filesystems.
 */
function sanitizeFilename(title: string, maxLength: number = 100): string {
  if (!title) {
    return "untitled";
  }
  
  // Replace invalid characters with underscores
  let sanitized = title
    .replace(/[<>:"/\\|?*]/g, "_") // Windows invalid chars
    // eslint-disable-next-line no-control-regex -- Intentional: removing control chars for safe filenames
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\s+/g, "_")           // Whitespace to underscores
    .replace(/_+/g, "_")            // Multiple underscores to single
    .replace(/^_+|_+$/g, "");       // Trim underscores
  
  // Truncate to max length (leave room for extension and counter)
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized || "untitled";
}

/**
 * Generates a unique filename, adding counter if file already exists.
 */
async function getUniqueFilename(uploadsDir: string, baseName: string, extension: string): Promise<string> {
  let filename = `${baseName}${extension}`;
  let filePath = path.join(uploadsDir, filename);
  let counter = 1;
  
  while (existsSync(filePath)) {
    filename = `${baseName}_${counter}${extension}`;
    filePath = path.join(uploadsDir, filename);
    counter++;
  }
  
  return filename;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body with Zod schema
    const validation = validateRequestBody(youtubeDownloadSchema, body);
    if (!validation.success) {
      return NextResponse.json<DownloadResponse>(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { url, forceReimport } = validation.data as { url: string; forceReimport?: boolean };

    // Check for duplicate URL in database (unless force reimport)
    if (!forceReimport) {
      try {
        const existingVideo = videoRepository.getVideoBySourceUrl(url);
        if (existingVideo) {
          logInfo("[YouTube Download] Duplicate URL found: " + url, "youtube-download", {
            existingVideoId: existingVideo.id,
            existingFilename: existingVideo.filename,
          });
          
          return NextResponse.json<DownloadResponse>({
            success: true,
            isDuplicate: true,
            existingVideoId: existingVideo.id,
            existingFilename: existingVideo.filename,
            title: existingVideo.filename.replace(/\.mp4$/, "").replace(/_/g, " "),
            sourceUrl: url,
          });
        }
      } catch (dbError) {
        // Database not initialized yet, continue with download
        logInfo("[YouTube Download] Database not ready, skipping duplicate check", "youtube-download");
      }
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    // First, get video metadata to use title for filename
    logInfo("[YouTube Download] Fetching video metadata: " + url, "youtube-download");
    
    let videoTitle = "";
    let videoDescription = "";
    let duration = 0;
    let width = 0;
    let height = 0;
    
    try {
      const videoInfoResult = await ytdl.exec(url, {
        dumpSingleJson: true,
        noWarnings: true,
      });
      
      const videoInfo = JSON.parse(videoInfoResult.stdout || "{}");
      videoTitle = videoInfo.title || videoInfo.fulltitle || "";
      videoDescription = videoInfo.description || "";
      duration = videoInfo.duration || 0;
      width = videoInfo.width || 0;
      height = videoInfo.height || 0;
    } catch (e) {
      logInfo("[YouTube Download] Could not parse video info, using fallback", "youtube-download");
    }

    // Generate filename from sanitized title
    const sanitizedTitle = sanitizeFilename(videoTitle || extractVideoId(url));
    const filename = await getUniqueFilename(uploadsDir, sanitizedTitle, ".mp4");
    const filePath = path.join(uploadsDir, filename);

    logInfo("[YouTube Download] Starting download: " + url, "youtube-download");
    logInfo("[YouTube Download] Output path: " + filePath, "youtube-download");

    // Download video at max 720p resolution (reduces file size significantly)
    // Format: best video up to 720p + best audio, merged to mp4
    // Example: 4K video (333MB) → 720p (~50MB)
    const MAX_HEIGHT = 720;
    await ytdl.exec(url, {
      output: filePath,
      format: `bestvideo[height<=${MAX_HEIGHT}]+bestaudio/best[height<=${MAX_HEIGHT}]/best`,
      mergeOutputFormat: "mp4",
      noWarnings: true,
      noPlaylist: true,
      ignoreErrors: true,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ageLimit: 100, // Set age limit to 100 years to bypass age-gated videos
    });

    logInfo("[YouTube Download] Download complete", "youtube-download");

    // Get file stats
    const stats = await fs.stat(filePath);

    logInfo("[YouTube Download] Metadata extracted", "youtube-download", {
      duration,
      width,
      height,
      title: videoTitle,
      fileSize: stats.size,
    });

    return NextResponse.json<DownloadResponse>({
      success: true,
      filePath,
      filename,
      duration,
      width,
      height,
      title: videoTitle,
      description: videoDescription,
      sourceUrl: url,
      fileSize: stats.size,
    });
  } catch (error: unknown) {
    logError(error instanceof Error ? error : new Error(String(error)), "youtube-download");

    // Extract useful error information
    const err = error as {
      message?: string;
      stderr?: string;
      code?: string;
      spawnargs?: string[];
    };

    const errorMessage = err.message || String(error);
    const stderr = err.stderr || "";

    // Check if yt-dlp binary was not found (ENOENT specifically on the binary path)
    const isNotFoundError = (errorMessage.includes("ENOENT") && !stderr) || err.code === "ENOENT";

    // Check for SSL certificate errors (common with bundled yt-dlp)
    const isSSLError = stderr.includes("SSL") || stderr.includes("CERTIFICATE_VERIFY_FAILED");

    let userError: string;

    if (isNotFoundError) {
      userError = getInstallInstructions();
    } else if (isSSLError) {
      userError = `SSL certificate error. ${getInstallInstructions()} (System-installed version has proper SSL certificates)`;
    } else if (stderr) {
      // Use yt-dlp's stderr which has the actual error message
      const stderrLines = stderr.split("\n").filter((line: string) => line.startsWith("ERROR:"));
      const firstError = stderrLines[0];
      userError = firstError ? firstError.replace("ERROR: ", "") : stderr.slice(0, 200);
    } else {
      userError = errorMessage || "Failed to download video";
    }

    return NextResponse.json<DownloadResponse>(
      {
        success: false,
        error: userError,
      },
      { status: 500 }
    );
  }
}

function extractVideoId(url: string): string {
  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}
