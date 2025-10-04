import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/videos
 * 
 * Retrieves a list of videos for the authenticated user.
 * Supports pagination, sorting, and filtering.
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Number of items per page (default: 20)
 * - sortBy: Field to sort by (default: 'upload_date')
 * - sortOrder: Sort order ('asc' or 'desc', default: 'desc')
 * - contentType: Filter by content type (optional)
 * 
 * Response:
 * - success: Boolean indicating if the request was successful
 * - data: Object containing videos and pagination information
 * - error: Object containing error details if request failed
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    
    if (!data.user) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    // Get query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const sortBy = url.searchParams.get('sortBy') || 'upload_date';
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';
    const contentType = url.searchParams.get('contentType');
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { success: false, error: { code: 'validation_error', message: 'Invalid pagination parameters' } },
        { status: 400 }
      );
    }
    
    // Calculate pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    // Build query
    let query = supabase
      .from('videos')
      .select('*', { count: 'exact' })
      .eq('user_id', data.user.id)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);
    
    // Apply content type filter if provided
    if (contentType) {
      query = query.eq('content_type', contentType);
    }
    
    // Execute query
    const { data: videos, error, count } = await query;
      
    if (error) {
      console.error('Error fetching videos:', error);
      return NextResponse.json(
        { success: false, error: { code: 'database_error', message: 'Failed to fetch videos' } },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        videos,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching videos:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Server error' } },
      { status: 500 }
    );
  }
}
