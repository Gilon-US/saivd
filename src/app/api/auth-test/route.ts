import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    
    // Debug logging for authentication
    const cookieHeader = request.headers.get('cookie');
    const allCookies = request.cookies.getAll();
    const supabaseCookies = allCookies.filter(c => c.name.startsWith('sb-'));
    
    const authInfo = {
      hasUser: !!data?.user,
      userId: data?.user?.id,
      email: data?.user?.email,
      cookieCount: allCookies.length,
      supabaseCookieCount: supabaseCookies.length,
      supabaseCookieNames: supabaseCookies.map(c => c.name),
      hasCookieHeader: !!cookieHeader,
      cookieHeaderLength: cookieHeader?.length || 0,
    };
    
    console.log('Auth test endpoint:', authInfo);
    
    return NextResponse.json({
      success: true,
      authenticated: !!data?.user,
      authInfo
    });
  } catch (error: unknown) {
    console.error('Error in auth test endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
