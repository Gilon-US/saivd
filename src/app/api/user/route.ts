import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

/**
 * GET /api/user
 * Returns the current user's information
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      }
    }
  });
});
