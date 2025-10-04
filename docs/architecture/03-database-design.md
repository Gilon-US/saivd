# SAVD App - Database Design

## Overview

The SAVD App uses Supabase PostgreSQL as its primary database. The schema is designed to support user authentication, video management, and the watermarking workflow. Row-level security (RLS) policies ensure that users can only access their own data.

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│                 │       │                 │       │                 │
│     profiles    │       │     videos      │       │  watermarked    │
│                 │       │                 │       │     videos      │
│ id (PK)         │       │ id (PK)         │       │                 │
│ email           │◄──────┤ user_id (FK)    │       │ id (PK)         │
│ display_name    │       │ filename        │       │ video_id (FK)   │◄─┐
│ avatar_url      │       │ filesize        │       │ user_id (FK)    │  │
│ created_at      │       │ content_type    │       │ watermarked_url │  │
│ updated_at      │       │ original_url    │       │ watermarked_    │  │
│                 │       │ original_       │       │   thumbnail_url │  │
│                 │       │   thumbnail_url │       │ status          │  │
│                 │       │ upload_date     │       │ error_message   │  │
│                 │       │ created_at      │       │ watermark_date  │  │
│                 │       │ updated_at      │       │ created_at      │  │
│                 │       │                 │       │ updated_at      │  │
└─────────────────┘       └────────┬────────┘       └────────┬────────┘  │
                                   │                         │           │
                                   │                         │           │
                                   ▼                         │           │
┌─────────────────┐       ┌─────────────────┐                │           │
│                 │       │                 │                │           │
│  watermarking   │       │ public_access   │                │           │
│     jobs        │       │    tokens       │                │           │
│                 │       │                 │                │           │
│ id (PK)         │       │ id (PK)         │                │           │
│ video_id (FK)   │       │ watermarked_    │                │           │
│ watermarked_    │       │   video_id (FK) ├────────────────┘           │
│   video_id (FK) ├───────┤ user_id (FK)    │                            │
│ user_id (FK)    │       │ token           │                            │
│ external_job_id │       │ expires_at      │                            │
│ status          │       │ is_active       │                            │
│ error_message   │       │ created_at      │                            │
│ request_payload │       │ updated_at      │                            │
│ response_payload│       │                 │                            │
│ callback_       │       │                 │                            │
│   received      │       │                 │                            │
│ callback_       │       │                 │                            │
│   timestamp     │       │                 │                            │
│ retry_count     │       │                 │                            │
│ created_at      │       │                 │                            │
│ updated_at      │       │                 │                            │
└─────────────────┘       └─────────────────┘                            │
        ▲                                                                │
        └────────────────────────────────────────────────────────────────┘
```

## Tables Schema

### Profiles Table

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

-- Create index
CREATE INDEX idx_profiles_email ON public.profiles(email);
```

### Videos Table

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
CREATE INDEX idx_videos_content_type ON public.videos(content_type);
```

### Watermarked Videos Table

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
```

### Watermarking Jobs Table

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
  callback_token TEXT,
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
CREATE INDEX idx_watermarking_jobs_callback_token ON public.watermarking_jobs(callback_token);
```

### Public Access Tokens Table

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
CREATE INDEX idx_public_access_tokens_expires_at ON public.public_access_tokens(expires_at);
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
  v.content_type,
  v.original_url,
  v.original_thumbnail_url,
  v.upload_date,
  wv.id AS watermarked_video_id,
  wv.watermarked_url,
  wv.watermarked_thumbnail_url,
  wv.status AS watermark_status,
  wv.watermark_date,
  CASE WHEN pat.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_public_access,
  pat.token AS public_access_token,
  pat.expires_at AS public_access_expires_at
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

### Recent Watermarking Jobs View

```sql
CREATE OR REPLACE VIEW public.recent_watermarking_jobs AS
SELECT 
  wj.id AS job_id,
  wj.video_id,
  wj.watermarked_video_id,
  wj.user_id,
  wj.external_job_id,
  wj.status,
  wj.error_message,
  wj.callback_received,
  wj.callback_timestamp,
  wj.retry_count,
  wj.created_at,
  v.filename,
  v.original_url,
  wv.watermarked_url
FROM 
  public.watermarking_jobs wj
