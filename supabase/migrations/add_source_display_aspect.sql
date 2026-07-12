-- Store true display aspect ratio (width/height) captured at upload for player layout.
-- Used when watermarked outputs omit SAR metadata; does not affect watermark encode.

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS source_display_aspect DOUBLE PRECISION;

COMMENT ON COLUMN public.videos.source_display_aspect IS
  'Display aspect ratio (width/height) from the uploaded source, including SAR when present.';
