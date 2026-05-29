-- Allow one-time transfers for images (creator → viewer), mirroring video transfers.

ALTER TABLE public.transfers
  ALTER COLUMN video_id DROP NOT NULL;

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS image_id UUID REFERENCES public.images(id) ON DELETE CASCADE;

ALTER TABLE public.transfers
  DROP CONSTRAINT IF EXISTS transfers_one_asset;

ALTER TABLE public.transfers
  ADD CONSTRAINT transfers_one_asset CHECK (
    (video_id IS NOT NULL AND image_id IS NULL)
    OR (video_id IS NULL AND image_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS transfers_image_id_idx ON public.transfers (image_id);

COMMENT ON COLUMN public.transfers.image_id IS
  'Set for image shares; video_id is null. Exactly one of video_id / image_id must be set.';
