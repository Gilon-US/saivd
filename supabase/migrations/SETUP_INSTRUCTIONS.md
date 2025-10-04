# Supabase Database Setup Instructions

This document provides step-by-step instructions for setting up the database for the SAVD application.

## Overview

The SAVD application requires two main tables:

1. **videos** - Stores metadata for user-uploaded videos
2. **profiles** - Stores user profile information

## Setup Options

### Option 1: Run the Complete Setup Script

For a complete setup in one step:

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `setup_database.sql`
4. Paste into the SQL Editor and run the script

### Option 2: Run Individual Table Scripts

If you prefer to set up tables individually:

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Run the scripts in this order:
   - `videos_table.sql` - Creates the videos table and related objects
   - `profiles_table.sql` - Creates the profiles table and related objects

### Option 3: Using the Supabase CLI

If you have the Supabase CLI installed:

```bash
supabase db push
```

## Troubleshooting

### "Failed to store video metadata" Error

If you encounter this error when uploading videos, it means the videos table hasn't been created yet. Run the `videos_table.sql` script to resolve this issue.

### Missing Profile Data

If profile information isn't being saved or retrieved correctly, make sure the profiles table has been created using the `profiles_table.sql` script.

## Table Structures

### Videos Table

The videos table stores metadata for user-uploaded videos with fields including:
- `id` (UUID)
- `user_id` (UUID)
- `filename` (TEXT)
- `filesize` (BIGINT)
- `content_type` (TEXT)
- `original_url` (TEXT)
- And several other fields for video metadata

### Profiles Table

The profiles table stores user profile information with fields including:
- `id` (UUID)
- `email` (TEXT)
- `display_name` (TEXT)
- `avatar_url` (TEXT)
- `bio` (TEXT) - For user's biography on their landing page
- `photo` (TEXT) - URL to user profile photo stored externally
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

## Security

Both tables have Row Level Security (RLS) policies that ensure users can only access their own data. Authentication is required for all operations.

**Note**: The profiles table also has a public read policy that allows unauthenticated users to view profile information (id, display_name, bio, photo) for public profile viewing functionality. This enables the public user profile feature while maintaining security for sensitive data.

## Automatic Profile Creation

When a new user signs up, a trigger automatically creates a profile record for them using the `handle_new_user` function.
