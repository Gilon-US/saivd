-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  -- Stable numeric surrogate key for external services and public URLs
  numeric_user_id BIGSERIAL UNIQUE,
  -- URL fields for user social profiles (all optional)
  twitter_url TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  youtube_url TEXT,
  tiktok_url TEXT,
  website_url TEXT,
  -- Application-level role: admin or user
  role TEXT NOT NULL DEFAULT 'user',
  -- RSA keypair for this user (backend-only, never exposed via public APIs)
  rsa_public TEXT,
  rsa_private TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing self-only policies if they exist to avoid conflicts when re-running
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create admin-aware policies
CREATE POLICY "Users can view profiles (self or admin)"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p_admin
      WHERE p_admin.id = auth.uid()
        AND p_admin.role = 'admin'
    )
  );

CREATE POLICY "Users can update profiles (self or admin)"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p_admin
      WHERE p_admin.id = auth.uid()
        AND p_admin.role = 'admin'
    )
  );

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Create index for numeric_user_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_numeric_user_id ON public.profiles(numeric_user_id);

-- Create index for role lookups (admin vs user)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to automatically create profile when a new user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
