/**
 * Tests for Public Profile API Endpoint
 * Story 2.2: Public Profile API Endpoint
 */

import { NextRequest } from 'next/server';
import { GET } from '../route';

// Mock Supabase client
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    }))
  }))
}));

// Mock validation utility
jest.mock('@/utils/validation', () => ({
  isValidUUID: jest.fn()
}));

import { createClient } from '@/utils/supabase/server';
import { isValidUUID } from '@/utils/validation';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

describe('GET /api/profile/[userId]', () => {
  let mockSupabase: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default Supabase mock
    mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn()
          }))
        }))
      }))
    };
    
    mockCreateClient.mockResolvedValue(mockSupabase);
  });

  describe('UUID Validation', () => {
    it('should return 400 for invalid UUID format', async () => {
      mockIsValidUUID.mockReturnValue(false);
      
      const request = new NextRequest('http://localhost:3000/api/profile/invalid-uuid');
      const params = { userId: 'invalid-uuid' };
      
      const response = await GET(request, { params });
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid user ID format');
    });

    it('should proceed with valid UUID format', async () => {
      mockIsValidUUID.mockReturnValue(true);
      
      // Mock successful profile fetch
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          display_name: 'Test User',
          bio: 'Test bio',
          photo: null
        },
        error: null
      });
      
      const request = new NextRequest('http://localhost:3000/api/profile/550e8400-e29b-41d4-a716-446655440000');
      const params = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      
      const response = await GET(request, { params });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('Profile Data Fetching', () => {
    beforeEach(() => {
      mockIsValidUUID.mockReturnValue(true);
    });

    it('should return profile data for existing user', async () => {
      const mockProfile = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        display_name: 'John Doe',
        bio: 'Software developer',
        photo: 'https://example.com/photo.jpg'
      };
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockProfile,
        error: null
      });
      
      const request = new NextRequest('http://localhost:3000/api/profile/550e8400-e29b-41d4-a716-446655440000');
      const params = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      
      const response = await GET(request, { params });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockProfile);
    });

    it('should return 404 for non-existent user', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' }
      });
      
      const request = new NextRequest('http://localhost:3000/api/profile/550e8400-e29b-41d4-a716-446655440000');
      const params = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      
      const response = await GET(request, { params });
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not found');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { code: 'CONNECTION_ERROR', message: 'Database connection failed' }
      });
      
      const request = new NextRequest('http://localhost:3000/api/profile/550e8400-e29b-41d4-a716-446655440000');
      const params = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      
      const response = await GET(request, { params });
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not found');
    });
  });

  describe('Response Format', () => {
    beforeEach(() => {
      mockIsValidUUID.mockReturnValue(true);
    });

    it('should return consistent success response format', async () => {
      const mockProfile = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        display_name: 'Test User',
        bio: null,
        photo: null
      };
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockProfile,
        error: null
      });
      
      const request = new NextRequest('http://localhost:3000/api/profile/550e8400-e29b-41d4-a716-446655440000');
      const params = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      
      const response = await GET(request, { params });
      const data = await response.json();
      
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('data');
      expect(data.success).toBe(true);
      expect(typeof data.data).toBe('object');
    });

    it('should return consistent error response format', async () => {
      mockIsValidUUID.mockReturnValue(false);
      
      const request = new NextRequest('http://localhost:3000/api/profile/invalid');
      const params = { userId: 'invalid' };
      
      const response = await GET(request, { params });
      const data = await response.json();
      
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('error');
      expect(data.success).toBe(false);
      expect(typeof data.error).toBe('string');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockIsValidUUID.mockReturnValue(true);
    });

    it('should handle unexpected errors with 500 status', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      
      const request = new NextRequest('http://localhost:3000/api/profile/550e8400-e29b-41d4-a716-446655440000');
      const params = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      
      const response = await GET(request, { params });
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Server error');
    });
  });

  describe('Security', () => {
    beforeEach(() => {
      mockIsValidUUID.mockReturnValue(true);
    });

    it('should only select safe profile fields', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          display_name: 'Test User',
          bio: 'Test bio',
          photo: null
        },
        error: null
      });
      
      const request = new NextRequest('http://localhost:3000/api/profile/550e8400-e29b-41d4-a716-446655440000');
      const params = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      
      await GET(request, { params });
      
      // Verify only safe fields are selected
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
      expect(mockSupabase.from().select).toHaveBeenCalledWith('id, display_name, bio, photo');
    });
  });
});
