"use client";

import {useState} from "react";
import Image from "next/image";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {Twitter, Instagram, Facebook, Youtube, Link as LinkIcon, Globe} from "lucide-react";

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

interface PublicProfileCardProps {
  profile: PublicProfile;
}

/**
 * Public Profile Card Component
 *
 * Displays a user's public profile information in a card layout.
 * Story 2.3: Public Profile Page Component
 */
export function PublicProfileCard({profile}: PublicProfileCardProps) {
  const membershipSince = profile.created_at
    ? new Date(profile.created_at).toLocaleString("default", {month: "long", year: "numeric"})
    : null;

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-3xl shadow-md border border-gray-200 dark:border-gray-700 max-w-md mx-auto overflow-hidden">
      <div className="flex flex-col items-center px-6 pt-6 pb-8">
        <div className="mb-4">
          <Image
            src="/images/saivd-logo.png"
            alt="Saivd logo"
            className="h-10 w-auto"
            width={200}
            height={40}
            priority
          />
        </div>

        <div className="w-full mb-6">
          <div className="bg-lime-400 text-black text-center py-3 rounded-md font-bold text-sm tracking-wide">
            VERIFIED
            <div className="text-xs font-normal mt-1">Saivd Member</div>
          </div>
        </div>

        <div className="flex flex-col items-center space-y-4">
          <ProfilePhoto photo={profile.photo} displayName={profile.display_name} />

          <div className="text-center space-y-2">
            <DisplayName displayName={profile.display_name} />
            <div className="h-px bg-gray-300" />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {membershipSince ? `Saivd Member Since ${membershipSince}` : "Saivd Member"}
            </p>
          </div>
        </div>

        <div className="w-full mt-6 space-y-4 text-left">
          <Bio bio={profile.bio} />

          <div className="pt-4 space-y-4">
            { /* <button
              type="button"
              className="w-full py-3 rounded-full border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-gray-800">
              + Follow
            </button> */}

            <div className="flex items-center justify-center gap-3 text-gray-700 dark:text-gray-200">
              <span className="sr-only">Social links</span>
              {profile.twitter_url && (
                <a
                  href={profile.twitter_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-md bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
                  aria-label="Twitter profile">
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              {profile.instagram_url && (
                <a
                  href={profile.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-md bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
                  aria-label="Instagram profile">
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {profile.facebook_url && (
                <a
                  href={profile.facebook_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-md bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
                  aria-label="Facebook profile">
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              {profile.youtube_url && (
                <a
                  href={profile.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-md bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
                  aria-label="YouTube channel">
                  <Youtube className="h-4 w-4" />
                </a>
              )}
              {profile.tiktok_url && (
                <a
                  href={profile.tiktok_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-md bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
                  aria-label="TikTok profile">
                  <LinkIcon className="h-4 w-4" />
                </a>
              )}
              {profile.website_url && (
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-md bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
                  aria-label="Website">
                  <Globe className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Profile Photo Component
 * Displays user's profile photo with fallback to initials
 */
function ProfilePhoto({photo, displayName}: {photo: string | null; displayName: string | null}) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const initials = displayName
    ? displayName
        .split(" ")
        .map((name) => name.charAt(0))
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  if (!photo || imageError) {
    return (
      <div
        className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full mx-auto flex items-center justify-center shadow-lg"
        role="img"
        aria-label={`Profile photo placeholder for ${displayName || "user"}`}>
        <span className="text-white text-2xl sm:text-3xl font-bold">{initials}</span>
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
      {/* Use regular img tag for external URLs - allows any domain without Next.js config */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt={`Profile photo of ${displayName || "user"}`}
        className="rounded-full object-cover w-full h-full shadow-lg ring-4 ring-white"
        onLoad={() => setImageLoading(false)}
        onError={() => {
          setImageError(true);
          setImageLoading(false);
        }}
      />
    </div>
  );
}

/**
 * Display Name Component
 * Shows user's display name with fallback
 */
function DisplayName({displayName}: {displayName: string | null}) {
  return <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{displayName || "Anonymous User"}</h1>;
}

/**
 * Bio Component
 * Shows user's bio if available
 */
function Bio({bio}: {bio: string | null}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-gray-700 dark:text-gray-300">BIO</h3>
      <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed max-w-lg mx-auto whitespace-pre-wrap">
        {bio && bio.trim().length > 0 ? bio : "No bio available"}
      </p>
    </div>
  );
}
