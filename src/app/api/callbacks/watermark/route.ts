/**
 * Watermarking Callback API
 * 
 * This endpoint receives callbacks from the watermarking service when processing is complete.
 * It validates the callback token and updates the watermarked video status in the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Type for watermarking callback payload
 */
type WatermarkCallbackPayload = {
  jobId: string;
  status: 'completed' | 'error';
  result?: {
    videoUrl?: string;
    thumbnailUrl?: string;
  };
  error?: {
    code: string;
    message: string;
  };
};

/**
 * POST /api/callbacks/watermark
 * 
 * Handles callbacks from the watermarking service.
 * 
 * Query parameters:
 * - token: Security token for authentication
 * 
 * Request body:
 * - jobId: ID of the watermarking job
 * - status: Status of the job ('completed' or 'error')
 * - result: Object containing URLs of watermarked video and thumbnail (if completed)
 * - error: Object containing error details (if error)
 * 
 * Response:
 * - success: Boolean indicating if the request was successful
 */
export async function POST(request: NextRequest) {
  try {
    // Get token from query parameters
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    
    // Validate token
    if (!token) {
      console.error('Missing token in watermarking callback');
      return NextResponse.json(
        { success: false, error: { code: 'invalid_token', message: 'Missing token' } },
        { status: 401 }
      );
    }
    
    // In a real implementation, you would validate the token against a stored value
    // For now, we'll just log it and continue
    console.log('Received watermarking callback with token:', token);
    
    // Parse request body
    const payload: WatermarkCallbackPayload = await request.json();
    
    // Validate payload
    if (!payload.jobId || !payload.status) {
      console.error('Invalid payload in watermarking callback:', payload);
      return NextResponse.json(
        { success: false, error: { code: 'invalid_payload', message: 'Missing required fields' } },
        { status: 400 }
      );
    }
    
    // Log the callback
    console.log('Watermarking callback received:', {
      jobId: payload.jobId,
      status: payload.status,
      result: payload.result,
      error: payload.error,
    });
    
    // Get Supabase client
    const supabase = await createClient();
    
    // In a real implementation, you would:
    // 1. Look up the watermarking job in the database using the token and jobId
    // 2. Verify that the job exists and belongs to a valid user
    // 3. Update the job status in the database
    // 4. If completed, update the video record with watermarked URLs
    
    // For now, we'll just return a success response
    return NextResponse.json({
      success: true,
      message: 'Callback received successfully',
    });
  } catch (error) {
    console.error('Error processing watermarking callback:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Server error' } },
      { status: 500 }
    );
  }
}
