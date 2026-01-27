-- Migration: Add source_url column to videos table for YouTube URL duplicate detection
-- This allows checking if a YouTube video has already been imported

ALTER TABLE videos ADD COLUMN source_url TEXT;

-- Index for fast lookup by source URL
CREATE INDEX IF NOT EXISTS idx_videos_source_url ON videos(source_url);
