# SAVD App - Component Architecture

This document outlines the component architecture for the SAVD App frontend, providing guidance on component organization, state management, and component interactions.

## Overview

The SAVD App frontend is built using Next.js with React and TypeScript. It follows a component-based architecture with a focus on reusability, maintainability, and performance. The application uses Shadcn UI components styled with Tailwind CSS.

## Component Organization

```
src/
├── components/
│   ├── auth/                 # Authentication components
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   ├── PasswordReset.tsx
│   │   └── AuthGuard.tsx     # Protected route wrapper
│   │
│   ├── layout/               # Layout components
│   │   ├── MainLayout.tsx    # Main application layout
│   │   ├── Navbar.tsx        # Top navigation bar
│   │   ├── Sidebar.tsx       # Optional sidebar
│   │   └── Footer.tsx        # Footer component
│   │
│   ├── video/                # Video-related components
│   │   ├── VideoGrid.tsx     # Grid display of videos
│   │   ├── VideoCard.tsx     # Individual video card
│   │   ├── VideoUploader.tsx # Upload component
│   │   ├── VideoPlayer.tsx   # Video playback component
│   │   └── VideoActions.tsx  # Video action buttons
│   │
│   ├── watermark/            # Watermarking components
│   │   ├── WatermarkButton.tsx    # Button to initiate watermarking
│   │   ├── WatermarkStatus.tsx    # Status indicator for watermarking
│   │   ├── PublicUrlGenerator.tsx # Generate public URL component
│   │   └── WatermarkPlaceholder.tsx # Placeholder for unwatermarked videos
│   │
│   ├── ui/                   # Shadcn UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── progress.tsx
│   │   └── ... (other UI components)
│   │
│   └── common/               # Common utility components
│       ├── LoadingSpinner.tsx
│       ├── ErrorDisplay.tsx
│       ├── EmptyState.tsx
│       ├── Pagination.tsx
│       └── Toast.tsx
│
├── hooks/                    # Custom React hooks
│   ├── useAuth.ts            # Authentication hook
│   ├── useVideos.ts          # Video management hook
│   ├── useWatermark.ts       # Watermarking hook
│   ├── useUpload.ts          # File upload hook
│   └── useToast.ts           # Toast notification hook
│
├── lib/                      # Utility functions and services
│   ├── api.ts                # API client
│   ├── auth.ts               # Authentication utilities
│   ├── supabase.ts           # Supabase client
│   ├── wasabi.ts             # Wasabi storage utilities
│   └── utils.ts              # General utility functions
│
└── types/                    # TypeScript type definitions
    ├── auth.ts
    ├── video.ts
    ├── watermark.ts
    └── api.ts
```

## Key Components

### Authentication Components

#### LoginForm

Handles user login with email and password.

**Props:**
- `onSuccess`: Callback function after successful login
- `redirectUrl`: Optional URL to redirect after login

#### RegisterForm

Handles new user registration.

**Props:**
- `onSuccess`: Callback function after successful registration
- `redirectUrl`: Optional URL to redirect after registration

#### AuthGuard

Higher-order component to protect routes from unauthenticated access.

**Props:**
- `children`: React nodes to render if authenticated
- `fallback`: Component to render if not authenticated (default: redirect to login)

### Video Components

#### VideoGrid

Displays a grid of videos with pagination.

**Props:**
- `videos`: Array of video objects
- `loading`: Boolean indicating loading state
- `error`: Optional error object
- `onPageChange`: Function to handle pagination
- `emptyState`: Optional component to show when no videos exist

#### VideoCard

Displays a single video with its thumbnail and actions.

**Props:**
- `video`: Video object
- `onDelete`: Function to handle video deletion
- `onWatermark`: Function to handle watermarking request
- `onGeneratePublicUrl`: Function to handle public URL generation

#### VideoUploader

Handles video file uploads with drag-and-drop support.

**Props:**
- `onUploadComplete`: Callback function after successful upload
- `maxFileSize`: Maximum file size in bytes (default: 100MB)
- `acceptedFileTypes`: Array of accepted MIME types

### Watermark Components

#### WatermarkButton

Button to initiate the watermarking process.

**Props:**
- `videoId`: ID of the video to watermark
- `onWatermarkStart`: Callback function when watermarking starts
- `disabled`: Boolean to disable the button

#### WatermarkStatus

Displays the current status of the watermarking process.

**Props:**
- `status`: Current status string ('pending', 'processing', 'completed', 'error')
- `progress`: Optional progress percentage
- `error`: Optional error message

#### PublicUrlGenerator

Component to generate and display public URLs for watermarked videos.

**Props:**
- `videoId`: ID of the watermarked video
- `onUrlGenerated`: Callback function when URL is generated
- `onUrlRevoked`: Callback function when URL is revoked

## State Management

The application uses a combination of React hooks and context for state management:

### Authentication State

```tsx
// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const session = supabase.auth.getSession();
    setUser(session?.user || null);
    setLoading(false);

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### Video State

```tsx
// src/hooks/useVideos.ts
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function useVideos(page = 1, limit = 20) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page,
    limit,
    totalPages: 0,
  });

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/videos?page=${page}&limit=${limit}`);
        setVideos(response.data.videos);
        setPagination(response.data.pagination);
        setError(null);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [page, limit]);

  return { videos, loading, error, pagination };
}
```

### Upload State

