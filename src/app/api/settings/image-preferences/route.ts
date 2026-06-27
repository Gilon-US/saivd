import {NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {getSetting} from "@/lib/app-settings";
import {
  buildConversionRevision,
  buildImageDisplayCssFilter,
  IMAGE_CONVERSION_KEYS,
  IMAGE_DISPLAY_KEYS,
  parseImageConversionSettings,
  parseImageDisplaySettings,
} from "@/lib/image-color-settings";

/**
 * GET /api/settings/image-preferences
 *
 * Authenticated read of app-wide image conversion + dashboard display tuning.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {success: false, error: {code: "unauthorized", message: "Authentication required"}},
        {status: 401},
      );
    }

    const raw: Record<string, string> = {};
    for (const key of [...IMAGE_CONVERSION_KEYS, ...IMAGE_DISPLAY_KEYS]) {
      raw[key] = await getSetting(key);
    }

    const conversion = parseImageConversionSettings(raw);
    const display = parseImageDisplaySettings(raw);

    return NextResponse.json({
      success: true,
      data: {
        conversion,
        display,
        displayFilter: buildImageDisplayCssFilter(display) ?? null,
        conversionRevision: buildConversionRevision(conversion),
      },
    });
  } catch (error) {
    console.error("[settings/image-preferences] GET error:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to load image preferences"}},
      {status: 500},
    );
  }
}
