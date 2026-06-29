import {createServiceRoleClient} from "@/utils/supabase/service";

/** Hard-coded fallbacks used when the DB row is absent or unreadable. */
const DEFAULTS: Record<string, string> = {
  max_video_size_mb: "500",
  allowed_video_types: "video/mp4,video/quicktime,video/x-msvideo,video/webm",
  max_image_size_mb: "10",
  max_image_batch_upload: "100",
  allowed_image_types: "image/jpeg,image/png,image/webp,image/gif",
  unauthenticated_media_headline: "Unauthenticated Media",
  unauthenticated_media_subhead: "This content could not be verified.",
  unauthenticated_media_body:
    "It may have been photographed, screen-recorded, edited, or shared without the creator's authorization. SAIVD verifies authenticity at the source — when that link is missing, we can't confirm who published it.",
  unauthenticated_media_cta_label: "Learn about SAIVD",
  unauthenticated_media_cta_url: "https://www.saivd.io/",
  unauthenticated_media_tagline: "Trace it. Trust it.",
  image_color_standardize: "vivid",
  image_color_chroma_boost: "1.20",
  image_color_brightness: "1.06",
  image_color_warmth: "1.04",
  image_display_brightness: "1.0",
  image_display_contrast: "1.0",
  image_display_saturation: "1.0",
  image_display_warmth: "0",
};

export const IMAGE_COLOR_STANDARDIZE_MODES = [
  "legacy",
  "relative",
  "v2",
  "saturation",
  "saturation_v2",
  "vivid",
] as const;

export type SettingType = "integer" | "float" | "csv" | "text" | "textarea" | "url" | "optional_text" | "select";

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
  {
    key: "image_color_standardize",
    label: "Color standardization mode",
    description:
      "ICC→sRGB pipeline before watermarking. Affects new watermarks and the Original (sRGB) preview. Re-watermark existing images after changes.",
    type: "select",
  },
  {
    key: "image_color_chroma_boost",
    label: "Chroma boost (wide-gamut sources)",
    description: "Saturation multiplier for ICC-tagged sources in vivid mode. Range 1.0–1.25.",
    type: "float",
  },
  {
    key: "image_color_brightness",
    label: "Pre-watermark brightness",
    description: "Lift shadows/exposure before embed. Range 0.85–1.20 (1.0 = neutral).",
    type: "float",
  },
  {
    key: "image_color_warmth",
    label: "Pre-watermark warmth",
    description: "Red/yellow bias after sRGB conversion. Range 1.0–1.15 (1.0 = neutral).",
    type: "float",
  },
  {
    key: "image_display_brightness",
    label: "Dashboard brightness",
    description: "CSS preview only — does not change stored files. Range 0.8–1.3 (1.0 = neutral).",
    type: "float",
  },
  {
    key: "image_display_contrast",
    label: "Dashboard contrast",
    description: "CSS preview only. Range 0.8–1.3 (1.0 = neutral).",
    type: "float",
  },
  {
    key: "image_display_saturation",
    label: "Dashboard saturation",
    description: "CSS preview only. Range 0.8–1.5 (1.0 = neutral).",
    type: "float",
  },
  {
    key: "image_display_warmth",
    label: "Dashboard warmth (sepia %)",
    description: "CSS preview only. 0 = off, 40 = strong warm tint.",
    type: "float",
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

  if (def.type === "float") {
    const n = parseFloat(trimmed);
    if (isNaN(n)) {
      return `${def.label} must be a number`;
    }
    if (key === "image_color_chroma_boost" && (n < 1.0 || n > 1.25)) {
      return "Chroma boost must be between 1.0 and 1.25";
    }
    if (key === "image_color_brightness" && (n < 0.85 || n > 1.2)) {
      return "Pre-watermark brightness must be between 0.85 and 1.20";
    }
    if (key === "image_color_warmth" && (n < 1.0 || n > 1.15)) {
      return "Pre-watermark warmth must be between 1.0 and 1.15";
    }
    if (key === "image_display_brightness" && (n < 0.8 || n > 1.3)) {
      return "Dashboard brightness must be between 0.8 and 1.3";
    }
    if (key === "image_display_contrast" && (n < 0.8 || n > 1.3)) {
      return "Dashboard contrast must be between 0.8 and 1.3";
    }
    if (key === "image_display_saturation" && (n < 0.8 || n > 1.5)) {
      return "Dashboard saturation must be between 0.8 and 1.5";
    }
    if (key === "image_display_warmth" && (n < 0 || n > 40)) {
      return "Dashboard warmth must be between 0 and 40";
    }
  }

  if (def.type === "select" && key === "image_color_standardize") {
    if (!IMAGE_COLOR_STANDARDIZE_MODES.includes(trimmed as (typeof IMAGE_COLOR_STANDARDIZE_MODES)[number])) {
      return `Color mode must be one of: ${IMAGE_COLOR_STANDARDIZE_MODES.join(", ")}`;
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

/** Max images allowed in a single batch upload (1–100). */
export async function getMaxImageBatchUpload(): Promise<number> {
  const raw = await getSetting("max_image_batch_upload");
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) return 100;
  return Math.min(100, n);
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
