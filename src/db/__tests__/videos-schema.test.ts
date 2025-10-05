/**
 * Videos Schema Tests
 * 
 * This file contains tests for the videos database schema.
 * Run these tests with: npm test videos-schema
 * 
 * Note: These tests require Jest to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Mock dependencies
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

describe('Videos Schema', () => {
  const mockSupabaseClient = {
    rpc: jest.fn().mockReturnValue({
      error: null,
    }),
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase client
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
    // Mock environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.com';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    
    // Mock fs.readFileSync
    (fs.readFileSync as jest.Mock).mockReturnValue(`
      CREATE TABLE IF NOT EXISTS public.videos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES auth.users(id) NOT NULL,
        filename TEXT NOT NULL,
        filesize BIGINT NOT NULL,
        content_type TEXT NOT NULL,
        original_url TEXT NOT NULL,
        original_thumbnail_url TEXT,
        upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      -- Enable Row Level Security
      ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
      
      -- Create policies
      CREATE POLICY "Users can view their own videos"
        ON public.videos
        FOR SELECT
        USING (auth.uid() = user_id);
    `);
  });
  
  it('creates the videos table and security policies', async () => {
    // Import the setup script
    const { setupVideosSchema } = await import('../setup-videos');
    
    // Run the setup function
    await setupVideosSchema();
    
    // Verify that the SQL file was read
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('videos.sql'),
      'utf8'
    );
    
    // Verify that the SQL was executed
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
      'pgmoon.exec',
      { query: expect.any(String) }
    );
  });
  
  it('handles errors when setting up the schema', async () => {
    // Mock console.error
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock process.exit
    const processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    
    // Mock rpc error
    mockSupabaseClient.rpc.mockReturnValueOnce({
      error: { message: 'Database error' },
    });
    
    // Import the setup script
    const { setupVideosSchema } = await import('../setup-videos');
    
    // Run the setup function and expect it to exit
    await expect(setupVideosSchema()).rejects.toThrow('process.exit called');
    
    // Verify that the error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error setting up videos schema:',
      { message: 'Database error' }
    );
    
    // Verify that process.exit was called with error code
    expect(processExitSpy).toHaveBeenCalledWith(1);
    // Restore mocks
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
  
  it('handles database errors gracefully', async () => {
    // Mock console.error
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock process.exit
    const processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      // Do not throw an error when process.exit is called
      return;
    });
    
    // Remove environment variables
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // Import the setup script
    const { setupVideosSchema } = await import('../setup-videos');
    
    // Run the setup function and expect it to exit
    await expect(setupVideosSchema()).rejects.toThrow('process.exit called');
    
    // Verify that the error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    );
    
    // Verify that process.exit was called with error code
    expect(processExitSpy).toHaveBeenCalledWith(1);
    
    // Restore mocks
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
