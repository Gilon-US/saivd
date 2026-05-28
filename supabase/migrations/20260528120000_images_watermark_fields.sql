-- Phase 2: extend public.images with watermark output + processed dimensions.
-- Additive only — the original images_table.sql (20260527110000) stays untouched.
--
-- Status field stays untyped (no CHECK) to match the existing column shape;
-- application code enforces the value set {uploaded, processing, processed, failed}.

ALTER TABLE public.images
  ADD COLUMN IF NOT EXISTS processed_url TEXT,
  ADD COLUMN IF NOT EXISTS width INT,
  ADD COLUMN IF NOT EXISTS height INT,
  ADD COLUMN IF NOT EXISTS watermark_error TEXT,
  ADD COLUMN IF NOT EXISTS watermarked_at TIMESTAMPTZ;

-- Index for filtering by status (the dashboard wants 'processed' images first).
CREATE INDEX IF NOT EXISTS images_status_idx ON public.images (status);

-- (RLS policies on public.images already cover SELECT/INSERT/DELETE for the
-- owning user. UPDATE was not granted in the original migration. The
-- application updates processed_url etc. via the service role client, so
-- no policy change is required.)
