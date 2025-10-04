/**
 * Confirm API Tests
 * 
 * This file contains tests for the video upload confirmation API endpoint.
 * Run these tests with: npm test confirm-api
 * 
 * Note: These tests require Jest to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
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

jest.mock('@aws-sdk/client-s3', () => ({
  HeadObjectCommand: jest.fn(),
}));

jest.mock('@/lib/wasabi', () => ({
  wasabiClient: {
    send: jest.fn(),
  },
  WASABI_BUCKET: 'test-bucket',
}));

describe('Upload Confirmation API', () => {
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
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase client
    (createRouteHandlerClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
    // Mock successful Wasabi head object
    (wasabiClient.send as jest.Mock).mockResolvedValue({});
    
    // Mock NextResponse.json
    (NextResponse.json as jest.Mock).mockImplementation((data) => data);
  });
  
  it('confirms a successful upload', async () => {
    // Mock request
    const mockRequest = {
      json: jest.fn().mockResolvedValue({
        key: 'uploads/test-user-id/test-video.mp4',
        filename: 'test-video.mp4',
        filesize: 1024 * 1024,
        contentType: 'video/mp4',
      }),
    } as unknown as NextRequest;
    
    // Call the API
    const response = await POST(mockRequest);
    
    // Verify Supabase session was checked
    expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled();
    
    // Verify Wasabi object was checked
    expect(HeadObjectCommand).toHaveBeenCalledWith({
      Bucket: WASABI_BUCKET,
      Key: 'uploads/test-user-id/test-video.mp4',
    });
    expect(wasabiClient.send).toHaveBeenCalled();
    
    // Verify response
    expect(response).toEqual({
      success: true,
      data: expect.objectContaining({
        key: 'uploads/test-user-id/test-video.mp4',
        filename: 'test-video.mp4',
        originalUrl: expect.stringContaining('test-video.mp4'),
        thumbnailUrl: expect.any(String),
        userId: 'test-user-id',
      }),
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
        key: 'uploads/test-user-id/test-video.mp4',
        // Missing filename, filesize, and contentType
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
  
  it('handles file not found in Wasabi', async () => {
    // Mock Wasabi head object to throw an error
    (wasabiClient.send as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
    
    // Mock request
    const mockRequest = {
      json: jest.fn().mockResolvedValue({
        key: 'uploads/test-user-id/test-video.mp4',
        filename: 'test-video.mp4',
        filesize: 1024 * 1024,
        contentType: 'video/mp4',
      }),
    } as unknown as NextRequest;
    
    // Call the API
    const response = await POST(mockRequest);
    
    // Verify response
    expect(NextResponse.json).toHaveBeenCalledWith(
      { success: false, error: { code: 'not_found', message: 'Uploaded file not found or inaccessible' } },
      { status: 404 }
    );
  });
  
  it('handles server errors', async () => {
    // Mock request to throw an error
    const mockRequest = {
      json: jest.fn().mockRejectedValueOnce(new Error('Server error')),
    } as unknown as NextRequest;
    
    // Mock console.error to prevent test output pollution
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Call the API
    const response = await POST(mockRequest);
    
    // Verify response
    expect(NextResponse.json).toHaveBeenCalledWith(
      { success: false, error: { code: 'server_error', message: 'Failed to confirm upload' } },
      { status: 500 }
    );
    
    // Verify error was logged
    expect(console.error).toHaveBeenCalled();
  });
});
