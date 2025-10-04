'use client';

import { useState } from 'react';
import Image from 'next/image';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface ProfilePhotoProps {
  photo: string | null;
  displayName: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

/**
 * Profile Photo Component
 * 
 * Displays a user's profile photo with fallback to initials.
 * Supports multiple sizes and custom styling.
 * 
 * Story 2.3: Public Profile Page Component
 */
export function ProfilePhoto({ 
  photo, 
  displayName, 
  size = 'md',
  className = '' 
}: ProfilePhotoProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(!!photo);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24 sm:w-32 sm:h-32',
    xl: 'w-32 h-32 sm:w-40 sm:h-40'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl sm:text-3xl',
    xl: 'text-3xl sm:text-4xl'
  };

  const initials = displayName 
    ? displayName.split(' ')
        .map(name => name.charAt(0))
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const baseClasses = `${sizeClasses[size]} rounded-full mx-auto flex items-center justify-center ${className}`;

  // Show fallback if no photo or image failed to load
  if (!photo || imageError) {
    return (
      <div 
        className={`${baseClasses} bg-gradient-to-br from-blue-400 to-purple-500 shadow-lg`}
        role="img"
        aria-label={`Profile photo placeholder for ${displayName || 'user'}`}
      >
        <span className={`text-white font-bold ${textSizeClasses[size]}`}>
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative ${baseClasses}`}>
      {imageLoading && (
        <div className="absolute inset-0 bg-gray-200 rounded-full flex items-center justify-center">
          <LoadingSpinner size={size === 'sm' ? 'sm' : size === 'xl' ? 'lg' : 'md'} />
        </div>
      )}
      <Image
        src={photo}
        alt={`Profile photo of ${displayName || 'user'}`}
        fill
        className="rounded-full object-cover shadow-lg ring-4 ring-white"
        onLoad={() => setImageLoading(false)}
        onError={() => {
          setImageError(true);
          setImageLoading(false);
        }}
        priority={size === 'lg' || size === 'xl'}
        sizes={
          size === 'sm' ? '48px' :
          size === 'md' ? '64px' :
          size === 'lg' ? '(max-width: 640px) 96px, 128px' :
          '(max-width: 640px) 128px, 160px'
        }
      />
    </div>
  );
}
