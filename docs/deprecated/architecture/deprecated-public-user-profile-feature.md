# Public User Profile Feature - Full-Stack Architecture

## Overview
This document outlines the architecture for implementing a public user profile feature that allows users to view other users' profiles via direct URL navigation to `/profile/{user_id}`.

## Feature Requirements
- **URL Pattern**: `/profile/{user_id}` - Direct navigation only, no site links
- **Display Elements**: User name, bio, and photo
- **Database Enhancement**: Add `photo` column to profiles table for image URL storage
- **Access Pattern**: Public read-only access to user profiles

## Architecture Components

### 1. Database Layer

#### Schema Changes
```sql
-- Add photo column to existing profiles table
ALTER TABLE public.profiles 
ADD COLUMN photo TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.photo IS 'URL to user profile photo stored externally';

-- Update RLS policies to allow public read access for profile viewing
CREATE POLICY "Allow public read access to profiles"
  ON public.profiles
  FOR SELECT
  TO public
  USING (true);
```

#### Data Model
```typescript
interface PublicProfile {
  id: string;
  display_name: string | null;
  bio: string | null;
  photo: string | null;
}
```

### 2. API Layer

#### Endpoint: GET /api/profile/[userId]
```typescript
// Location: /src/app/api/profile/[userId]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  // Validate userId format (UUID)
  // Query public profile data
  // Return sanitized profile information
  // Handle user not found cases
}
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "display_name": "John Doe",
    "bio": "Software developer and video creator",
    "photo": "https://example.com/photos/user-123.jpg"
  }
}
```

**Error Handling:**
- 400: Invalid user ID format
- 404: User not found
- 500: Server error

### 3. Frontend Layer

#### Page Component
```typescript
// Location: /src/app/profile/[userId]/page.tsx
interface ProfilePageProps {
  params: { userId: string };
}

export default function PublicProfilePage({ params }: ProfilePageProps) {
  // Fetch user profile data
  // Handle loading states
  // Display profile information
  // Handle error states (user not found, etc.)
}
```

#### Component Structure
```
PublicProfilePage
├── ProfileHeader
│   ├── ProfilePhoto
│   ├── DisplayName
│   └── Bio
├── LoadingState
└── ErrorState
```

### 4. Security Considerations

#### Access Control
- **Public Read Access**: Profiles are publicly viewable
- **Data Sanitization**: Only display safe, public profile fields
- **Rate Limiting**: Implement to prevent abuse
- **Input Validation**: Validate userId parameter format

#### Privacy Controls
- **Opt-out Mechanism**: Consider future feature for private profiles
- **Data Minimization**: Only expose necessary profile fields
- **Content Moderation**: Consider moderation for bio content

### 5. Implementation Plan

#### Phase 1: Database Migration
1. Create migration file for photo column
2. Update RLS policies for public read access
3. Test database changes in development

#### Phase 2: API Development
1. Create dynamic API route `/api/profile/[userId]`
2. Implement profile data fetching logic
3. Add proper error handling and validation
4. Write API tests

#### Phase 3: Frontend Implementation
1. Create dynamic page route `/profile/[userId]`
2. Implement profile display components
3. Add loading and error states
4. Style profile page layout
5. Test responsive design

#### Phase 4: Integration & Testing
1. End-to-end testing of profile viewing
2. Performance optimization
3. Security testing
4. Accessibility compliance

### 6. Technical Specifications

#### Database Migration
```sql
-- Migration: add_photo_to_profiles.sql
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS photo TEXT;

COMMENT ON COLUMN public.profiles.photo IS 'URL to user profile photo stored externally';

-- Add public read policy
DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;
CREATE POLICY "Allow public read access to profiles"
  ON public.profiles
  FOR SELECT
  TO public
  USING (true);
```

#### API Route Implementation
```typescript
// /src/app/api/profile/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isValidUUID } from '@/utils/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    
    // Validate UUID format
    if (!isValidUUID(userId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid user ID format' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Fetch public profile data
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, display_name, bio, photo')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error fetching public profile:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
```

#### Page Component Implementation
```typescript
// /src/app/profile/[userId]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface PublicProfile {
  id: string;
  display_name: string | null;
  bio: string | null;
  photo: string | null;
}

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch(`/api/profile/${userId}`);
        const data = await response.json();

        if (data.success) {
          setProfile(data.data);
        } else {
          setError(data.error || 'Failed to load profile');
        }
      } catch (err) {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchProfile();
    }
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Profile Not Found</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="text-center">
            {/* Profile Photo */}
            <div className="mb-6">
              {profile.photo ? (
                <Image
                  src={profile.photo}
                  alt={profile.display_name || 'User profile'}
                  width={120}
                  height={120}
                  className="rounded-full mx-auto object-cover"
                />
              ) : (
                <div className="w-30 h-30 bg-gray-200 rounded-full mx-auto flex items-center justify-center">
                  <span className="text-gray-400 text-2xl">
                    {profile.display_name?.charAt(0) || '?'}
                  </span>
                </div>
              )}
            </div>

            {/* Display Name */}
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {profile.display_name || 'Anonymous User'}
            </h1>

            {/* Bio */}
            {profile.bio && (
              <p className="text-gray-600 text-lg leading-relaxed max-w-lg mx-auto">
                {profile.bio}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 7. File Structure
```
src/
├── app/
│   ├── api/
│   │   └── profile/
│   │       └── [userId]/
│   │           └── route.ts
│   └── profile/
│       └── [userId]/
│           ├── page.tsx
│           └── loading.tsx
├── components/
│   └── profile/
│       ├── PublicProfileCard.tsx
│       └── ProfilePhoto.tsx
└── utils/
    └── validation.ts

supabase/
└── migrations/
    └── add_photo_to_profiles.sql
```

### 8. Testing Strategy

#### Unit Tests
- API route parameter validation
- Profile data fetching logic
- Component rendering with different data states

#### Integration Tests
- End-to-end profile viewing flow
- Database query performance
- Error handling scenarios

#### Security Tests
- SQL injection prevention
- Rate limiting effectiveness
- Data exposure validation

### 9. Performance Considerations

#### Optimization Strategies
- **Image Optimization**: Use Next.js Image component for profile photos
- **Caching**: Implement appropriate cache headers for profile data
- **Database Indexing**: Ensure profiles table has proper indexes
- **CDN**: Consider CDN for profile images

#### Monitoring
- Track profile view metrics
- Monitor API response times
- Alert on error rates

### 10. Future Enhancements

#### Potential Features
- **Privacy Controls**: Allow users to make profiles private
- **Social Features**: Add follower/following functionality
- **Rich Profiles**: Add more profile fields (location, website, etc.)
- **Profile Analytics**: Track profile views for users
- **Custom URLs**: Allow custom profile URLs instead of UUIDs

## Conclusion

This architecture provides a solid foundation for implementing public user profiles with proper security, performance, and scalability considerations. The implementation follows Next.js best practices and maintains consistency with the existing SAVD application architecture.
