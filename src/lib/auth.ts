import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { type CookieOptions } from '@supabase/ssr';
import { type User } from '@supabase/supabase-js';

/**
 * Creates a Supabase server client with the provided cookies
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}

/**
 * Middleware function to protect API routes
 * @param handler The API route handler function
 * @returns A new handler function that checks authentication before calling the original handler
 */
export function withAuth<T>(
  handler: (req: NextRequest, user: User) => Promise<NextResponse<T>>
) {
  return async (req: NextRequest) => {
    const supabase = await createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    return handler(req, session.user);
  };
}
