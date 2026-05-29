-- Per-creator presentation QR overlay corner (creator + viewer apps).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qr_overlay_position text NOT NULL DEFAULT 'top-right';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_qr_overlay_position_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_qr_overlay_position_check
  CHECK (qr_overlay_position IN ('top-right', 'top-left', 'bottom-right', 'bottom-left'));
