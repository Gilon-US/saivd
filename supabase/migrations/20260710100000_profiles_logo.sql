-- Creator brand logo for presentation QR flip (separate from profile photo).
-- Null means clients should fall back to the default SAIVD logo asset.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS logo TEXT;

COMMENT ON COLUMN public.profiles.logo IS
  'S3 key or URL for creator brand logo used on QR flip overlay; null = default SAIVD logo';
