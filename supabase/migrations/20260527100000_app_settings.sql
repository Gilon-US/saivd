-- App-wide key/value settings table.
-- Superusers manage values via Settings → General; the server reads them at runtime.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text        PRIMARY KEY,
  value       text        NOT NULL,
  description text,
  updated_at  timestamptz DEFAULT now(),
  updated_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (upload UI needs the limits)
CREATE POLICY "Authenticated users can read settings"
  ON public.app_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only service_role writes (API routes use the service client)
CREATE POLICY "Service role can write settings"
  ON public.app_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed defaults (idempotent)
INSERT INTO public.app_settings (key, value, description) VALUES
  ('max_video_size_mb', '500', 'Maximum video upload size in megabytes (integer)')
ON CONFLICT (key) DO NOTHING;
