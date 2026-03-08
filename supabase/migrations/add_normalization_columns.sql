-- Add normalization columns to videos table for normalize_video flow.
-- normalized_url: S3 key of the -clean (normalized) file; used for streaming and as watermark input.
-- normalization_status: pending | normalizing | completed | failed.
-- normalization_message: Progress or error text from normalize callback.

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS normalized_url TEXT,
  ADD COLUMN IF NOT EXISTS normalization_status TEXT,
  ADD COLUMN IF NOT EXISTS normalization_message TEXT;

COMMENT ON COLUMN public.videos.normalized_url IS 'S3 key of the normalized (-clean) file for streaming and stable Y-channel decoding.';
COMMENT ON COLUMN public.videos.normalization_status IS 'Status of normalize job: pending, normalizing, completed, or failed.';
COMMENT ON COLUMN public.videos.normalization_message IS 'Progress or error message from normalize callback.';

CREATE INDEX IF NOT EXISTS idx_videos_normalization_status
  ON public.videos(normalization_status);
