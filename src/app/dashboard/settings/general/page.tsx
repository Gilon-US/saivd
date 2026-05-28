"use client";

import {useCallback, useEffect, useState, type Dispatch, type SetStateAction} from "react";
import {useProfile} from "@/contexts/ProfileContext";
import {useAuth} from "@/contexts/AuthContext";
import {isSuperuserProfile} from "@/lib/app-role";
import {ALL_VIDEO_TYPES, ALL_IMAGE_TYPES} from "@/lib/app-settings";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {LoadingSpinner} from "@/components/ui/loading-spinner";

interface SettingRow {
  key: string;
  label: string;
  description: string;
  type: "integer" | "csv";
  value: string | null;
  updated_at: string | null;
}

export default function SettingsGeneralPage() {
  const {user} = useAuth();
  const {profile, loading: profileLoading, initialized} = useProfile();
  const isSuperuser = isSuperuserProfile(profile, user?.email);

  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [maxSizeMb, setMaxSizeMb] = useState<string>("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [maxImageSizeMb, setMaxImageSizeMb] = useState<string>("");
  const [selectedImageTypes, setSelectedImageTypes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingVideo, setSavingVideo] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveVideoError, setSaveVideoError] = useState<string | null>(null);
  const [saveImageError, setSaveImageError] = useState<string | null>(null);
  const [savedVideo, setSavedVideo] = useState(false);
  const [savedImage, setSavedImage] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/settings");
      const json = await res.json();
      if (!res.ok || !json.success) {
        setLoadError(typeof json.error === "string" ? json.error : json.error?.message ?? "Failed to load settings");
        return;
      }
      const rows: SettingRow[] = json.data;
      setSettings(rows);

      const sizeSetting = rows.find((r) => r.key === "max_video_size_mb");
      setMaxSizeMb(sizeSetting?.value ?? "500");

      const typesSetting = rows.find((r) => r.key === "allowed_video_types");
      const types = (typesSetting?.value ?? "video/mp4,video/quicktime,video/x-msvideo,video/webm")
        .split(",").map((t) => t.trim()).filter(Boolean);
      setSelectedTypes(new Set(types));

      const imageSizeSetting = rows.find((r) => r.key === "max_image_size_mb");
      setMaxImageSizeMb(imageSizeSetting?.value ?? "10");

      const imageTypesSetting = rows.find((r) => r.key === "allowed_image_types");
      const imageTypes = (imageTypesSetting?.value ?? "image/jpeg,image/png,image/webp,image/gif")
        .split(",").map((t) => t.trim()).filter(Boolean);
      setSelectedImageTypes(new Set(imageTypes));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialized || profileLoading) return;
    if (isSuperuser) void load();
    else setLoading(false);
  }, [initialized, profileLoading, isSuperuser, load]);

  const makeToggle = (setter: Dispatch<SetStateAction<Set<string>>>) => (mime: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(mime)) {
        if (next.size === 1) return prev; // must keep at least one
        next.delete(mime);
      } else {
        next.add(mime);
      }
      return next;
    });
  };

  const toggleType = makeToggle(setSelectedTypes);
  const toggleImageType = makeToggle(setSelectedImageTypes);

  const handleSaveVideo = async () => {
    setSavingVideo(true);
    setSaveVideoError(null);
    setSavedVideo(false);

    if (!maxSizeMb || parseInt(maxSizeMb, 10) <= 0) {
      setSaveVideoError("Max video size must be a positive number.");
      setSavingVideo(false);
      return;
    }
    if (selectedTypes.size === 0) {
      setSaveVideoError("At least one video type must be selected.");
      setSavingVideo(false);
      return;
    }

    try {
      const updates = [
        {key: "max_video_size_mb", value: maxSizeMb},
        {key: "allowed_video_types", value: Array.from(selectedTypes).join(",")},
      ];
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveVideoError(json.error?.message ?? json.error ?? "Failed to save");
        return;
      }
      setSavedVideo(true);
      await load();
      setTimeout(() => setSavedVideo(false), 3000);
    } catch (e) {
      setSaveVideoError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingVideo(false);
    }
  };

  const handleSaveImage = async () => {
    setSavingImage(true);
    setSaveImageError(null);
    setSavedImage(false);

    if (!maxImageSizeMb || parseInt(maxImageSizeMb, 10) <= 0) {
      setSaveImageError("Max image size must be a positive number.");
      setSavingImage(false);
      return;
    }
    if (selectedImageTypes.size === 0) {
      setSaveImageError("At least one image type must be selected.");
      setSavingImage(false);
      return;
    }

    try {
      const updates = [
        {key: "max_image_size_mb", value: maxImageSizeMb},
        {key: "allowed_image_types", value: Array.from(selectedImageTypes).join(",")},
      ];
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveImageError(json.error?.message ?? json.error ?? "Failed to save");
        return;
      }
      setSavedImage(true);
      await load();
      setTimeout(() => setSavedImage(false), 3000);
    } catch (e) {
      setSaveImageError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingImage(false);
    }
  };

  const typesUpdatedAt = settings.find((r) => r.key === "allowed_video_types")?.updated_at;
  const sizeUpdatedAt = settings.find((r) => r.key === "max_video_size_mb")?.updated_at;
  const imageTypesUpdatedAt = settings.find((r) => r.key === "allowed_image_types")?.updated_at;
  const imageSizeUpdatedAt = settings.find((r) => r.key === "max_image_size_mb")?.updated_at;

  if (!initialized || profileLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isSuperuser) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-300">Only superusers can manage application settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-semibold mb-1">General</h2>
        <p className="text-gray-600 dark:text-gray-300 text-sm">
          Application-wide configuration. Changes take effect immediately on the next request.
        </p>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upload limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Max file size */}
          <div className="space-y-1">
            <Label htmlFor="max_video_size_mb">Max video upload size</Label>
            <div className="flex items-center gap-3">
              <Input
                id="max_video_size_mb"
                type="number"
                min={1}
                value={maxSizeMb}
                onChange={(e) => setMaxSizeMb(e.target.value)}
                className="w-36"
                disabled={savingVideo || savingImage}
              />
              <span className="text-sm text-gray-500">MB</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Maximum file size allowed for a single video upload, in megabytes.
            </p>
            {sizeUpdatedAt && (
              <p className="text-xs text-gray-400">Last updated: {new Date(sizeUpdatedAt).toLocaleString()}</p>
            )}
          </div>

          {/* Allowed video types */}
          <div className="space-y-2">
            <Label>Allowed video types</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              File formats accepted for upload. At least one must remain selected.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {ALL_VIDEO_TYPES.map(({mime, label, ext}) => {
                const checked = selectedTypes.has(mime);
                const isLast = checked && selectedTypes.size === 1;
                return (
                  <label
                    key={mime}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer select-none transition-colors ${
                      checked
                        ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    } ${savingVideo || savingImage || isLast ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={savingVideo || savingImage || isLast}
                      onChange={() => toggleType(mime)}
                    />
                    <span className="font-semibold w-10 shrink-0">{label}</span>
                    <span className="text-xs opacity-70">{ext}</span>
                  </label>
                );
              })}
            </div>
            {typesUpdatedAt && (
              <p className="text-xs text-gray-400">Last updated: {new Date(typesUpdatedAt).toLocaleString()}</p>
            )}
          </div>

          {saveVideoError && (
            <Alert variant="destructive">
              <AlertDescription>{saveVideoError}</AlertDescription>
            </Alert>
          )}
          {savedVideo && (
            <Alert>
              <AlertDescription>Video settings saved successfully.</AlertDescription>
            </Alert>
          )}

          <Button onClick={handleSaveVideo} disabled={savingVideo || savingImage}>
            {savingVideo ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Image upload limits */}
      <Card>
        <CardHeader>
          <CardTitle>Image upload limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Max image file size */}
          <div className="space-y-1">
            <Label htmlFor="max_image_size_mb">Max image upload size</Label>
            <div className="flex items-center gap-3">
              <Input
                id="max_image_size_mb"
                type="number"
                min={1}
                value={maxImageSizeMb}
                onChange={(e) => setMaxImageSizeMb(e.target.value)}
                className="w-36"
                disabled={savingVideo || savingImage}
              />
              <span className="text-sm text-gray-500">MB</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Maximum file size allowed for a single image upload, in megabytes.
            </p>
            {imageSizeUpdatedAt && (
              <p className="text-xs text-gray-400">Last updated: {new Date(imageSizeUpdatedAt).toLocaleString()}</p>
            )}
          </div>

          {/* Allowed image types */}
          <div className="space-y-2">
            <Label>Allowed image types</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Image formats accepted for upload. At least one must remain selected.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {ALL_IMAGE_TYPES.map(({mime, label, ext}) => {
                const checked = selectedImageTypes.has(mime);
                const isLast = checked && selectedImageTypes.size === 1;
                return (
                  <label
                    key={mime}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer select-none transition-colors ${
                      checked
                        ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    } ${savingVideo || savingImage || isLast ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={savingVideo || savingImage || isLast}
                      onChange={() => toggleImageType(mime)}
                    />
                    <span className="font-semibold w-10 shrink-0">{label}</span>
                    <span className="text-xs opacity-70">{ext}</span>
                  </label>
                );
              })}
            </div>
            {imageTypesUpdatedAt && (
              <p className="text-xs text-gray-400">Last updated: {new Date(imageTypesUpdatedAt).toLocaleString()}</p>
            )}
          </div>

          {saveImageError && (
            <Alert variant="destructive">
              <AlertDescription>{saveImageError}</AlertDescription>
            </Alert>
          )}
          {savedImage && (
            <Alert>
              <AlertDescription>Image settings saved successfully.</AlertDescription>
            </Alert>
          )}

          <Button onClick={handleSaveImage} disabled={savingVideo || savingImage}>
            {savingImage ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}
