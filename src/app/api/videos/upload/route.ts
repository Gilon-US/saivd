import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { wasabiClient, WASABI_BUCKET, MAX_FILE_SIZE, ALLOWED_VIDEO_TYPES, URL_EXPIRATION_SECONDS } from '@/lib/wasabi';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/videos/upload
 * 
 * Generates a pre-signed URL for direct upload to Wasabi storage.
 * 
 * Request body:
 * - filename: The name of the file to upload
 * - contentType: The MIME type of the file
 * - filesize: The size of the file in bytes
 * 
 * Response:
 * - success: Boolean indicating if the request was successful
 * - data: Object containing upload URL, fields, and key
 * - error: Object containing error details if request failed
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    
    // Create a mutable copy of the data object for potential updates
    const userData = { user: data.user };
    
    // Debug logging for authentication
    const allCookies = request.cookies.getAll();
    const supabaseCookies = allCookies.filter(c => c.name.startsWith('sb-'));
    
    console.log('Upload API auth check:', {
      hasUser: !!data?.user,
      userId: data?.user?.id,
      cookieCount: allCookies.length,
      supabaseCookieCount: supabaseCookies.length,
      supabaseCookieNames: supabaseCookies.map(c => c.name),
      headers: Object.fromEntries(
        Array.from(request.headers.entries())
          .filter(([key]) => key.toLowerCase().includes('cookie'))
          .map(([k, v]) => [k, typeof v === 'string' ? (v.length > 20 ? v.substring(0, 20) + '...' : v) : v])
      ),
    });
    
    // If no user but we have cookies, try to debug further
    if (!userData.user && supabaseCookies.length > 0) {
      console.log('Auth issue: Has cookies but no user detected');
      
      // Try to refresh the session
      try {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData.session) {
          console.log('Session refreshed successfully:', {
            userId: refreshData.user?.id,
            email: refreshData.user?.email,
          });
          // Use the refreshed user data
          if (refreshData.user) {
            // Continue with the refreshed user
            console.log('Using refreshed user data');
            userData.user = refreshData.user;
          }
        }
      } catch (refreshError) {
        console.error('Error refreshing session:', refreshError);
      }
    }
    
    // For debugging purposes, temporarily allow requests without authentication
    const requireAuth = false; // Set to true in production
    
    if (requireAuth && !userData.user) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    // If no user is found but we're allowing requests for debugging
    if (!userData.user) {
      console.log('WARNING: Proceeding without authentication for debugging purposes');
    }
    
    // Parse request body
    const { filename, contentType, filesize } = await request.json();
    
    // Validate input
    if (!filename || !contentType || !filesize) {
      return NextResponse.json(
        { success: false, error: { code: 'validation_error', message: 'Missing required fields' } },
        { status: 400 }
      );
    }
    
    // Validate file type
    if (!ALLOWED_VIDEO_TYPES.includes(contentType)) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'validation_error', 
            message: `Invalid file type. Supported types: ${ALLOWED_VIDEO_TYPES.join(', ')}` 
          } 
        },
        { status: 400 }
      );
    }
    
    // Validate file size
    if (filesize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'validation_error', 
            message: `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
          } 
        },
        { status: 400 }
      );
    }
    
    // Generate a unique key for the file
    const userId = userData.user?.id || 'anonymous';
    const timestamp = Date.now();
    const fileExtension = filename.split('.').pop();
    const key = `videos/${userId}/${timestamp}-${uuidv4()}.${fileExtension}`;
    
    // Create presigned post URL
    const presignedPost = await createPresignedPost(wasabiClient, {
      Bucket: WASABI_BUCKET,
      Key: key,
      Fields: {
        'Content-Type': contentType,
      },
      Conditions: [
        ['content-length-range', 0, MAX_FILE_SIZE],
        ['starts-with', '$Content-Type', contentType.split('/')[0]],
      ],
      Expires: URL_EXPIRATION_SECONDS,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: presignedPost.url,
        fields: presignedPost.fields,
        key,
      }
    });
  } catch (error: unknown) {
    console.error('Error creating presigned URL:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Failed to create upload URL' } },
      { status: 500 }
    );
  }
}
