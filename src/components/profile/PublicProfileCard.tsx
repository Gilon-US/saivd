'use client';

import { useState } from 'react';
import Image from 'next/image';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface PublicProfile {
  id: string;
  display_name: string | null;
  bio: string | null;
  photo: string | null;
}

interface PublicProfileCardProps {
  profile: PublicProfile;
}

/**
 * Public Profile Card Component
 * 
 * Displays a user's public profile information in a card layout.
 * Story 2.3: Public Profile Page Component
 */
export function PublicProfileCard({ profile }: PublicProfileCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 sm:p-8">
      <div className="text-center">
        {/* Profile Photo */}
        <div className="mb-6">
          <ProfilePhoto 
            photo={profile.photo} 
            displayName={profile.display_name} 
          />
        </div>

        {/* Display Name */}
        <DisplayName displayName={profile.display_name} />

        {/* Bio */}
        <Bio bio={profile.bio} />
      </div>
    </div>
  );
}

/**
 * Profile Photo Component
 * Displays user's profile photo with fallback to initials
 */
function ProfilePhoto({ 
  photo, 
  displayName 
}: { 
  photo: string | null; 
  displayName: string | null; 
}) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const initials = displayName 
    ? displayName.split(' ').map(name => name.charAt(0)).join('').toUpperCase().slice(0, 2)
    : '?';

  if (!photo || imageError) {
    return (
      <div 
        className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full mx-auto flex items-center justify-center shadow-lg"
        role="img"
        aria-label={`Profile photo placeholder for ${displayName || 'user'}`}
      >
        <span className="text-white text-2xl sm:text-3xl font-bold">
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-24 h-24 sm:w-32 sm:h-32 mx-auto">
      {imageLoading && (
        <div className="absolute inset-0 bg-gray-200 rounded-full flex items-center justify-center">
          <LoadingSpinner size="sm" />
        </div>
      )}
      <Image
        src={photo}
        alt={`Profile photo of ${displayName || 'user'}`}
        width={128}
        height={128}
        className="rounded-full object-cover w-full h-full shadow-lg ring-4 ring-white"
        onLoad={() => setImageLoading(false)}
        onError={() => {
          setImageError(true);
          setImageLoading(false);
        }}
        priority
      />
    </div>
  );
}

/**
 * Display Name Component
 * Shows user's display name with fallback
 */
function DisplayName({ displayName }: { displayName: string | null }) {
  return (
    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
      {displayName || 'Anonymous User'}
    </h1>
  );
}

/**
 * Bio Component
 * Shows user's bio if available
 */
function Bio({ bio }: { bio: string | null }) {
  if (!bio) {
    return (
      <p className="text-gray-500 italic text-sm sm:text-base">
        No bio available
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-gray-600 text-base sm:text-lg leading-relaxed max-w-lg mx-auto whitespace-pre-wrap">
        {bio}
      </p>
    </div>
  );
}
