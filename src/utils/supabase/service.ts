import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with service role key.
 * Bypasses RLS - use only for server-side, unauthenticated flows (e.g. webhooks).
 * Never expose this client or the service role key to the browser.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing required env vars for service role client: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, key);
}
