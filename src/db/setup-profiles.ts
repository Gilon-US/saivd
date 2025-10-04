import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

/**
 * This script sets up the profiles table and related database objects in Supabase.
 * It should be run once during initial setup or when schema changes are needed.
 * 
 * Usage:
 * - Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 * - Run with: npx tsx src/db/setup-profiles.ts
 */

async function setupProfilesSchema() {
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
    const sqlFilePath = path.join(__dirname, 'schema', 'profiles.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('Setting up profiles schema...');
    
    // Execute the SQL
    const { error } = await supabase.rpc('pgmoon.exec', { query: sql });
    
    if (error) {
      console.error('Error setting up profiles schema:', error);
      process.exit(1);
    }
    
    console.log('Profiles schema setup completed successfully!');
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

// Run the setup function
setupProfilesSchema();
