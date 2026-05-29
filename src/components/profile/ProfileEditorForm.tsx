"use client";

import {useState, useEffect, useRef} from "react";
import Link from "next/link";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {useProfile} from "@/contexts/ProfileContext";
import {useAuth} from "@/contexts/AuthContext";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {Upload, X, User} from "lucide-react";
import {QrOverlayPositionPicker} from "@/components/presentation/QrOverlayPositionPicker";
import {
  DEFAULT_QR_OVERLAY_POSITION,
  parseQrOverlayPosition,
  type QrOverlayPosition,
} from "@/lib/presentation-qr/position";

const BIO_MAX = 500;
const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 100;
const MAX_PHOTO_BYTES = 50 * 1024; // 50 KB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function getProfileDefaults(profile: {display_name?: string | null; photo?: string | null; bio?: string | null; qr_overlay_position?: string | null; twitter_url?: string | null; instagram_url?: string | null; facebook_url?: string | null; youtube_url?: string | null; tiktok_url?: string | null; website_url?: string | null} | null) {
  return {
    displayName: profile?.display_name ?? "",
    photo: profile?.photo ?? "",
    bio: profile?.bio ?? "",
    qrOverlayPosition: parseQrOverlayPosition(profile?.qr_overlay_position),
    twitterUrl: profile?.twitter_url ?? "",
    instagramUrl: profile?.instagram_url ?? "",
    facebookUrl: profile?.facebook_url ?? "",
    youtubeUrl: profile?.youtube_url ?? "",
    tiktokUrl: profile?.tiktok_url ?? "",
    websiteUrl: profile?.website_url ?? "",
  };
}

