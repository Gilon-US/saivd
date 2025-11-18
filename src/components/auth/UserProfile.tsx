"use client";

import {useState, useEffect} from "react";
import Image from "next/image";
import {useAuth} from "@/contexts/AuthContext";
import {useProfile} from "@/contexts/ProfileContext";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {ProfilePhoto} from "@/components/profile/ProfilePhoto";

export function UserProfile() {
  const {user} = useAuth();
  const {profile, loading, error, updateProfile} = useProfile();

  const [displayName, setDisplayName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update local state when profile changes
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate input
    if (!displayName || displayName.trim().length < 2) {
      setFormError("Display name must be at least 2 characters");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateProfile({display_name: displayName.trim()});
    } catch {
      setFormError("Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const membershipSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleString("default", {month: "long", year: "numeric"})
    : null;

  return (
    <div className="space-y-8">
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
            <ProfilePhoto
              photo={profile?.photo || profile?.avatar_url || null}
              displayName={profile?.display_name || user?.email || null}
              size="lg"
            />

            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">{profile?.display_name || user?.email || "Saivd Member"}</h2>
              <div className="h-px bg-gray-300" />
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {membershipSince ? `Saivd Member Since ${membershipSince}` : "Saivd Member"}
              </p>
            </div>
          </div>

          <div className="w-full mt-6 space-y-4 text-left">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-gray-700 dark:text-gray-300">BIO</h3>
              <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                {profile?.bio && profile.bio.trim().length > 0 ? profile.bio : "You haven't added a bio yet."}
              </p>
            </div>

            <div className="pt-4 space-y-4">
              <button
                type="button"
                className="w-full py-3 rounded-full border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-gray-800">
                + Follow
              </button>

              <div className="flex items-center justify-center gap-3 text-gray-700 dark:text-gray-200">
                {["X", "IG", "FB", "YT", "SC", "P"].map((label) => (
                  <div
                    key={label}
                    className="h-8 w-8 rounded-md bg-black text-white flex items-center justify-center text-xs font-semibold"
                    aria-hidden="true">
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={user?.email || ""} disabled aria-readonly="true" />
          <p className="text-xs text-gray-500">Email cannot be changed</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            required
            minLength={2}
            maxLength={50}
            disabled={isSubmitting}
            aria-invalid={formError ? "true" : "false"}
          />
          {formError && (
            <p className="text-sm text-red-500" role="alert">
              {formError}
            </p>
          )}
        </div>

        {error && !formError && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isSubmitting || loading}>
          {isSubmitting ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </form>
    </div>
  );
}
