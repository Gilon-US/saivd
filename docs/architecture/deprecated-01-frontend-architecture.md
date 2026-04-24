# SAVD App - Frontend Architecture

## Overview

The frontend architecture for the SAVD App is built using Next.js with React and TypeScript. It follows a component-based approach with a focus on reusability, type safety, and performance. The UI is implemented using Shadcn UI components styled with Tailwind CSS.

## Directory Structure

```
src/
├── app/                  # Next.js App Router pages and layouts
│   ├── (auth)/           # Authentication-related pages (login, register)
│   ├── dashboard/        # Protected dashboard pages
│   ├── watch/            # Public video viewing pages
│   ├── api/              # API routes
│   └── layout.tsx        # Root layout with providers
│
├── components/           # Reusable React components
│   ├── auth/             # Authentication components
│   ├── layout/           # Layout components (header, sidebar, etc.)
│   ├── ui/               # UI components from Shadcn UI
│   ├── video/            # Video-related components
│   └── watermark/        # Watermarking-related components
│
├── hooks/                # Custom React hooks
│   ├── useAuth.ts        # Authentication hook
│   ├── useToast.ts       # Toast notification hook
│   ├── useUpload.ts      # File upload hook
│   └── useVideos.ts      # Video management hook
│
├── lib/                  # Utility functions and service clients
│   ├── supabase.ts       # Supabase client configuration
│   ├── wasabi.ts         # Wasabi S3 client configuration
│   ├── watermark.ts      # External watermarking service client
│   └── utils.ts          # General utility functions
│
└── types/                # TypeScript type definitions
    ├── auth.ts           # Authentication types
    ├── video.ts          # Video-related types
    └── api.ts            # API request/response types
```

## Key Components

### Authentication Components

1. **LoginForm**: Handles user login with email/password
2. **RegisterForm**: Handles new user registration
3. **AuthGuard**: HOC to protect routes from unauthenticated access
4. **UserProfile**: Displays and manages user profile information

### Video Management Components

1. **VideoGrid**: Displays a grid of videos with pagination
2. **VideoCard**: Displays a single video with its thumbnail and actions
3. **VideoUploader**: Handles video file uploads with drag-and-drop
4. **VideoPlayer**: Plays video content with controls

### Watermarking Components

1. **WatermarkButton**: Initiates the watermarking process
2. **WatermarkStatus**: Displays the current status of watermarking
3. **PublicUrlGenerator**: Generates and manages public URLs
4. **WatermarkPlaceholder**: Displays placeholder for unwatermarked videos

### Layout Components

1. **MainLayout**: Main application layout with navigation
2. **Sidebar**: Navigation sidebar for dashboard
3. **Header**: Top navigation bar with user menu
4. **Footer**: Application footer with links and information

## State Management

The application uses a combination of React hooks and context for state management:

### Authentication Context

```typescript
// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
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
    };

    checkUser();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

### Video Management Hooks

```typescript
// src/hooks/useVideos.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Video } from '@/types/video';

export function useVideos(page = 1, limit = 20) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
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
        
        // Calculate offset based on page and limit
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        
        // Query videos from Supabase view
        const { data, error, count } = await supabase
          .from('user_video_dashboard')
          .select('*', { count: 'exact' })
          .range(from, to);
          
        if (error) throw error;
        
        setVideos(data as Video[]);
        setPagination({
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        });
      } catch (err: any) {
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

## Routing Strategy

The application uses Next.js App Router for routing with the following structure:

1. **Public Routes**:
   - `/`: Home/landing page
   - `/login`: User login
   - `/register`: User registration
   - `/watch/[token]`: Public video viewing

2. **Protected Routes**:
   - `/dashboard`: Main dashboard
   - `/dashboard/videos`: Video management
   - `/dashboard/upload`: Video upload
   - `/dashboard/profile`: User profile

3. **API Routes**:
   - `/api/auth/*`: Authentication endpoints
   - `/api/videos/*`: Video management endpoints
   - `/api/callbacks/*`: External service callbacks

## Error Handling

The frontend implements a consistent error handling approach:

1. **API Error Handling**:
   - Structured error responses from API
   - Error boundaries for component failures
   - Toast notifications for user feedback

2. **Form Validation**:
   - Client-side validation before submission
   - Server-side validation feedback display
   - Field-level error messages

3. **Async Operation Handling**:
   - Loading states for all async operations
   - Retry mechanisms for transient failures
   - Graceful degradation when services are unavailable

## Performance Optimization

1. **Code Splitting**:
   - Route-based code splitting with Next.js
   - Dynamic imports for heavy components

2. **Image Optimization**:
   - Next.js Image component for optimized loading
   - Responsive images for different devices
   - Lazy loading for off-screen content

3. **Rendering Strategy**:
   - Server components for static content
   - Client components for interactive elements
   - Strategic use of suspense boundaries

## Accessibility Considerations

The frontend is designed with accessibility in mind:

1. **WCAG Compliance**:
   - Proper heading hierarchy
   - Sufficient color contrast
   - Keyboard navigation support

2. **Assistive Technology Support**:
   - ARIA attributes for complex components
   - Screen reader announcements for dynamic content
   - Focus management for modals and dialogs

3. **Responsive Design**:
   - Mobile-first approach
   - Flexible layouts that adapt to different screen sizes
   - Touch-friendly interaction targets

## Implementation Guidelines

1. **Component Development**:
   - Create atomic, reusable components
   - Document props with TypeScript interfaces
   - Include unit tests for complex components

2. **State Management**:
   - Use React context for global state
   - Use hooks for component-specific state
   - Minimize prop drilling through component hierarchy

3. **Styling Approach**:
   - Use Tailwind CSS utility classes
   - Create consistent design tokens
   - Follow mobile-first responsive design

4. **Performance Considerations**:
   - Optimize component re-renders
   - Implement virtualization for long lists
   - Use appropriate loading states and skeletons