export function ProfileEditorForm() {
  const router = useRouter();
  const {user} = useAuth();
  const {profile, loading, error, updateProfile, refreshProfile} = useProfile();

  const defaults = getProfileDefaults(profile);
  const [displayName, setDisplayName] = useState(defaults.displayName);
  const [photo, setPhoto] = useState(defaults.photo);
  const [bio, setBio] = useState(defaults.bio);
  const [twitterUrl, setTwitterUrl] = useState(defaults.twitterUrl);
  const [instagramUrl, setInstagramUrl] = useState(defaults.instagramUrl);
  const [facebookUrl, setFacebookUrl] = useState(defaults.facebookUrl);
  const [youtubeUrl, setYoutubeUrl] = useState(defaults.youtubeUrl);
  const [tiktokUrl, setTiktokUrl] = useState(defaults.tiktokUrl);
  const [websiteUrl, setWebsiteUrl] = useState(defaults.websiteUrl);
  const [qrOverlayPosition, setQrOverlayPosition] = useState<QrOverlayPosition>(
    defaults.qrOverlayPosition ?? DEFAULT_QR_OVERLAY_POSITION,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Photo upload state
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refresh on mount so we always get a fresh presigned photo URL
  useEffect(() => {
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      // Only store the photo if it's a usable URL; bare S3 keys are not displayable
      setPhoto(isDisplayableUrl(profile.photo) ? (profile.photo ?? "") : "");
      setBio(profile.bio ?? "");
      setTwitterUrl(profile.twitter_url ?? "");
      setInstagramUrl(profile.instagram_url ?? "");
      setFacebookUrl(profile.facebook_url ?? "");
      setYoutubeUrl(profile.youtube_url ?? "");
      setTiktokUrl(profile.tiktok_url ?? "");
      setWebsiteUrl(profile.website_url ?? "");
      setQrOverlayPosition(parseQrOverlayPosition(profile.qr_overlay_position));
    }
  }, [profile]);

  // Clean up local object URLs on unmount
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoUploadError(null);

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setPhotoUploadError("Unsupported file type. Use JPEG, PNG, WebP, or GIF.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoUploadError("Image must be 50 KB or smaller.");
      return;
    }

    // Show local preview immediately
    const preview = URL.createObjectURL(file);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(preview);

    setIsUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/profile/photo", {method: "POST", body: fd});
      const json = await res.json();

      if (!res.ok || !json.success) {
        setPhotoUploadError(json.error ?? "Upload failed");
        setLocalPreview(null);
        return;
      }

      // Refresh profile to get the presigned URL back from the API
      await refreshProfile();
      // Clear local preview so the component switches to profile.photo (presigned URL)
      setLocalPreview(null);
    } catch {
      setPhotoUploadError("Upload failed. Please try again.");
      setLocalPreview(null);
    } finally {
      setIsUploadingPhoto(false);
      // Reset file input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoUploadError(null);
    setLocalPreview(null);
    setIsUploadingPhoto(true);
    try {
      const res = await fetch("/api/profile/photo", {method: "DELETE"});
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPhotoUploadError(json.error ?? "Failed to remove photo");
        return;
      }
      setPhoto("");
      await refreshProfile();
    } catch {
      setPhotoUploadError("Failed to remove photo. Please try again.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Guard: only show photo if it's a proper URL (not a bare S3 key)
  const rawPhoto = localPreview ?? photo;
  const displayedPhoto = isDisplayableUrl(rawPhoto) ? rawPhoto : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedDisplayName = displayName.trim();
    if (trimmedDisplayName.length < DISPLAY_NAME_MIN) {
      setFormError("Display name must be at least 2 characters");
      return;
    }
    if (trimmedDisplayName.length > DISPLAY_NAME_MAX) {
      setFormError("Display name cannot exceed 100 characters");
      return;
    }
    if (bio.length > BIO_MAX) {
      setFormError("Bio cannot exceed 500 characters");
      return;
    }

    const urlFields = [
      {value: twitterUrl.trim(), name: "Twitter URL"},
      {value: instagramUrl.trim(), name: "Instagram URL"},
      {value: facebookUrl.trim(), name: "Facebook URL"},
      {value: youtubeUrl.trim(), name: "YouTube URL"},
      {value: tiktokUrl.trim(), name: "TikTok URL"},
      {value: websiteUrl.trim(), name: "Website URL"},
    ];
    for (const {value, name} of urlFields) {
      if (value && !isValidUrl(value)) {
        setFormError(`${name} must be a valid URL`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await updateProfile({
        display_name: trimmedDisplayName,
        bio: bio.trim() || null,
        twitter_url: twitterUrl.trim() || null,
        instagram_url: instagramUrl.trim() || null,
        facebook_url: facebookUrl.trim() || null,
        youtube_url: youtubeUrl.trim() || null,
        tiktok_url: tiktokUrl.trim() || null,
        website_url: websiteUrl.trim() || null,
        qr_overlay_position: qrOverlayPosition,
      });
      router.push("/dashboard/profile");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Edit profile</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Update your profile details and links</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/profile">Cancel</Link>
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={user?.email ?? ""} disabled aria-readonly="true" />
          <p className="text-xs text-muted-foreground">Email cannot be changed</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            required
            minLength={DISPLAY_NAME_MIN}
            maxLength={DISPLAY_NAME_MAX}
            disabled={isSubmitting}
            aria-invalid={!!formError}
          />
        </div>

        {/* Photo upload */}
        <div className="space-y-2">
          <Label>Profile photo</Label>
          <div className="flex items-center gap-4">
            {/* Avatar preview */}
            <div className="relative w-20 h-20 rounded-full border-2 border-border overflow-hidden bg-muted flex items-center justify-center shrink-0">
              {displayedPhoto ? (
                <Image
                  src={displayedPhoto}
                  alt="Profile photo"
                  fill
                  className="object-cover"
                  unoptimized={displayedPhoto.startsWith("blob:") || displayedPhoto.includes("wasabisys.com") || displayedPhoto.includes("X-Amz-")}
                />
              ) : (
                <User className="w-8 h-8 text-muted-foreground" />
              )}
              {isUploadingPhoto && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <LoadingSpinner size="sm" />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handlePhotoFileChange}
                disabled={isUploadingPhoto || isSubmitting}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploadingPhoto || isSubmitting}
                onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {displayedPhoto ? "Change photo" : "Upload photo"}
              </Button>
              {displayedPhoto && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isUploadingPhoto || isSubmitting}
                  onClick={handleRemovePhoto}
                  className="text-destructive hover:text-destructive">
                  <X className="w-4 h-4 mr-2" />
                  Remove photo
                </Button>
              )}
              <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF · max 50 KB</p>
            </div>
          </div>
          {photoUploadError && <p className="text-sm text-destructive">{photoUploadError}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <textarea
            id="bio"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short bio about you"
            maxLength={BIO_MAX}
            disabled={isSubmitting}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {bio.length}/{BIO_MAX} characters
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <QrOverlayPositionPicker
            value={qrOverlayPosition}
            onChange={setQrOverlayPosition}
            disabled={isSubmitting}
            idPrefix="profile-qr-overlay"
          />
        </div>

        <div className="border-t border-border pt-4 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Social & links</h2>
          <div className="grid gap-4 sm:grid-cols-1">
            <div className="space-y-2">
              <Label htmlFor="twitter_url">Twitter / X URL</Label>
              <Input
                id="twitter_url"
                type="url"
                value={twitterUrl}
                onChange={(e) => setTwitterUrl(e.target.value)}
                placeholder="https://twitter.com/username"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram_url">Instagram URL</Label>
              <Input
                id="instagram_url"
                type="url"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                placeholder="https://instagram.com/username"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facebook_url">Facebook URL</Label>
              <Input
                id="facebook_url"
                type="url"
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                placeholder="https://facebook.com/username"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="youtube_url">YouTube URL</Label>
              <Input
                id="youtube_url"
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/@channel"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiktok_url">TikTok URL</Label>
              <Input
                id="tiktok_url"
                type="url"
                value={tiktokUrl}
                onChange={(e) => setTiktokUrl(e.target.value)}
                placeholder="https://tiktok.com/@username"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website_url">Website URL</Label>
              <Input
                id="website_url"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        {error && !formError && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting || loading || isUploadingPhoto}>
            {isSubmitting ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/profile">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

/** Returns true only for URLs that can safely be passed to <Image src>. */
function isDisplayableUrl(s: string | null | undefined): boolean {
  if (!s) return false;
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("blob:") || s.startsWith("/");
}
