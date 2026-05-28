-- Images table: parallel to videos but no preprocessing or watermarking.
-- Only the original uploaded file is stored and displayed.

CREATE TABLE IF NOT EXISTS public.images (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename     text        NOT NULL,
  original_url text        NOT NULL,   -- Wasabi S3 key (resolved to presigned URL at read time)
  file_size    bigint,
  content_type text,
  status       text        DEFAULT 'uploaded',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own images"
  ON public.images FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own images"
  ON public.images FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own images"
  ON public.images FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to images"
  ON public.images FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON public.images TO authenticated;
GRANT ALL ON public.images TO service_role;
