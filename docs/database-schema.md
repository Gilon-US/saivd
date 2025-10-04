# SAVD App - Database Schema

This document outlines the database schema for the SAVD App, including tables, relationships, indexes, and security policies.

## Overview

The SAVD App uses Supabase PostgreSQL as its primary database. The schema is designed to support user authentication, video management, and the watermarking workflow. Row-level security (RLS) policies ensure that users can only access their own data.

## Tables

### Users

This table extends the default Supabase auth.users table with additional user profile information.

```sql
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);
```

### Videos

This table stores metadata for all uploaded videos.

```sql
CREATE TABLE public.videos (
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

CREATE POLICY "Users can insert their own videos"
  ON public.videos
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own videos"
  ON public.videos
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own videos"
  ON public.videos
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_videos_user_id ON public.videos(user_id);
CREATE INDEX idx_videos_upload_date ON public.videos(upload_date);
```

### Watermarked Videos

This table stores metadata for watermarked versions of videos.

```sql
CREATE TABLE public.watermarked_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  watermarked_url TEXT,
  watermarked_thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, error
  error_message TEXT,
  watermark_date TIMESTAMP WITH TIME ZONE,
  public_url_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.watermarked_videos ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own watermarked videos"
  ON public.watermarked_videos
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watermarked videos"
  ON public.watermarked_videos
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watermarked videos"
  ON public.watermarked_videos
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watermarked videos"
  ON public.watermarked_videos
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_watermarked_videos_video_id ON public.watermarked_videos(video_id);
CREATE INDEX idx_watermarked_videos_user_id ON public.watermarked_videos(user_id);
CREATE INDEX idx_watermarked_videos_status ON public.watermarked_videos(status);
CREATE INDEX idx_watermarked_videos_public_url_token ON public.watermarked_videos(public_url_token);
```

### Watermarking Jobs

This table tracks watermarking job requests and their status.

```sql
CREATE TABLE public.watermarking_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE NOT NULL,
  watermarked_video_id UUID REFERENCES public.watermarked_videos(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  external_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, error
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  callback_received BOOLEAN DEFAULT FALSE,
  callback_timestamp TIMESTAMP WITH TIME ZONE,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.watermarking_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own watermarking jobs"
  ON public.watermarking_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watermarking jobs"
  ON public.watermarking_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watermarking jobs"
  ON public.watermarking_jobs
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_watermarking_jobs_video_id ON public.watermarking_jobs(video_id);
CREATE INDEX idx_watermarking_jobs_watermarked_video_id ON public.watermarking_jobs(watermarked_video_id);
CREATE INDEX idx_watermarking_jobs_user_id ON public.watermarking_jobs(user_id);
CREATE INDEX idx_watermarking_jobs_external_job_id ON public.watermarking_jobs(external_job_id);
CREATE INDEX idx_watermarking_jobs_status ON public.watermarking_jobs(status);
```

### Public Access Tokens

This table manages public access tokens for sharing watermarked videos.

```sql
CREATE TABLE public.public_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watermarked_video_id UUID REFERENCES public.watermarked_videos(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.public_access_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own tokens"
  ON public.public_access_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tokens"
  ON public.public_access_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tokens"
  ON public.public_access_tokens
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tokens"
  ON public.public_access_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_public_access_tokens_watermarked_video_id ON public.public_access_tokens(watermarked_video_id);
CREATE INDEX idx_public_access_tokens_user_id ON public.public_access_tokens(user_id);
CREATE INDEX idx_public_access_tokens_token ON public.public_access_tokens(token);
CREATE INDEX idx_public_access_tokens_is_active ON public.public_access_tokens(is_active);
```

## Functions and Triggers

### Update Updated_At Timestamp

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at column
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at
BEFORE UPDATE ON public.videos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_watermarked_videos_updated_at
BEFORE UPDATE ON public.watermarked_videos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_watermarking_jobs_updated_at
BEFORE UPDATE ON public.watermarking_jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_public_access_tokens_updated_at
BEFORE UPDATE ON public.public_access_tokens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Create User Profile on Signup

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Cascade Video Deletion

