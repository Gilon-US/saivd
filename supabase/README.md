# Supabase Setup for SAVD App

This directory contains SQL migrations and setup instructions for the Supabase backend.

## Setting Up the Videos Table

The application requires a `videos` table in your Supabase database. You can create this table by running the SQL script in the migrations directory.

### Option 1: Using the Supabase Dashboard

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `migrations/create_videos_table.sql`
4. Paste into the SQL Editor and run the script

### Option 2: Using the Supabase CLI

If you have the Supabase CLI installed, you can run:

```bash
supabase db push
```

## Table Structure

The videos table has the following structure:

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

## Row Level Security

The table has Row Level Security (RLS) enabled with the following policies:

- Users can only view their own videos
- Users can only insert their own videos
- Users can only update their own videos
- Users can only delete their own videos

## Error: "Could not find the table 'public.videos' in the schema cache"

If you see this error, it means the videos table hasn't been created yet. Follow the instructions above to create the table.
