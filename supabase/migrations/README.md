# Supabase Database Setup

This directory contains SQL migration scripts to set up the necessary database tables and related objects for the SAVD application.

## How to Run These Scripts

### Option 1: Using the Supabase Dashboard

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy the contents of each SQL file
4. Paste into the SQL Editor and run the scripts in the following order:
   - `videos_table.sql`
   - `profiles_table.sql`

### Option 2: Using the Supabase CLI

If you have the Supabase CLI installed, you can run:

```bash
supabase db push
```

## Resolving the "Failed to store video metadata" Error

If you're seeing the error `Failed to store video metadata` when trying to upload videos, it's likely because the `videos` table doesn't exist in your Supabase database. Running the `videos_table.sql` script will resolve this issue.

## Database Schema

### Videos Table

The `videos` table stores metadata for user-uploaded videos with the following structure:

- `id`: UUID, primary key
- `user_id`: UUID, references auth.users(id)
- `filename`: TEXT, original filename
- `filesize`: BIGINT, file size in bytes
- `content_type`: TEXT, MIME type of the file
- `original_url`: TEXT, URL to the original uploaded file
- `original_thumbnail_url`: TEXT, URL to the thumbnail
- `processed_url`: TEXT, URL to the processed video (if applicable)
- `processed_thumbnail_url`: TEXT, URL to the processed thumbnail
- `title`: TEXT, video title
- `description`: TEXT, video description
- `duration`: INTEGER, video duration in seconds
- `status`: TEXT, one of 'uploaded', 'processing', 'processed', 'failed'
- `upload_date`: TIMESTAMP WITH TIME ZONE, when the video was uploaded
- `created_at`: TIMESTAMP WITH TIME ZONE, when the record was created
- `updated_at`: TIMESTAMP WITH TIME ZONE, when the record was last updated

### Profiles Table

The `profiles` table stores user profile information with the following structure:

- `id`: UUID, primary key, references auth.users(id)
- `email`: TEXT, user's email address
- `display_name`: TEXT, user's display name
- `avatar_url`: TEXT, URL to the user's avatar image
- `bio`: TEXT, user's biography or description
- `created_at`: TIMESTAMP WITH TIME ZONE, when the record was created
- `updated_at`: TIMESTAMP WITH TIME ZONE, when the record was last updated

## Security

Both tables have Row Level Security (RLS) policies enabled to ensure users can only access their own data. The policies are:

- Users can view their own videos/profile
- Users can insert their own videos (authentication required)
- Users can update their own videos/profile
- Users can delete their own videos

All operations require proper authentication, ensuring that even in development, the security model remains consistent.

## Automatic Profile Creation

When a new user signs up, a trigger automatically creates a profile record for them using the `handle_new_user` function.
