-- Add callback_received_at to track when the watermark completion webhook was invoked.
-- When non-null, the video was updated by the external service callback (not polling).
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS callback_received_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_videos_callback_received_at
ON public.videos(callback_received_at)
WHERE callback_received_at IS NOT NULL;

COMMENT ON COLUMN public.videos.callback_received_at IS 'Timestamp when the watermark completion webhook callback was received and processed. NULL if callback has not been invoked.';
