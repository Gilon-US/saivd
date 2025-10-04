/**
 * Integration tests for Public Profile API
 * Story 2.2: Public Profile API Endpoint
 */

import { createClient } from '@supabase/supabase-js';

// Test configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

describe('Public Profile API Integration Tests', () => {
  let supabase: ReturnType<typeof createClient>;
  let testUserId: string;

  beforeAll(async () => {
    // Create public client for testing
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Use a known test user ID or create one
    testUserId = '550e8400-e29b-41d4-a716-446655440000';
  });

  describe('GET /api/profile/[userId]', () => {
    it('should return profile data for existing user', async () => {
      const response = await fetch(`${apiBaseUrl}/api/profile/${testUserId}`);
      const data = await response.json();

      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
        expect(data.data.id).toBe(testUserId);
        expect(data.data).toHaveProperty('display_name');
        expect(data.data).toHaveProperty('bio');
        expect(data.data).toHaveProperty('photo');
        
        // Should not contain sensitive fields
        expect(data.data).not.toHaveProperty('email');
        expect(data.data).not.toHaveProperty('created_at');
        expect(data.data).not.toHaveProperty('updated_at');
      } else if (response.status === 404) {
        expect(data.success).toBe(false);
        expect(data.error).toBe('User not found');
      }
    });

    it('should return 400 for invalid UUID format', async () => {
      const invalidUUIDs = [
        'invalid-uuid',
        '123',
        'not-a-uuid',
        '550e8400-e29b-41d4-a716' // incomplete UUID
      ];

      for (const invalidUUID of invalidUUIDs) {
        const response = await fetch(`${apiBaseUrl}/api/profile/${invalidUUID}`);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Invalid user ID format');
      }
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
      
      const response = await fetch(`${apiBaseUrl}/api/profile/${nonExistentUserId}`);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not found');
    });

    it('should work without authentication', async () => {
      // Test that no authentication headers are required
      const response = await fetch(`${apiBaseUrl}/api/profile/${testUserId}`, {
        headers: {
          // Explicitly no Authorization header
        }
      });

      // Should not fail due to missing authentication
      expect([200, 404]).toContain(response.status);
    });

    it('should return consistent response format', async () => {
      const response = await fetch(`${apiBaseUrl}/api/profile/${testUserId}`);
      const data = await response.json();

      // All responses should have success field
      expect(data).toHaveProperty('success');
      expect(typeof data.success).toBe('boolean');

      if (data.success) {
        expect(data).toHaveProperty('data');
        expect(typeof data.data).toBe('object');
      } else {
        expect(data).toHaveProperty('error');
        expect(typeof data.error).toBe('string');
      }
    });

    it('should handle special characters in UUID gracefully', async () => {
      const malformedUUIDs = [
        '550e8400-e29b-41d4-a716-44665544000<script>',
        '550e8400-e29b-41d4-a716-446655440000\'',
        '550e8400-e29b-41d4-a716-446655440000"'
      ];

      for (const malformedUUID of malformedUUIDs) {
        const response = await fetch(`${apiBaseUrl}/api/profile/${encodeURIComponent(malformedUUID)}`);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Invalid user ID format');
      }
    });
  });

  describe('Performance Tests', () => {
    it('should respond within reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await fetch(`${apiBaseUrl}/api/profile/${testUserId}`);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should respond within 2 seconds
      expect(responseTime).toBeLessThan(2000);
      expect([200, 404]).toContain(response.status);
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(5).fill(null).map(() => 
        fetch(`${apiBaseUrl}/api/profile/${testUserId}`)
      );

      const responses = await Promise.all(requests);
      
      // All requests should complete successfully
      responses.forEach(response => {
        expect([200, 404]).toContain(response.status);
      });
    });
  });

  describe('Security Tests', () => {
    it('should not expose sensitive information in errors', async () => {
      const response = await fetch(`${apiBaseUrl}/api/profile/invalid-uuid`);
      const data = await response.json();

      expect(data.error).not.toContain('database');
      expect(data.error).not.toContain('sql');
      expect(data.error).not.toContain('supabase');
      expect(data.error).not.toContain('connection');
    });

    it('should sanitize response data', async () => {
      const response = await fetch(`${apiBaseUrl}/api/profile/${testUserId}`);
      
      if (response.status === 200) {
        const data = await response.json();
        
        // Check that response doesn't contain script tags or other dangerous content
        const responseString = JSON.stringify(data);
        expect(responseString).not.toContain('<script>');
        expect(responseString).not.toContain('javascript:');
      }
    });
  });
});