JOIN 
  public.videos v ON wj.video_id = v.id
JOIN 
  public.watermarked_videos wv ON wj.watermarked_video_id = wv.id
WHERE 
  wj.created_at > NOW() - INTERVAL '7 days'
ORDER BY 
  wj.created_at DESC;

-- Enable Row Level Security
ALTER VIEW public.recent_watermarking_jobs ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Users can view their own jobs"
  ON public.recent_watermarking_jobs
  FOR SELECT
  USING (auth.uid() = user_id);
```

## Row-Level Security (RLS) Policies

The database uses Supabase's Row-Level Security to ensure that users can only access their own data. Each table has policies that restrict access based on the user's ID.

### Key Security Principles

1. **Default Deny**: All tables have RLS enabled, which means access is denied by default unless explicitly granted by a policy.

2. **User Isolation**: Policies ensure users can only access their own data by comparing `auth.uid()` with the `user_id` column.

3. **Cascading Deletes**: Foreign key constraints with `ON DELETE CASCADE` ensure that when a parent record is deleted, all related child records are automatically deleted.

4. **Minimal Permissions**: Policies grant only the necessary permissions for each operation (SELECT, INSERT, UPDATE, DELETE).

## Indexing Strategy

The database uses strategic indexes to optimize query performance:

1. **Primary Keys**: All tables have a UUID primary key with an automatically generated index.

2. **Foreign Keys**: All foreign key columns are indexed to optimize joins.

3. **Filtering Columns**: Columns commonly used in WHERE clauses (e.g., status, is_active) are indexed.

4. **Sorting Columns**: Columns used for sorting (e.g., upload_date, created_at) are indexed.

5. **Unique Constraints**: Columns with unique constraints (e.g., token) have unique indexes.

## Query Optimization

### Optimized Queries for Common Operations

1. **Get User's Videos with Watermark Status**:

```sql
SELECT * FROM public.user_video_dashboard
WHERE user_id = auth.uid()
ORDER BY upload_date DESC
LIMIT 20 OFFSET 0;
```

2. **Get Pending Watermarking Jobs**:

```sql
SELECT * FROM public.recent_watermarking_jobs
WHERE user_id = auth.uid() AND status = 'processing'
ORDER BY created_at DESC;
```

3. **Check Public Access Token Validity**:

```sql
SELECT 
  pat.id, 
  wv.watermarked_url,
  v.filename
FROM 
  public.public_access_tokens pat
JOIN 
  public.watermarked_videos wv ON pat.watermarked_video_id = wv.id
JOIN 
  public.videos v ON wv.video_id = v.id
WHERE 
  pat.token = 'token_value' AND
  pat.is_active = TRUE AND
  pat.expires_at > NOW();
```

## Migration Strategy

Database migrations will be managed using Supabase migrations:

1. **Initial Schema**: Create the base schema with all tables, indexes, and policies.

2. **Incremental Changes**: Each schema change should be implemented as a separate migration.

3. **Testing**: Test migrations in development environment before applying to production.

4. **Rollback Plans**: Include rollback procedures for each migration.

5. **Documentation**: Document all schema changes in the migration files.

## Performance Considerations

1. **Connection Pooling**: Use connection pooling to manage database connections efficiently.

2. **Query Optimization**: Use EXPLAIN ANALYZE to identify and optimize slow queries.

3. **Pagination**: Implement pagination for large result sets to avoid loading too much data at once.

4. **Selective Columns**: Select only needed columns to reduce data transfer.

5. **Denormalization**: Use views to denormalize data for common queries.

6. **Caching**: Consider caching frequently accessed, relatively static data.

## Data Integrity

1. **Constraints**: Use foreign key constraints to maintain referential integrity.

2. **Validation**: Implement check constraints for data validation.

3. **Triggers**: Use triggers to automate data maintenance tasks.

4. **Transactions**: Use transactions for operations that require atomicity.

## Backup and Recovery

1. **Regular Backups**: Configure Supabase to perform regular backups.

2. **Point-in-Time Recovery**: Enable point-in-time recovery for disaster recovery.

3. **Backup Testing**: Regularly test backup restoration process.

4. **Retention Policy**: Define a backup retention policy based on business needs.
