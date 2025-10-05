import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { wasabiClient, WASABI_BUCKET } from '@/lib/wasabi';

/**
 * GET /api/videos/[id]
 * 
 * Retrieves a specific video by ID for the authenticated user.
 * 
 * Response:
 * - success: Boolean indicating if the request was successful
 * - data: Object containing video information
 * - error: Object containing error details if request failed
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await context.params;
    
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    // Get video details
    const { data: video, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single();
      
    if (error || !video) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Video not found' } },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: video,
    });
  } catch (error: unknown) {
    console.error('Error fetching video:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Server error' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/videos/[id]
 * 
 * Deletes a specific video by ID for the authenticated user.
 * Also attempts to delete the file from Wasabi storage.
 * 
 * Response:
 * - success: Boolean indicating if the request was successful
 * - data: Object containing success message
 * - error: Object containing error details if request failed
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await context.params;
    
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    // Get video details
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single();
      
    if (fetchError || !video) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Video not found' } },
        { status: 404 }
      );
    }
    
    // Extract key from original_url
    // The URL format is https://bucket-name.s3.wasabisys.com/key
    // We need to extract the key part
    const urlParts = video.original_url.split('/');
    const key = urlParts.slice(3).join('/'); // Skip the protocol and domain parts
    
    // Delete file from Wasabi
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: WASABI_BUCKET,
        Key: key,
      });
      await wasabiClient.send(deleteCommand);
    } catch (error) {
      console.error('Error deleting file from Wasabi:', error);
      // Continue with database deletion even if file deletion fails
      // In a production environment, you might want to handle this differently
    }
    
    // Delete video from database
    const { error: deleteError } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId);
      
    if (deleteError) {
      console.error('Error deleting video from database:', deleteError);
      return NextResponse.json(
        { success: false, error: { code: 'database_error', message: 'Failed to delete video' } },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Video deleted successfully',
        id: videoId,
      },
    });
  } catch (error: unknown) {
    console.error('Error deleting video:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Server error' } },
      { status: 500 }
    );
  }
}
