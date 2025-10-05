import { Metadata } from 'next';
import { ReactNode } from 'react';

/**
 * Layout for Public Profile Pages
 * 
 * Provides SEO metadata and layout structure for profile pages.
 * Story 2.3: Public Profile Page Component
 */

interface ProfileLayoutProps {
  children: ReactNode;
  params: Promise<{ userId: string }>;
}

/**
 * Generate dynamic metadata for profile pages
 */
export async function generateMetadata(context: { params: Promise<{ userId: string }> }): Promise<Metadata> {
  const { userId } = await context.params;
  
  try {
    // Fetch profile data for metadata
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/profile/${userId}`, {
      cache: 'no-store' // Don't cache metadata requests
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.success && data.data) {
        const profile = data.data;
        const displayName = profile.display_name || 'SAVD User';
        const bio = profile.bio || `View ${displayName}'s profile on SAVD`;
        
        return {
          title: `${displayName} - SAVD Profile`,
          description: bio,
          openGraph: {
            title: `${displayName} - SAVD Profile`,
            description: bio,
            type: 'profile',
            images: profile.photo ? [
              {
                url: profile.photo,
                width: 400,
                height: 400,
                alt: `Profile photo of ${displayName}`,
              }
            ] : [],
            siteName: 'SAVD',
          },
          twitter: {
            card: 'summary',
            title: `${displayName} - SAVD Profile`,
            description: bio,
            images: profile.photo ? [profile.photo] : [],
          },
          robots: {
            index: true,
            follow: true,
          },
          alternates: {
            canonical: `/profile/${userId}`,
          },
        };
      }
    }
  } catch (error) {
    console.error('Error generating metadata for profile:', error);
  }
  
  // Fallback metadata
  return {
    title: 'User Profile - SAVD',
    description: 'View this user\'s profile on SAVD',
    openGraph: {
      title: 'User Profile - SAVD',
      description: 'View this user\'s profile on SAVD',
      type: 'profile',
      siteName: 'SAVD',
    },
    twitter: {
      card: 'summary',
      title: 'User Profile - SAVD',
      description: 'View this user\'s profile on SAVD',
    },
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `/profile/${userId}`,
    },
  };
}

export default function ProfileLayout({ children }: ProfileLayoutProps) {
  return (
    <>
      {children}
    </>
  );
}
