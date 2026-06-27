"use client";

import {useCallback, useEffect, useState, type Dispatch, type SetStateAction} from "react";
import {useProfile} from "@/contexts/ProfileContext";
import {useAuth} from "@/contexts/AuthContext";
import {isSuperuserProfile} from "@/lib/app-role";
import {ALL_VIDEO_TYPES, ALL_IMAGE_TYPES, getSettingDefault, IMAGE_COLOR_STANDARDIZE_MODES, type SettingType} from "@/lib/app-settings";
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
  type: SettingType;
  value: string | null;
  updated_at: string | null;
}

const UNAUTHENTICATED_MEDIA_KEYS = [
  "unauthenticated_media_headline",
  "unauthenticated_media_subhead",
  "unauthenticated_media_body",
  "unauthenticated_media_cta_label",
  "unauthenticated_media_cta_url",
  "unauthenticated_media_tagline",
] as const;

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
  const [unauthenticatedCopy, setUnauthenticatedCopy] = useState({
    headline: "",
    subhead: "",
    body: "",
    ctaLabel: "",
    ctaUrl: "",
    tagline: "",
  });
  const [savingUnauthenticated, setSavingUnauthenticated] = useState(false);
  const [saveUnauthenticatedError, setSaveUnauthenticatedError] = useState<string | null>(null);
  const [savedUnauthenticated, setSavedUnauthenticated] = useState(false);
  const [imageColorStandardize, setImageColorStandardize] = useState("vivid");
  const [imageChromaBoost, setImageChromaBoost] = useState("1.20");
  const [imageBrightness, setImageBrightness] = useState("1.06");
  const [imageWarmth, setImageWarmth] = useState("1.04");
  const [displayBrightness, setDisplayBrightness] = useState("1.0");
  const [displayContrast, setDisplayContrast] = useState("1.0");
  const [displaySaturation, setDisplaySaturation] = useState("1.0");
  const [displayWarmth, setDisplayWarmth] = useState("0");
  const [savingImageConversion, setSavingImageConversion] = useState(false);
  const [savingImageDisplay, setSavingImageDisplay] = useState(false);
  const [saveImageConversionError, setSaveImageConversionError] = useState<string | null>(null);
  const [saveImageDisplayError, setSaveImageDisplayError] = useState<string | null>(null);
  const [savedImageConversion, setSavedImageConversion] = useState(false);
  const [savedImageDisplay, setSavedImageDisplay] = useState(false);

  const notifyImagePreferencesChanged = () => {
    window.dispatchEvent(new Event("saivd:image-preferences-changed"));
  };

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

      setUnauthenticatedCopy({
        headline: rows.find((r) => r.key === "unauthenticated_media_headline")?.value
          ?? getSettingDefault("unauthenticated_media_headline"),
        subhead: rows.find((r) => r.key === "unauthenticated_media_subhead")?.value
          ?? getSettingDefault("unauthenticated_media_subhead"),
        body: rows.find((r) => r.key === "unauthenticated_media_body")?.value
          ?? getSettingDefault("unauthenticated_media_body"),
        ctaLabel: rows.find((r) => r.key === "unauthenticated_media_cta_label")?.value
          ?? getSettingDefault("unauthenticated_media_cta_label"),
        ctaUrl: rows.find((r) => r.key === "unauthenticated_media_cta_url")?.value
          ?? getSettingDefault("unauthenticated_media_cta_url"),
        tagline: rows.find((r) => r.key === "unauthenticated_media_tagline")?.value
          ?? getSettingDefault("unauthenticated_media_tagline"),
      });

      setImageColorStandardize(
        rows.find((r) => r.key === "image_color_standardize")?.value
          ?? getSettingDefault("image_color_standardize"),
      );
      setImageChromaBoost(
        rows.find((r) => r.key === "image_color_chroma_boost")?.value
          ?? getSettingDefault("image_color_chroma_boost"),
      );
      setImageBrightness(
        rows.find((r) => r.key === "image_color_brightness")?.value
          ?? getSettingDefault("image_color_brightness"),
      );
      setImageWarmth(
        rows.find((r) => r.key === "image_color_warmth")?.value
          ?? getSettingDefault("image_color_warmth"),
      );
      setDisplayBrightness(
        rows.find((r) => r.key === "image_display_brightness")?.value
          ?? getSettingDefault("image_display_brightness"),
      );
      setDisplayContrast(
        rows.find((r) => r.key === "image_display_contrast")?.value
          ?? getSettingDefault("image_display_contrast"),
      );
      setDisplaySaturation(
        rows.find((r) => r.key === "image_display_saturation")?.value
          ?? getSettingDefault("image_display_saturation"),
      );
      setDisplayWarmth(
        rows.find((r) => r.key === "image_display_warmth")?.value
          ?? getSettingDefault("image_display_warmth"),
      );
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

  const handleSaveUnauthenticated = async () => {
    setSavingUnauthenticated(true);
    setSaveUnauthenticatedError(null);
    setSavedUnauthenticated(false);

    const trimmed = {
      headline: unauthenticatedCopy.headline.trim(),
      subhead: unauthenticatedCopy.subhead.trim(),
      body: unauthenticatedCopy.body.trim(),
      ctaLabel: unauthenticatedCopy.ctaLabel.trim(),
      ctaUrl: unauthenticatedCopy.ctaUrl.trim(),
      tagline: unauthenticatedCopy.tagline.trim(),
    };

    if (!trimmed.headline || !trimmed.subhead || !trimmed.body || !trimmed.ctaLabel || !trimmed.ctaUrl) {
      setSaveUnauthenticatedError("Headline, subhead, body, button label, and button URL are required.");
      setSavingUnauthenticated(false);
      return;
    }
    if (!/^https:\/\/.+/i.test(trimmed.ctaUrl)) {
      setSaveUnauthenticatedError("Button URL must start with https://");
      setSavingUnauthenticated(false);
      return;
    }

    try {
      const updates = [
        {key: "unauthenticated_media_headline", value: trimmed.headline},
        {key: "unauthenticated_media_subhead", value: trimmed.subhead},
        {key: "unauthenticated_media_body", value: trimmed.body},
        {key: "unauthenticated_media_cta_label", value: trimmed.ctaLabel},
        {key: "unauthenticated_media_cta_url", value: trimmed.ctaUrl},
        {key: "unauthenticated_media_tagline", value: trimmed.tagline},
      ];
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveUnauthenticatedError(json.error?.message ?? json.error ?? "Failed to save");
        return;
      }
      setSavedUnauthenticated(true);
      await load();
      setTimeout(() => setSavedUnauthenticated(false), 3000);
    } catch (e) {
      setSaveUnauthenticatedError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingUnauthenticated(false);
    }
  };

  const handleSaveImageConversion = async () => {
    setSavingImageConversion(true);
    setSaveImageConversionError(null);
    setSavedImageConversion(false);
    try {
      const updates = [
        {key: "image_color_standardize", value: imageColorStandardize.trim()},
        {key: "image_color_chroma_boost", value: imageChromaBoost.trim()},
        {key: "image_color_brightness", value: imageBrightness.trim()},
        {key: "image_color_warmth", value: imageWarmth.trim()},
      ];
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveImageConversionError(json.error?.message ?? json.error ?? "Failed to save");
        return;
      }
      setSavedImageConversion(true);
      notifyImagePreferencesChanged();
      await load();
      setTimeout(() => setSavedImageConversion(false), 3000);
    } catch (e) {
      setSaveImageConversionError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingImageConversion(false);
    }
  };

  const handleSaveImageDisplay = async () => {
    setSavingImageDisplay(true);
    setSaveImageDisplayError(null);
    setSavedImageDisplay(false);
    try {
      const updates = [
        {key: "image_display_brightness", value: displayBrightness.trim()},
        {key: "image_display_contrast", value: displayContrast.trim()},
        {key: "image_display_saturation", value: displaySaturation.trim()},
        {key: "image_display_warmth", value: displayWarmth.trim()},
      ];
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveImageDisplayError(json.error?.message ?? json.error ?? "Failed to save");
        return;
      }
      setSavedImageDisplay(true);
      notifyImagePreferencesChanged();
      await load();
      setTimeout(() => setSavedImageDisplay(false), 3000);
    } catch (e) {
      setSaveImageDisplayError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingImageDisplay(false);
    }
  };

  const typesUpdatedAt = settings.find((r) => r.key === "allowed_video_types")?.updated_at;
  const sizeUpdatedAt = settings.find((r) => r.key === "max_video_size_mb")?.updated_at;
  const imageTypesUpdatedAt = settings.find((r) => r.key === "allowed_image_types")?.updated_at;
  const imageSizeUpdatedAt = settings.find((r) => r.key === "max_image_size_mb")?.updated_at;
  const unauthenticatedUpdatedAt = UNAUTHENTICATED_MEDIA_KEYS.map((key) =>
    settings.find((r) => r.key === key)?.updated_at,
  )
    .filter(Boolean)
    .sort()
    .pop();
  const imageConversionUpdatedAt = [
    "image_color_standardize",
    "image_color_chroma_boost",
    "image_color_brightness",
    "image_color_warmth",
  ]
    .map((key) => settings.find((r) => r.key === key)?.updated_at)
    .filter(Boolean)
    .sort()
    .pop();
  const imageDisplayUpdatedAt = [
    "image_display_brightness",
    "image_display_contrast",
    "image_display_saturation",
    "image_display_warmth",
  ]
    .map((key) => settings.find((r) => r.key === key)?.updated_at)
    .filter(Boolean)
    .sort()
    .pop();

  const settingsBusy =
    savingVideo || savingImage || savingUnauthenticated || savingImageConversion || savingImageDisplay;

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
                disabled={savingVideo || savingImage || savingUnauthenticated}
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
                    } ${savingVideo || savingImage || savingUnauthenticated || isLast ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={savingVideo || savingImage || savingUnauthenticated || isLast}
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

          <Button onClick={handleSaveVideo} disabled={savingVideo || savingImage || savingUnauthenticated}>
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
                disabled={savingVideo || savingImage || savingUnauthenticated}
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
                    } ${savingVideo || savingImage || savingUnauthenticated || isLast ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={savingVideo || savingImage || savingUnauthenticated || isLast}
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

          <Button onClick={handleSaveImage} disabled={savingVideo || savingImage || savingUnauthenticated}>
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

      <Card>
        <CardHeader>
          <CardTitle>Image pre-watermark conversion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Controls the real pixel pipeline before watermark embed. Affects new uploads, re-watermarks, and the
            Original (sRGB) preview. Existing watermarked files must be re-watermarked to pick up changes.
          </p>

          <div className="space-y-1">
            <Label htmlFor="image_color_standardize">Color mode</Label>
            <select
              id="image_color_standardize"
              value={imageColorStandardize}
              onChange={(e) => setImageColorStandardize(e.target.value)}
              disabled={settingsBusy}
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs">
              {IMAGE_COLOR_STANDARDIZE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ICC→sRGB strategy. <span className="font-medium">vivid</span> is recommended for iPhone / Display P3 photos.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="image_color_chroma_boost">Chroma boost</Label>
              <Input
                id="image_color_chroma_boost"
                type="number"
                step="0.01"
                min={1}
                max={1.25}
                value={imageChromaBoost}
                onChange={(e) => setImageChromaBoost(e.target.value)}
                disabled={settingsBusy}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">1.0–1.25 (ICC sources, vivid mode)</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="image_color_brightness">Brightness</Label>
              <Input
                id="image_color_brightness"
                type="number"
                step="0.01"
                min={0.85}
                max={1.2}
                value={imageBrightness}
                onChange={(e) => setImageBrightness(e.target.value)}
                disabled={settingsBusy}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">0.85–1.20 (1.0 = neutral)</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="image_color_warmth">Warmth</Label>
              <Input
                id="image_color_warmth"
                type="number"
                step="0.01"
                min={1}
                max={1.15}
                value={imageWarmth}
                onChange={(e) => setImageWarmth(e.target.value)}
                disabled={settingsBusy}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">1.0–1.15 (1.0 = neutral)</p>
            </div>
          </div>

          {imageConversionUpdatedAt && (
            <p className="text-xs text-gray-400">Last updated: {new Date(imageConversionUpdatedAt).toLocaleString()}</p>
          )}
          {saveImageConversionError && (
            <Alert variant="destructive">
              <AlertDescription>{saveImageConversionError}</AlertDescription>
            </Alert>
          )}
          {savedImageConversion && (
            <Alert>
              <AlertDescription>Image conversion settings saved. Re-watermark images to update stored files.</AlertDescription>
            </Alert>
          )}
          <Button onClick={handleSaveImageConversion} disabled={settingsBusy}>
            {savingImageConversion ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Saving…
              </>
            ) : (
              "Save conversion settings"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Image dashboard display</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            CSS preview tuning on My Images only. Does not change stored files or downloads.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="image_display_brightness">Brightness</Label>
              <Input
                id="image_display_brightness"
                type="number"
                step="0.01"
                min={0.8}
                max={1.3}
                value={displayBrightness}
                onChange={(e) => setDisplayBrightness(e.target.value)}
                disabled={settingsBusy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="image_display_contrast">Contrast</Label>
              <Input
                id="image_display_contrast"
                type="number"
                step="0.01"
                min={0.8}
                max={1.3}
                value={displayContrast}
                onChange={(e) => setDisplayContrast(e.target.value)}
                disabled={settingsBusy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="image_display_saturation">Saturation</Label>
              <Input
                id="image_display_saturation"
                type="number"
                step="0.01"
                min={0.8}
                max={1.5}
                value={displaySaturation}
                onChange={(e) => setDisplaySaturation(e.target.value)}
                disabled={settingsBusy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="image_display_warmth">Warmth (sepia %)</Label>
              <Input
                id="image_display_warmth"
                type="number"
                step={1}
                min={0}
                max={40}
                value={displayWarmth}
                onChange={(e) => setDisplayWarmth(e.target.value)}
                disabled={settingsBusy}
              />
            </div>
          </div>

          {imageDisplayUpdatedAt && (
            <p className="text-xs text-gray-400">Last updated: {new Date(imageDisplayUpdatedAt).toLocaleString()}</p>
          )}
          {saveImageDisplayError && (
            <Alert variant="destructive">
              <AlertDescription>{saveImageDisplayError}</AlertDescription>
            </Alert>
          )}
          {savedImageDisplay && (
            <Alert>
              <AlertDescription>Display settings saved. Refresh My Images to preview.</AlertDescription>
            </Alert>
          )}
          <Button onClick={handleSaveImageDisplay} disabled={settingsBusy}>
            {savingImageDisplay ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Saving…
              </>
            ) : (
              "Save display settings"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unauthenticated media page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Copy shown when a presentation QR scan fails (expired, invalid, or unverified). Changes apply on the
            next visit to <code className="text-xs">/presentation/expired</code>.
          </p>

          <div className="space-y-1">
            <Label htmlFor="unauthenticated_media_headline">Headline</Label>
            <Input
              id="unauthenticated_media_headline"
              value={unauthenticatedCopy.headline}
              onChange={(e) => setUnauthenticatedCopy((prev) => ({...prev, headline: e.target.value}))}
              disabled={savingUnauthenticated || savingVideo || savingImage}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="unauthenticated_media_subhead">Subhead</Label>
            <Input
              id="unauthenticated_media_subhead"
              value={unauthenticatedCopy.subhead}
              onChange={(e) => setUnauthenticatedCopy((prev) => ({...prev, subhead: e.target.value}))}
              disabled={savingUnauthenticated || savingVideo || savingImage}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="unauthenticated_media_body">Body</Label>
            <textarea
              id="unauthenticated_media_body"
              rows={5}
              value={unauthenticatedCopy.body}
              onChange={(e) => setUnauthenticatedCopy((prev) => ({...prev, body: e.target.value}))}
              disabled={savingUnauthenticated || savingVideo || savingImage}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="unauthenticated_media_cta_label">Button label</Label>
            <Input
              id="unauthenticated_media_cta_label"
              value={unauthenticatedCopy.ctaLabel}
              onChange={(e) => setUnauthenticatedCopy((prev) => ({...prev, ctaLabel: e.target.value}))}
              disabled={savingUnauthenticated || savingVideo || savingImage}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="unauthenticated_media_cta_url">Button URL</Label>
            <Input
              id="unauthenticated_media_cta_url"
              type="url"
              value={unauthenticatedCopy.ctaUrl}
              onChange={(e) => setUnauthenticatedCopy((prev) => ({...prev, ctaUrl: e.target.value}))}
              disabled={savingUnauthenticated || savingVideo || savingImage}
              placeholder="https://www.saivd.io/"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">Must be an https URL.</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="unauthenticated_media_tagline">Footer tagline (optional)</Label>
            <Input
              id="unauthenticated_media_tagline"
              value={unauthenticatedCopy.tagline}
              onChange={(e) => setUnauthenticatedCopy((prev) => ({...prev, tagline: e.target.value}))}
              disabled={savingUnauthenticated || savingVideo || savingImage}
              placeholder="Trace it. Trust it."
            />
          </div>

          {unauthenticatedUpdatedAt && (
            <p className="text-xs text-gray-400">Last updated: {new Date(unauthenticatedUpdatedAt).toLocaleString()}</p>
          )}

          {saveUnauthenticatedError && (
            <Alert variant="destructive">
              <AlertDescription>{saveUnauthenticatedError}</AlertDescription>
            </Alert>
          )}
          {savedUnauthenticated && (
            <Alert>
              <AlertDescription>Unauthenticated media page settings saved successfully.</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSaveUnauthenticated} disabled={savingUnauthenticated || savingVideo || savingImage}>
              {savingUnauthenticated ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
            <Button variant="outline" asChild>
              <a href="/presentation/expired" target="_blank" rel="noopener noreferrer">
                Preview page
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
