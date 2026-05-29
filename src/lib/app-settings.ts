import {createServiceRoleClient} from "@/utils/supabase/service";

/** Hard-coded fallbacks used when the DB row is absent or unreadable. */
const DEFAULTS: Record<string, string> = {
  max_video_size_mb: "500",
  allowed_video_types: "video/mp4,video/quicktime,video/x-msvideo,video/webm",
  max_image_size_mb: "10",
  allowed_image_types: "image/jpeg,image/png,image/webp,image/gif",
  unauthenticated_media_headline: "Unauthenticated Media",
  unauthenticated_media_subhead: "This content could not be verified.",
  unauthenticated_media_body:
    "It may have been photographed, screen-recorded, edited, or shared without the creator's authorization. SAIVD verifies authenticity at the source — when that link is missing, we can't confirm who published it.",
  unauthenticated_media_cta_label: "Learn about SAIVD",
  unauthenticated_media_cta_url: "https://www.saivd.io/",
  unauthenticated_media_tagline: "Trace it. Trust it.",
};

export type SettingType = "integer" | "csv" | "text" | "textarea" | "url" | "optional_text";

export type SettingDef = {
  key: string;
  label: string;
  description: string;
  type: SettingType;
};

/** All video MIME types the platform can ever support (superset used for the checkbox list). */
export const ALL_VIDEO_TYPES: {mime: string; label: string; ext: string}[] = [
  {mime: "video/mp4",        label: "MP4",  ext: ".mp4"},
  {mime: "video/quicktime",  label: "MOV",  ext: ".mov"},
  {mime: "video/x-msvideo",  label: "AVI",  ext: ".avi"},
  {mime: "video/webm",       label: "WebM", ext: ".webm"},
  {mime: "video/x-matroska", label: "MKV",  ext: ".mkv"},
  {mime: "video/mpeg",       label: "MPEG", ext: ".mpg"},
];

/** All image MIME types the platform can ever support (superset used for the checkbox list). */
export const ALL_IMAGE_TYPES: {mime: string; label: string; ext: string}[] = [
  {mime: "image/jpeg", label: "JPEG", ext: ".jpg"},
  {mime: "image/png",  label: "PNG",  ext: ".png"},
  {mime: "image/webp", label: "WebP", ext: ".webp"},
  {mime: "image/gif",  label: "GIF",  ext: ".gif"},
  {mime: "image/heic", label: "HEIC", ext: ".heic"},
  {mime: "image/tiff", label: "TIFF", ext: ".tiff"},
];

/** All recognised setting keys and their human-readable labels. */
export const SETTING_DEFS: SettingDef[] = [
  {
    key: "max_video_size_mb",
    label: "Max video upload size (MB)",
    description: "Maximum file size allowed for a single video upload, in megabytes.",
    type: "integer",
  },
  {
    key: "allowed_video_types",
    label: "Allowed video types",
    description: "Video MIME types accepted for upload. At least one must be selected.",
    type: "csv",
  },
  {
    key: "max_image_size_mb",
    label: "Max image upload size (MB)",
    description: "Maximum file size allowed for a single image upload, in megabytes.",
    type: "integer",
  },
  {
    key: "allowed_image_types",
    label: "Allowed image types",
    description: "Image MIME types accepted for upload. At least one must be selected.",
    type: "csv",
  },
  {
    key: "unauthenticated_media_headline",
    label: "Headline",
    description: "Main title on the unauthenticated media page.",
    type: "text",
  },
  {
    key: "unauthenticated_media_subhead",
    label: "Subhead",
    description: "One-line summary below the headline.",
    type: "text",
  },
  {
    key: "unauthenticated_media_body",
    label: "Body",
    description: "Explanation shown when a presentation QR scan fails.",
    type: "textarea",
  },
  {
    key: "unauthenticated_media_cta_label",
    label: "Button label",
    description: "Label for the primary call-to-action button.",
    type: "text",
  },
  {
    key: "unauthenticated_media_cta_url",
    label: "Button URL",
    description: "Destination for the primary button (https URLs only).",
    type: "url",
  },
  {
    key: "unauthenticated_media_tagline",
    label: "Footer tagline",
    description: "Optional footer line; leave empty to hide.",
    type: "optional_text",
  },
];

const HTTPS_URL_PATTERN = /^https:\/\/.+/i;

/** Validate a setting value for PUT /api/admin/settings. Returns an error message or null. */
export function validateSettingValue(key: string, value: string): string | null {
  const def = SETTING_DEFS.find((d) => d.key === key);
  if (!def) return `Unknown setting key: ${key}`;

  const trimmed = value.trim();

  if (def.type === "optional_text") {
    return null;
  }

  if (trimmed === "") {
    return `Value for ${key} must be a non-empty string`;
  }

  if (def.type === "integer") {
    const n = parseInt(trimmed, 10);
    if (isNaN(n) || n <= 0) {
      return `${def.label} must be a positive integer`;
    }
  }

  if (def.type === "url" && !HTTPS_URL_PATTERN.test(trimmed)) {
    return `${def.label} must be a valid https URL`;
  }

  return null;
}

/** Read a single setting from the DB; falls back to DEFAULTS on any error. */
export async function getSetting(key: string): Promise<string> {
  try {
    const client = createServiceRoleClient();
    const {data} = await client.from("app_settings").select("value").eq("key", key).single();
    if (data?.value !== undefined && data.value !== null) return data.value;
  } catch {
    // fall through to default
  }
  return DEFAULTS[key] ?? "";
}

/** Convenience: returns max video size in bytes, falling back to 500 MB. */
export async function getMaxVideoSizeBytes(): Promise<number> {
  const raw = await getSetting("max_video_size_mb");
  const mb = parseInt(raw, 10);
  return (isNaN(mb) || mb <= 0 ? 500 : mb) * 1024 * 1024;
}

/** Convenience: returns max video size in MB as a number. */
export async function getMaxVideoSizeMb(): Promise<number> {
  const raw = await getSetting("max_video_size_mb");
  const mb = parseInt(raw, 10);
  return isNaN(mb) || mb <= 0 ? 500 : mb;
}

/** Convenience: returns the list of allowed video MIME types from settings. */
export async function getAllowedVideoTypes(): Promise<string[]> {
  const raw = await getSetting("allowed_video_types");
  const types = raw.split(",").map((t) => t.trim()).filter(Boolean);
  return types.length > 0 ? types : DEFAULTS.allowed_video_types.split(",");
}

/** Convenience: returns max image size in bytes, falling back to 10 MB. */
export async function getMaxImageSizeBytes(): Promise<number> {
  const raw = await getSetting("max_image_size_mb");
  const mb = parseInt(raw, 10);
  return (isNaN(mb) || mb <= 0 ? 10 : mb) * 1024 * 1024;
}

/** Convenience: returns max image size in MB as a number. */
export async function getMaxImageSizeMb(): Promise<number> {
  const raw = await getSetting("max_image_size_mb");
  const mb = parseInt(raw, 10);
  return isNaN(mb) || mb <= 0 ? 10 : mb;
}

/** Convenience: returns the list of allowed image MIME types from settings. */
export async function getAllowedImageTypes(): Promise<string[]> {
  const raw = await getSetting("allowed_image_types");
  const types = raw.split(",").map((t) => t.trim()).filter(Boolean);
  return types.length > 0 ? types : DEFAULTS.allowed_image_types.split(",");
}

/** Default value for a setting key (used when DB row is absent). */
export function getSettingDefault(key: string): string {
  return DEFAULTS[key] ?? "";
}
