/**
 * This file is kept for backward compatibility.
 * New code should use the utility functions in @/utils/supabase/client.ts and @/utils/supabase/server.ts
 */

import { createClient as createBrowserClient } from '@/utils/supabase/client';

// Create a Supabase client for browser usage
export const supabase = createBrowserClient();

// Helper function to get user from session
export const getUserFromSession = async () => {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
};
