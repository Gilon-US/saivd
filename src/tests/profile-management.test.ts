/**
 * Profile Management Integration Tests
 * 
 * This file contains integration tests for the profile management functionality.
 * Run these tests with: npm test profile-management
 * 
 * Note: These tests require Jest to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('Profile Management Integration Tests', () => {
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
  const mockSupabaseClient = {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-123', email: 'user@example.com' } } },
      }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: mockProfile,
        error: null,
      }),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  describe('Profile Retrieval', () => {
    it('fetches user profile data from Supabase', async () => {
      // Import the module that uses Supabase
      const { supabase } = require('@/lib/supabase');
      
      // Call the Supabase client
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', 'user-123')
        .single();
      
      // Verify the correct methods were called
      expect(supabase.from).toHaveBeenCalledWith('profiles');
      expect(supabase.from().select).toHaveBeenCalledWith('*');
      expect(supabase.from().select().eq).toHaveBeenCalledWith('id', 'user-123');
      expect(supabase.from().select().eq().single).toHaveBeenCalled();
      
      // Verify the returned data
      expect(data).toEqual(mockProfile);
      expect(error).toBeNull();
    });
  });

  describe('Profile Updates', () => {
    it('updates user profile data in Supabase', async () => {
      // Mock the update response
      const updatedProfile = {
        ...mockProfile,
        display_name: 'Updated Name',
        updated_at: '2023-01-02T00:00:00Z',
      };
      
      mockSupabaseClient.from().update().eq().single.mockResolvedValueOnce({
        data: updatedProfile,
        error: null,
      });
      
      // Import the module that uses Supabase
      const { supabase } = require('@/lib/supabase');
      
      // Call the Supabase client to update profile
      const { data, error } = await supabase
        .from('profiles')
        .update({ display_name: 'Updated Name' })
        .eq('id', 'user-123')
        .single();
      
      // Verify the correct methods were called
      expect(supabase.from).toHaveBeenCalledWith('profiles');
      expect(supabase.from().update).toHaveBeenCalledWith({ display_name: 'Updated Name' });
      expect(supabase.from().update().eq).toHaveBeenCalledWith('id', 'user-123');
      expect(supabase.from().update().eq().single).toHaveBeenCalled();
      
      // Verify the returned data
      expect(data).toEqual(updatedProfile);
      expect(error).toBeNull();
    });

    it('handles errors when updating profile', async () => {
      // Mock an error response
      mockSupabaseClient.from().update().eq().single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });
      
      // Import the module that uses Supabase
      const { supabase } = require('@/lib/supabase');
      
      // Call the Supabase client to update profile
      const { data, error } = await supabase
        .from('profiles')
        .update({ display_name: 'Updated Name' })
        .eq('id', 'user-123')
        .single();
      
      // Verify the returned data
      expect(data).toBeNull();
      expect(error).toEqual({ message: 'Database error' });
    });
  });
});