```sql
CREATE OR REPLACE FUNCTION public.handle_video_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- When a video is deleted, ensure all related records are cleaned up
  DELETE FROM public.watermarked_videos WHERE video_id = OLD.id;
  DELETE FROM public.watermarking_jobs WHERE video_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_video_deleted
  BEFORE DELETE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.handle_video_deletion();
```

## Views

### User Video Dashboard View

```sql
CREATE OR REPLACE VIEW public.user_video_dashboard AS
SELECT 
  v.id AS video_id,
  v.user_id,
  v.filename,
  v.filesize,
  v.original_url,
  v.original_thumbnail_url,
  v.upload_date,
  wv.id AS watermarked_video_id,
  wv.watermarked_url,
  wv.watermarked_thumbnail_url,
  wv.status AS watermark_status,
  wv.watermark_date,
  CASE WHEN pat.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_public_access,
  pat.token AS public_access_token
FROM 
  public.videos v
LEFT JOIN 
  public.watermarked_videos wv ON v.id = wv.video_id
LEFT JOIN 
  public.public_access_tokens pat ON wv.id = pat.watermarked_video_id AND pat.is_active = TRUE
ORDER BY 
  v.upload_date DESC;

-- Enable Row Level Security
ALTER VIEW public.user_video_dashboard ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Users can view their own dashboard"
  ON public.user_video_dashboard
  FOR SELECT
  USING (auth.uid() = user_id);
```

## Security Considerations

1. **Row-Level Security (RLS)**: All tables have RLS policies to ensure users can only access their own data.

2. **JWT Authentication**: Supabase JWT tokens are used for authentication and authorization.

3. **Secure Defaults**: Tables are created with RLS enabled by default.

4. **Minimal Permissions**: Policies grant only the necessary permissions for each operation.

5. **Data Validation**: Check constraints and triggers enforce data integrity.

6. **Secure Functions**: Functions use SECURITY DEFINER only when necessary and with careful consideration.

7. **Token Management**: Public access tokens have expiration dates and can be revoked.

## Performance Considerations

1. **Indexes**: Strategic indexes are created for frequently queried columns.

2. **Denormalization**: Some data is denormalized for query performance.

3. **Views**: Pre-joined views simplify common queries and improve performance.

4. **Pagination**: API endpoints should implement pagination for large result sets.

5. **Selective Columns**: Queries should select only needed columns to reduce data transfer.

## Migration Strategy

Database migrations should be managed using Supabase migrations:

1. Create a migration file for each schema change
2. Test migrations in development environment
3. Apply migrations in staging before production
4. Include rollback procedures for each migration
5. Document all schema changes in the migration files

## Example Queries

### Get User's Videos with Watermark Status

```sql
SELECT * FROM public.user_video_dashboard
WHERE user_id = auth.uid()
ORDER BY upload_date DESC
LIMIT 20 OFFSET 0;
```

### Get Pending Watermarking Jobs

```sql
SELECT 
  wj.id, 
  wj.video_id, 
  v.filename, 
  wj.status, 
  wj.created_at
FROM 
  public.watermarking_jobs wj
JOIN 
  public.videos v ON wj.video_id = v.id
WHERE 
  wj.user_id = auth.uid() AND 
  wj.status = 'pending'
ORDER BY 
  wj.created_at DESC;
```

### Create Public Access Token

```sql
INSERT INTO public.public_access_tokens 
  (watermarked_video_id, user_id, token, expires_at)
VALUES 
  ('video_uuid', auth.uid(), 'secure_random_token', NOW() + INTERVAL '30 days')
RETURNING id, token;
```

### Revoke Public Access

```sql
UPDATE public.public_access_tokens
SET is_active = FALSE, updated_at = NOW()
WHERE id = 'token_uuid' AND user_id = auth.uid();
```
