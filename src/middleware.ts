import { type NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Root route
    '/',
    // Auth routes
    '/login',
    '/register',
    // Protected routes
    '/dashboard/:path*',
    '/profile/:path*',
    '/videos/:path*',
    // API routes
    '/api/:path*',
  ],
};
