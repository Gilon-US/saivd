import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get the pathname from the URL
  const { pathname } = request.nextUrl;

  // Check if this is the root route
  const isRootRoute = pathname === '/';

  // Protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/profile', '/videos'];
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  // Auth routes that should redirect to dashboard if already authenticated
  const authRoutes = ['/login', '/register'];
  const isAuthRoute = authRoutes.some(route => pathname === route);

  // Protected API routes pattern
  const isProtectedApiRoute = pathname.startsWith('/api/') && 
    !pathname.startsWith('/api/health') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/api/auth-test') &&
    !pathname.startsWith('/api/videos/upload') && // Allow upload endpoint (handles its own auth)
    !pathname.startsWith('/api/callbacks');

  // Redirect if accessing protected route without authentication
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect to video grid dashboard if accessing auth routes or root route while already authenticated
  if ((isAuthRoute || isRootRoute) && user) {
    return NextResponse.redirect(new URL('/dashboard/videos', request.url));
  }
  
  // Redirect to login if accessing root route without authentication
  if (isRootRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Handle protected API routes
  if (isProtectedApiRoute && !user) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  return supabaseResponse;
}
