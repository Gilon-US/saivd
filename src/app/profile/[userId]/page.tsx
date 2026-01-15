"use client";

import {useEffect, useState} from "react";
import {useParams} from "next/navigation";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {PublicProfileCard} from "@/components/profile/PublicProfileCard";

interface PublicProfile {
  id: string;
  display_name: string | null;
  bio: string | null;
  photo: string | null;
  created_at?: string;
  twitter_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  youtube_url?: string | null;
  tiktok_url?: string | null;
  website_url?: string | null;
}

/**
 * Public Profile Page Component
 *
 * Displays a user's public profile information including name, bio, and photo.
 * Accessible via /profile/[userId] without authentication.
 *
 * Story 2.3: Public Profile Page Component
 */
export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      if (!userId) {
        setError("Invalid profile URL");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/profile/${userId}`, {
          cache: 'no-store', // Prevent caching to ensure fresh data
        });
        const data = await response.json();

        if (data.success) {
          setProfile(data.data);
        } else {
          setError(data.error || "Failed to load profile");
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [userId]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600" aria-live="polite">
            Loading profile...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Profile Not Found</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No profile data
  if (!profile) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 sm:py-12" role="main">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <PublicProfileCard profile={profile} />
      </div>
    </main>
  );
}
