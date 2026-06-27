import {getSettingDefault, IMAGE_COLOR_STANDARDIZE_MODES} from "@/lib/app-settings";

export type ImageConversionSettings = {
  colorStandardize: (typeof IMAGE_COLOR_STANDARDIZE_MODES)[number];
  chromaBoost: number;
  brightness: number;
  warmth: number;
};

export type ImageDisplaySettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
};

export type ImagePreferences = {
  conversion: ImageConversionSettings;
  display: ImageDisplaySettings;
  conversionRevision: string;
};

export const IMAGE_CONVERSION_KEYS = [
  "image_color_standardize",
  "image_color_chroma_boost",
  "image_color_brightness",
  "image_color_warmth",
] as const;

export const IMAGE_DISPLAY_KEYS = [
  "image_display_brightness",
  "image_display_contrast",
  "image_display_saturation",
  "image_display_warmth",
] as const;

function parseFloatInRange(raw: string | undefined, fallback: string, min: number, max: number): number {
  const n = parseFloat(raw ?? fallback);
  if (isNaN(n)) return parseFloat(fallback);
  return Math.min(max, Math.max(min, n));
}

export function parseImageConversionSettings(raw: Record<string, string | undefined>): ImageConversionSettings {
  const modeRaw = (raw.image_color_standardize ?? getSettingDefault("image_color_standardize")).trim().toLowerCase();
  const colorStandardize = IMAGE_COLOR_STANDARDIZE_MODES.includes(
    modeRaw as (typeof IMAGE_COLOR_STANDARDIZE_MODES)[number],
  )
    ? (modeRaw as (typeof IMAGE_COLOR_STANDARDIZE_MODES)[number])
    : "vivid";

  return {
    colorStandardize,
    chromaBoost: parseFloatInRange(raw.image_color_chroma_boost, getSettingDefault("image_color_chroma_boost"), 1.0, 1.25),
    brightness: parseFloatInRange(raw.image_color_brightness, getSettingDefault("image_color_brightness"), 0.85, 1.2),
    warmth: parseFloatInRange(raw.image_color_warmth, getSettingDefault("image_color_warmth"), 1.0, 1.15),
  };
}

export function parseImageDisplaySettings(raw: Record<string, string | undefined>): ImageDisplaySettings {
  return {
    brightness: parseFloatInRange(raw.image_display_brightness, getSettingDefault("image_display_brightness"), 0.8, 1.3),
    contrast: parseFloatInRange(raw.image_display_contrast, getSettingDefault("image_display_contrast"), 0.8, 1.3),
    saturation: parseFloatInRange(
      raw.image_display_saturation,
      getSettingDefault("image_display_saturation"),
      0.8,
      1.5,
    ),
    warmth: parseFloatInRange(raw.image_display_warmth, getSettingDefault("image_display_warmth"), 0, 40),
  };
}

/** Payload for manager ``color_params`` (snake_case). */
export function conversionSettingsToColorParams(settings: ImageConversionSettings) {
  return {
    color_standardize: settings.colorStandardize,
    chroma_boost: settings.chromaBoost,
    brightness: settings.brightness,
    warmth: settings.warmth,
  };
}

/** CSS ``filter`` for dashboard previews only. */
export function buildImageDisplayCssFilter(settings: ImageDisplaySettings): string | undefined {
  const parts: string[] = [];
  if (Math.abs(settings.brightness - 1) > 0.001) {
    parts.push(`brightness(${settings.brightness})`);
  }
  if (Math.abs(settings.contrast - 1) > 0.001) {
    parts.push(`contrast(${settings.contrast})`);
  }
  if (Math.abs(settings.saturation - 1) > 0.001) {
    parts.push(`saturate(${settings.saturation})`);
  }
  if (settings.warmth > 0.5) {
    parts.push(`sepia(${settings.warmth}%)`);
    parts.push("hue-rotate(-8deg)");
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function buildConversionRevision(settings: ImageConversionSettings): string {
  return [
    settings.colorStandardize,
    settings.chromaBoost.toFixed(3),
    settings.brightness.toFixed(3),
    settings.warmth.toFixed(3),
  ].join(":");
}
