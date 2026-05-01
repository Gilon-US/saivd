-- ============================================================================
-- Cross-app video transfer (creator → viewer) — staging table
-- ============================================================================
--
-- The creator app generates a one-time, time-limited token that lets a viewer
-- (running the saivd-viewer app) claim a single video into their own account.
--
-- Wire model:
--   Creator UI calls POST /api/transfers   (auth required)
--     → row inserted, plaintext token returned ONCE in the response.
--     → only sha256(token) stored in DB.
--   Viewer fetches GET /api/public/transfers/:token  (no auth)
--     → row looked up by sha256(token), expiry + claimed_at checked,
--       fresh 1h presigned download URL minted on each call.
--   Viewer POSTs /api/public/transfers/:token/mark-claimed once the file
--     has been copied to the viewer's bucket. Atomic update prevents replays.
--
-- File copy itself happens browser-side on the viewer (download from creator's
-- presigned URL → push through viewer's existing upload pipeline). The viewer
-- never touches this table or this database directly — only via the public
-- endpoints above. Creator's main `videos` table is not modified by transfers.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- sha256(plaintext token); plaintext is never stored. Unique to allow
  -- O(1) lookup by token and prevent silent collisions.
  token_hash TEXT NOT NULL UNIQUE,

  -- Single-video transfers in v1 (multi-video may come later — keep the
  -- schema honest about the v1 contract by using a singular FK).
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,

  -- Snapshot of the file metadata at the moment of share, so the viewer can
  -- preview filename/size before claiming and so the row stays self-describing
  -- even if the underlying video is later edited.
  filename TEXT NOT NULL,
  filesize BIGINT NOT NULL,
  content_type TEXT NOT NULL,

  -- Wasabi key for the video object at share time. The presigned download
  -- URL returned by the public GET endpoint is regenerated from this key on
  -- every request (1h TTL each), so leaks have a narrow window.
  storage_key TEXT NOT NULL,

  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 24h after creation by default (set in the API route, not here, so the
  -- TTL stays in code where it is reviewable).
  expires_at TIMESTAMPTZ NOT NULL,

  -- Set by /mark-claimed atomically. Once non-null, subsequent reads return 404.
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS transfers_expires_at_idx ON public.transfers (expires_at);
CREATE INDEX IF NOT EXISTS transfers_created_by_idx ON public.transfers (created_by);

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if present (idempotent re-run).
DROP POLICY IF EXISTS "Creators see own transfers" ON public.transfers;
DROP POLICY IF EXISTS "Creators create own transfers" ON public.transfers;
DROP POLICY IF EXISTS "Creators delete own transfers" ON public.transfers;

-- Creators can list / read their own active transfers (for a future
-- "My transfers" page; not used in v1 but no harm having the policy).
CREATE POLICY "Creators see own transfers"
  ON public.transfers FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Creators create own transfers"
  ON public.transfers FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators delete own transfers"
  ON public.transfers FOR DELETE
  USING (auth.uid() = created_by);

-- The public GET / mark-claimed endpoints use the service-role client to
-- bypass RLS, since the caller is unauthenticated and the auth is the token
-- itself. Token validation lives in the route, not in RLS, so do not add a
-- public-read policy here.

GRANT SELECT, INSERT, DELETE ON public.transfers TO authenticated;

COMMENT ON TABLE public.transfers IS
  'One-time, time-limited tokens granting a viewer the right to claim one video into their own account. See src/app/api/transfers + src/app/api/public/transfers.';
