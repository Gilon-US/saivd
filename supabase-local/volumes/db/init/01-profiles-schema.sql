-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create updated_at timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
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

-- Create videos table
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

-- Create watermarked videos table
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

-- Create watermarking jobs table
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

-- Create public access tokens table
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

-- Apply triggers to all tables with updated_at column
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

-- Create user profile on signup
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

-- Create views
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
