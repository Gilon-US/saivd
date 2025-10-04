import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

/**
 * This script sets up the videos table and related database objects in Supabase.
 * It should be run once during initial setup or when schema changes are needed.
 * 
 * Usage:
 * - Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 * - Run with: npx tsx src/db/setup-videos.ts
 */

async function setupVideosSchema() {
  // Check for required environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Create Supabase client with service role key for admin access
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'schema', 'videos.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('Setting up videos schema...');

    // Execute the SQL
    const { error } = await supabase.rpc('pgmoon.exec', { query: sql });

    if (error) {
      console.error('Error setting up videos schema:', error);
      process.exit(1);
    }

    console.log('Videos schema setup completed successfully!');
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

// Run the setup function
setupVideosSchema();
