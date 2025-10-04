/**
 * Upload API Tests
 * 
 * This file contains tests for the pre-signed URL generation API endpoint.
 * Run these tests with: npm test upload-api
 * 
 * Note: These tests require Jest to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { wasabiClient, WASABI_BUCKET } from '@/lib/wasabi';
import { POST } from '../route';

// Mock dependencies
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    json: jest.fn(),
  },
}));

jest.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: jest.fn(),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn(),
}));

jest.mock('@/lib/wasabi', () => ({
  wasabiClient: {},
  WASABI_BUCKET: 'test-bucket',
  MAX_FILE_SIZE: 500 * 1024 * 1024,
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
  URL_EXPIRATION_SECONDS: 3600,
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid'),
}));

describe('Upload API Endpoint', () => {
  const mockSession = {
    user: {
      id: 'test-user-id',
    },
  };
  
  const mockSupabaseClient = {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: mockSession },
      }),
    },
  };
  
  const mockPresignedPost = {
    url: 'https://test-bucket.wasabisys.com',
    fields: {
      key: 'uploads/test-user-id/123456-mocked-uuid.mp4',
      'Content-Type': 'video/mp4',
    },
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase client
    (createRouteHandlerClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
    // Mock createPresignedPost
    (createPresignedPost as jest.Mock).mockResolvedValue(mockPresignedPost);
    
    // Mock NextResponse.json
    (NextResponse.json as jest.Mock).mockImplementation((data) => data);
  });
  
  it('returns a pre-signed URL for valid input', async () => {
    // Mock request
    const mockRequest = {
      json: jest.fn().mockResolvedValue({
        filename: 'test-video.mp4',
        contentType: 'video/mp4',
        filesize: 1024 * 1024, // 1MB
      }),
    } as unknown as NextRequest;
    
    // Call the API
    const response = await POST(mockRequest);
    
    // Verify Supabase session was checked
    expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled();
    
    // Verify createPresignedPost was called with correct parameters
    expect(createPresignedPost).toHaveBeenCalledWith(
      wasabiClient,
      expect.objectContaining({
        Bucket: WASABI_BUCKET,
        Key: expect.stringContaining('uploads/test-user-id/'),
        Fields: expect.objectContaining({
          'Content-Type': 'video/mp4',
        }),
      })
    );
    
    // Verify response
    expect(response).toEqual({
      success: true,
      data: {
        uploadUrl: mockPresignedPost.url,
        fields: mockPresignedPost.fields,
        key: expect.stringContaining('uploads/test-user-id/'),
      },
    });
  });
  
  it('returns 401 when user is not authenticated', async () => {
    // Mock unauthenticated session
    mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
    });
    
    // Mock request
    const mockRequest = {
      json: jest.fn(),
    } as unknown as NextRequest;
    
    // Call the API
    const response = await POST(mockRequest);
    
    // Verify response
    expect(NextResponse.json).toHaveBeenCalledWith(
      { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
      { status: 401 }
    );
  });
  
  it('validates required fields', async () => {
    // Mock request with missing fields
    const mockRequest = {
      json: jest.fn().mockResolvedValue({
        filename: 'test-video.mp4',
        // Missing contentType and filesize
      }),
    } as unknown as NextRequest;
    
    // Call the API
    const response = await POST(mockRequest);
    
    // Verify response
    expect(NextResponse.json).toHaveBeenCalledWith(
      { success: false, error: { code: 'validation_error', message: 'Missing required fields' } },
      { status: 400 }
    );
  });
  
  it('validates file type', async () => {
    // Mock request with invalid file type
    const mockRequest = {
      json: jest.fn().mockResolvedValue({
        filename: 'test-document.pdf',
        contentType: 'application/pdf',
        filesize: 1024 * 1024,
      }),
    } as unknown as NextRequest;
    
    // Call the API
    const response = await POST(mockRequest);
    
    // Verify response
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'validation_error',
          message: expect.stringContaining('Invalid file type'),
        }),
      }),
      { status: 400 }
    );
  });
  
  it('validates file size', async () => {
    // Mock request with file too large
    const mockRequest = {
      json: jest.fn().mockResolvedValue({
        filename: 'large-video.mp4',
        contentType: 'video/mp4',
        filesize: 1000 * 1024 * 1024, // 1000MB (exceeds 500MB limit)
      }),
    } as unknown as NextRequest;
    
    // Call the API
    const response = await POST(mockRequest);
    
    // Verify response
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'validation_error',
          message: expect.stringContaining('File too large'),
        }),
      }),
      { status: 400 }
    );
  });
  
  it('handles errors during URL generation', async () => {
    // Mock createPresignedPost to throw an error
    (createPresignedPost as jest.Mock).mockRejectedValueOnce(new Error('S3 error'));
    
    // Mock request
    const mockRequest = {
      json: jest.fn().mockResolvedValue({
        filename: 'test-video.mp4',
        contentType: 'video/mp4',
        filesize: 1024 * 1024,
      }),
    } as unknown as NextRequest;
    
    // Mock console.error to prevent test output pollution
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Call the API
    const response = await POST(mockRequest);
    
    // Verify response
    expect(NextResponse.json).toHaveBeenCalledWith(
      { success: false, error: { code: 'server_error', message: 'Failed to create upload URL' } },
      { status: 500 }
    );
    
    // Verify error was logged
    expect(console.error).toHaveBeenCalled();
  });
});
