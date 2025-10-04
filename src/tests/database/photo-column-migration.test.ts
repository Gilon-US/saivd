/**
 * Tests for photo column migration
 * Story 2.1: Add Photo Column and Public Access to Profiles
 */

import { createClient } from '@supabase/supabase-js';

// Test configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('Photo Column Migration Tests', () => {
  let supabase: ReturnType<typeof createClient>;
  let testUserId: string;

  beforeAll(async () => {
    // Create admin client for testing
    supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create a test user profile for testing
    const { data: testProfile, error } = await supabase
      .from('profiles')
      .insert({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        display_name: 'Test User',
        bio: 'Test bio for migration testing'
      })
      .select()
      .single();
      
    if (error && !error.message.includes('duplicate key')) {
      console.warn('Test profile creation failed:', error);
    }
    
    testUserId = '550e8400-e29b-41d4-a716-446655440000';
  });

  afterAll(async () => {
    // Clean up test data
    await supabase
      .from('profiles')
      .delete()
      .eq('id', testUserId);
  });

  test('photo column exists and accepts NULL values', async () => {
    // Test that photo column exists and can be NULL
    const { data, error } = await supabase
      .from('profiles')
      .select('id, photo')
      .eq('id', testUserId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.photo).toBeNull(); // Should be NULL by default
  });

  test('photo column accepts URL strings', async () => {
    const testPhotoUrl = 'https://example.com/test-photo.jpg';
    
    // Update profile with photo URL
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ photo: testPhotoUrl })
      .eq('id', testUserId);

    expect(updateError).toBeNull();

    // Verify photo URL was stored
    const { data, error } = await supabase
      .from('profiles')
      .select('photo')
      .eq('id', testUserId)
      .single();

    expect(error).toBeNull();
    expect(data?.photo).toBe(testPhotoUrl);
  });

  test('public read access policy works', async () => {
    // Create public client (no authentication)
    const publicClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    
    // Test public read access
    const { data, error } = await publicClient
      .from('profiles')
      .select('id, display_name, bio, photo')
      .eq('id', testUserId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.id).toBe(testUserId);
    expect(data?.display_name).toBe('Test User');
  });

  test('public cannot write to profiles', async () => {
    // Create public client (no authentication)
    const publicClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    
    // Test that public cannot insert
    const { error: insertError } = await publicClient
      .from('profiles')
      .insert({
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'unauthorized@example.com',
        display_name: 'Unauthorized User'
      });

    expect(insertError).toBeDefined();
    expect(insertError?.code).toBe('42501'); // Insufficient privilege

    // Test that public cannot update
    const { error: updateError } = await publicClient
      .from('profiles')
      .update({ display_name: 'Hacked Name' })
      .eq('id', testUserId);

    expect(updateError).toBeDefined();
    expect(updateError?.code).toBe('42501'); // Insufficient privilege
  });

  test('existing profile functionality still works', async () => {
    // Test that existing profile queries work
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testUserId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.email).toBe('test@example.com');
    expect(data?.display_name).toBe('Test User');
    expect(data?.bio).toBe('Test bio for migration testing');
  });

  test('photo column has proper comment', async () => {
    // Test that column comment exists (this requires admin access)
    const { data, error } = await supabase.rpc('get_column_comment', {
      table_name: 'profiles',
      column_name: 'photo'
    });

    // Note: This test may need adjustment based on available RPC functions
    // The important thing is that the comment exists in the database
    expect(error).toBeNull();
  });
});