```tsx
// src/hooks/useUpload.ts
import { useState } from 'react';
import { api } from '@/lib/api';

export function useUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const uploadFile = async (file) => {
    try {
      setUploading(true);
      setProgress(0);
      setError(null);

      // 1. Get pre-signed URL
      const { data } = await api.post('/videos/upload', {
        filename: file.name,
        contentType: file.type,
        filesize: file.size,
      });

      // 2. Upload to Wasabi
      const formData = new FormData();
      Object.entries(data.fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file);

      // Create upload with progress tracking
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setProgress(percentComplete);
        }
      });

      // Handle completion
      return new Promise((resolve, reject) => {
        xhr.addEventListener('load', async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            // 3. Confirm upload
            const confirmResponse = await api.post('/videos/confirm', {
              key: data.key,
              filename: file.name,
              filesize: file.size,
              contentType: file.type,
            });
            resolve(confirmResponse.data);
          } else {
            reject(new Error('Upload failed'));
          }
          setUploading(false);
        });

        xhr.addEventListener('error', () => {
          setError(new Error('Upload failed'));
          setUploading(false);
          reject(new Error('Upload failed'));
        });

        xhr.open('POST', data.uploadUrl);
        xhr.send(formData);
      });
    } catch (err) {
      setError(err);
      setUploading(false);
      throw err;
    }
  };

  return { uploadFile, uploading, progress, error };
}
```

## Component Interactions

### Video Upload Flow

```tsx
// src/components/video/VideoUploader.tsx
import { useUpload } from '@/hooks/useUpload';
import { useToast } from '@/hooks/useToast';

export function VideoUploader({ onUploadComplete }) {
  const { uploadFile, uploading, progress, error } = useUpload();
  const { toast } = useToast();

  const handleDrop = async (acceptedFiles) => {
    try {
      const file = acceptedFiles[0];
      const result = await uploadFile(file);
      toast({
        title: 'Upload successful',
        description: `${file.name} has been uploaded.`,
        type: 'success',
      });
      onUploadComplete?.(result);
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err.message,
        type: 'error',
      });
    }
  };

  // Render upload component with progress indicator
}
```

### Watermarking Flow

```tsx
// src/components/watermark/WatermarkButton.tsx
import { useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

export function WatermarkButton({ videoId, onWatermarkStart }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleWatermark = async () => {
    try {
      setLoading(true);
      const response = await api.post(`/videos/${videoId}/watermark`);
      toast({
        title: 'Watermarking started',
        description: 'You will be notified when the process is complete.',
        type: 'info',
      });
      onWatermarkStart?.(response.data);
    } catch (err) {
      toast({
        title: 'Watermarking failed',
        description: err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Render button with loading state
}
```

## Responsive Design

The application uses Tailwind CSS for responsive design, with a mobile-first approach:

```tsx
// src/components/video/VideoGrid.tsx
export function VideoGrid({ videos }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}

// src/components/video/VideoCard.tsx
export function VideoCard({ video }) {
  return (
    <div className="flex flex-col md:flex-row gap-4 p-4 border rounded-lg">
      {/* Mobile: Stack vertically */}
      {/* Desktop: Side by side */}
      <div className="w-full md:w-1/2">
        {/* Original video */}
      </div>
      <div className="w-full md:w-1/2">
        {/* Watermarked version or placeholder */}
      </div>
    </div>
  );
}
```

## Error Handling

The application implements consistent error handling across components:

```tsx
// src/components/common/ErrorDisplay.tsx
export function ErrorDisplay({ error, retry }) {
  return (
    <div className="p-4 border border-red-300 bg-red-50 rounded-md">
      <h3 className="text-red-800 font-medium">Error</h3>
      <p className="text-red-600">{error.message}</p>
      {retry && (
        <button 
          onClick={retry}
          className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded-md hover:bg-red-200"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// Usage in components
function SomeComponent() {
  const { data, error, refetch } = useData();
  
  if (error) {
    return <ErrorDisplay error={error} retry={refetch} />;
  }
  
  // Render component
}
```

## Loading States

The application provides consistent loading states:

```tsx
// src/components/common/LoadingSpinner.tsx
export function LoadingSpinner({ size = 'md' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };
  
  return (
    <div className="flex justify-center items-center">
      <div className={`animate-spin rounded-full border-t-2 border-b-2 border-primary ${sizeClasses[size]}`}></div>
    </div>
  );
}

// src/components/video/VideoGrid.tsx
export function VideoGrid() {
  const { videos, loading, error } = useVideos();
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  
  if (error) {
    return <ErrorDisplay error={error} />;
  }
  
  if (videos.length === 0) {
    return <EmptyState message="No videos found" />;
  }
  
  // Render video grid
}
```

## Best Practices

1. **Component Composition**: Break down complex components into smaller, reusable pieces
2. **Custom Hooks**: Extract complex logic into custom hooks
3. **TypeScript**: Use strong typing for props and state
4. **Error Boundaries**: Implement error boundaries to catch and handle errors
5. **Accessibility**: Ensure all components are accessible (ARIA attributes, keyboard navigation)
6. **Performance**: Use React.memo for expensive components and useMemo/useCallback for optimizations
7. **Testing**: Write unit tests for components and hooks

## Conclusion

This component architecture provides a structured approach to building the SAVD App frontend. By following these patterns and best practices, the application will be maintainable, scalable, and provide a consistent user experience.
