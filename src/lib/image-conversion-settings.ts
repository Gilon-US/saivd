import {getSetting} from "@/lib/app-settings";
import {
  buildConversionRevision,
  IMAGE_CONVERSION_KEYS,
  parseImageConversionSettings,
  type ImageConversionSettings,
} from "@/lib/image-color-settings";

/** Server-only: read pre-watermark conversion settings from app_settings. */
export async function getImageConversionSettings(): Promise<ImageConversionSettings> {
  const raw: Record<string, string> = {};
  for (const key of IMAGE_CONVERSION_KEYS) {
    raw[key] = await getSetting(key);
  }
  return parseImageConversionSettings(raw);
}

export async function getImageConversionRevision(): Promise<string> {
  const settings = await getImageConversionSettings();
  return buildConversionRevision(settings);
}
