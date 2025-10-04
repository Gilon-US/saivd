/**
 * Profile API Tests
 * 
 * This file contains tests for the profile API endpoints.
 * Run these tests with: npm test profile-api
 * 
 * Note: These tests require Jest to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { GET, PUT } from '../route';
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

// Mock Next.js and Supabase
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    json: jest.fn((data, init) => ({ data, init })),
  },
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: jest.fn(),
}));

describe('Profile API', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/profile', () => {
    it('returns 401 when user is not authenticated', async () => {
      // Mock Supabase client to return no session
      const mockSupabase = {
        auth: {
          getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        },
      };
      (createRouteHandlerClient as jest.Mock).mockReturnValue(mockSupabase);

      // Call the API endpoint
      await GET({} as NextRequest);

      // Check that NextResponse.json was called with the correct error
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    });

    it('returns profile data when user is authenticated', async () => {
      // Mock profile data
      const mockProfile = {
        id: 'user-123',
        email: 'user@example.com',
        display_name: 'Test User',
        avatar_url: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      // Mock Supabase client
      const mockSupabase = {
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: 'user-123' } } },
          }),
        },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: mockProfile,
            error: null,
          }),
        }),
      };
      (createRouteHandlerClient as jest.Mock).mockReturnValue(mockSupabase);

      // Call the API endpoint
      await GET({} as NextRequest);

      // Check that NextResponse.json was called with the profile data
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockProfile,
      });
    });

    it('handles database errors', async () => {
      // Mock Supabase client to return an error
      const mockSupabase = {
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: 'user-123' } } },
          }),
        },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      };
      (createRouteHandlerClient as jest.Mock).mockReturnValue(mockSupabase);

      // Call the API endpoint
      await GET({} as NextRequest);

      // Check that NextResponse.json was called with the error
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: { code: 'database_error', message: 'Failed to fetch profile' } },
        { status: 500 }
      );
    });
  });

  describe('PUT /api/profile', () => {
    it('validates input data', async () => {
      // Mock request with invalid data
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          display_name: 'A', // Too short
        }),
      } as unknown as NextRequest;

      // Mock Supabase client
      const mockSupabase = {
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: 'user-123' } } },
          }),
        },
      };
      (createRouteHandlerClient as jest.Mock).mockReturnValue(mockSupabase);

      // Call the API endpoint
      await PUT(mockRequest);

      // Check that NextResponse.json was called with validation error
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'validation_error',
          }),
        }),
        { status: 400 }
      );
    });

    it('updates profile successfully', async () => {
      // Mock profile data
      const updatedProfile = {
        id: 'user-123',
        email: 'user@example.com',
        display_name: 'Updated Name',
        avatar_url: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
      };

      // Mock request with valid data
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          display_name: 'Updated Name',
        }),
      } as unknown as NextRequest;

      // Mock Supabase client
      const mockSupabase = {
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: 'user-123' } } },
          }),
        },
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: updatedProfile,
            error: null,
          }),
        }),
      };
      (createRouteHandlerClient as jest.Mock).mockReturnValue(mockSupabase);

      // Call the API endpoint
      await PUT(mockRequest);

      // Check that NextResponse.json was called with the updated profile
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedProfile,
      });
    });
  });
});
