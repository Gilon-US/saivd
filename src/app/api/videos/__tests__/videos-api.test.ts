/**
 * Videos API Tests
 * 
 * This file contains tests for the videos API endpoints.
 * Run these tests with: npm test videos-api
 * 
 * Note: These tests require Jest to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { GET as getVideos } from '../route';
import { GET as getVideo, DELETE as deleteVideo } from '../[id]/route';
import { POST as confirmUpload } from '../confirm/route';
import { wasabiClient } from '@/lib/wasabi';

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
  DeleteObjectCommand: jest.fn(),
}));

jest.mock('@/lib/wasabi', () => ({
  wasabiClient: {
    send: jest.fn(),
  },
  WASABI_BUCKET: 'test-bucket',
}));

describe('Videos API', () => {
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
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase client
    (createRouteHandlerClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
    // Mock NextResponse.json
    (NextResponse.json as jest.Mock).mockImplementation((data) => data);
  });
  
  describe('GET /api/videos', () => {
    it('returns videos for authenticated user', async () => {
      // Mock successful videos query
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: [
          {
            id: 'video-1',
            user_id: 'test-user-id',
            filename: 'test-video.mp4',
            filesize: 1024 * 1024,
            content_type: 'video/mp4',
            original_url: 'https://test-bucket.s3.wasabisys.com/test-key',
            upload_date: '2025-09-20T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      });
      
      // Mock request
      const mockRequest = {
        url: 'https://example.com/api/videos?page=1&limit=20',
      } as unknown as NextRequest;
      
      // Call the API
      const response = await getVideos(mockRequest);
      
      // Verify Supabase queries
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('videos');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', 'test-user-id');
      
      // Verify response
      expect(response).toEqual({
        success: true,
        data: {
          videos: expect.any(Array),
          pagination: {
            page: 1,
            limit: 20,
            total: 1,
            totalPages: 1,
          },
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
        url: 'https://example.com/api/videos',
      } as unknown as NextRequest;
      
      // Call the API
      await getVideos(mockRequest);
      
      // Verify response
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    });
  });
  
  describe('GET /api/videos/[id]', () => {
    it('returns a specific video for authenticated user', async () => {
      // Mock successful video query
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'video-1',
          user_id: 'test-user-id',
          filename: 'test-video.mp4',
          filesize: 1024 * 1024,
          content_type: 'video/mp4',
          original_url: 'https://test-bucket.s3.wasabisys.com/test-key',
          upload_date: '2025-09-20T00:00:00Z',
        },
        error: null,
      });
      
      // Mock request
      const mockRequest = {} as unknown as NextRequest;
      const mockParams = Promise.resolve({ id: 'video-1' });
      
      // Call the API
      const response = await getVideo(mockRequest, { params: mockParams });
      
      // Verify Supabase queries
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('videos');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'video-1');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', 'test-user-id');
      
      // Verify response
      expect(response).toEqual({
        success: true,
        data: expect.objectContaining({
          id: 'video-1',
          filename: 'test-video.mp4',
        }),
      });
    });
    
    it('returns 404 when video is not found', async () => {
      // Mock video not found
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });
      
      // Mock request
      const mockRequest = {} as unknown as NextRequest;
      const mockParams = Promise.resolve({ id: 'non-existent-video' });
      
      // Call the API
      await getVideo(mockRequest, { params: mockParams });
      
      // Verify response
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: { code: 'not_found', message: 'Video not found' } },
        { status: 404 }
      );
    });
  });
  
  describe('DELETE /api/videos/[id]', () => {
    it('deletes a video and its file', async () => {
      // Mock successful video query
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'video-1',
          user_id: 'test-user-id',
          filename: 'test-video.mp4',
          filesize: 1024 * 1024,
          content_type: 'video/mp4',
          original_url: 'https://test-bucket.s3.wasabisys.com/test-key',
          upload_date: '2025-09-20T00:00:00Z',
        },
        error: null,
      });
      
      // Mock successful delete
      mockSupabaseClient.single.mockResolvedValueOnce({
        error: null,
      });
      
      // Mock successful Wasabi delete
      (wasabiClient.send as jest.Mock).mockResolvedValueOnce({});
      
      // Mock request
      const mockRequest = {} as unknown as NextRequest;
      const mockParams = Promise.resolve({ id: 'video-1' });
      
      // Call the API
      const response = await deleteVideo(mockRequest, { params: mockParams });
      
      // Verify Supabase queries
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('videos');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'video-1');
      
      // Verify Wasabi delete
      expect(wasabiClient.send).toHaveBeenCalled();
      
      // Verify response
      expect(response).toEqual({
        success: true,
        data: {
          message: 'Video deleted successfully',
          id: 'video-1',
        },
      });
    });
    
    it('returns 404 when video is not found', async () => {
      // Mock video not found
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });
      
      // Mock request
      const mockRequest = {} as unknown as NextRequest;
      const mockParams = Promise.resolve({ id: 'non-existent-video' });
      
      // Call the API
      await deleteVideo(mockRequest, { params: mockParams });
      
      // Verify response
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: { code: 'not_found', message: 'Video not found' } },
        { status: 404 }
      );
    });
  });
  
  describe('POST /api/videos/confirm', () => {
    it('stores video metadata in the database', async () => {
      // Mock successful Wasabi head object
      (wasabiClient.send as jest.Mock).mockResolvedValueOnce({});
      
      // Mock successful database insert
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'video-1',
          user_id: 'test-user-id',
          filename: 'test-video.mp4',
          filesize: 1024 * 1024,
          content_type: 'video/mp4',
          original_url: 'https://test-bucket.s3.wasabisys.com/test-key',
          original_thumbnail_url: '/placeholder-video-thumbnail.jpg',
          upload_date: '2025-09-20T00:00:00Z',
        },
        error: null,
      });
      
      // Mock request
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          key: 'test-key',
          filename: 'test-video.mp4',
          filesize: 1024 * 1024,
          contentType: 'video/mp4',
        }),
      } as unknown as NextRequest;
      
      // Call the API
      const response = await confirmUpload(mockRequest);
      
      // Verify Wasabi head object
      expect(wasabiClient.send).toHaveBeenCalled();
      
      // Verify Supabase insert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('videos');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'test-user-id',
        filename: 'test-video.mp4',
        filesize: 1024 * 1024,
        content_type: 'video/mp4',
      }));
      
      // Verify response
      expect(response).toEqual({
        success: true,
        data: expect.objectContaining({
          id: 'video-1',
          filename: 'test-video.mp4',
        }),
      });
    });
    
    it('returns 404 when file is not found in Wasabi', async () => {
      // Mock Wasabi head object error
      (wasabiClient.send as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
      
      // Mock request
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          key: 'non-existent-key',
          filename: 'test-video.mp4',
          filesize: 1024 * 1024,
          contentType: 'video/mp4',
        }),
      } as unknown as NextRequest;
      
      // Call the API
      await confirmUpload(mockRequest);
      
      // Verify response
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: { code: 'not_found', message: 'Uploaded file not found or inaccessible' } },
        { status: 404 }
      );
    });
    
    it('returns 400 when required fields are missing', async () => {
      // Mock request with missing fields
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          key: 'test-key',
          // Missing filename, filesize, and contentType
        }),
      } as unknown as NextRequest;
      
      // Call the API
      await confirmUpload(mockRequest);
      
      // Verify response
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: { code: 'validation_error', message: 'Missing required fields' } },
        { status: 400 }
      );
    });
  });
});
