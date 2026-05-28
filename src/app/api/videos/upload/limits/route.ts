import {NextResponse} from "next/server";
import {getMaxVideoSizeMb, getAllowedVideoTypes, ALL_VIDEO_TYPES} from "@/lib/app-settings";

/**
 * GET /api/videos/upload/limits
 *
 * Public endpoint (no auth required) that returns current upload constraints
 * so the client-side UI can show accurate limits and validate before uploading.
 */
export async function GET() {
  const [maxSizeMb, allowedTypes] = await Promise.all([getMaxVideoSizeMb(), getAllowedVideoTypes()]);
  // Enrich with labels for client display
  const allowedTypesDetail = allowedTypes.map((mime) => {
    const def = ALL_VIDEO_TYPES.find((t) => t.mime === mime);
    return {mime, label: def?.label ?? mime, ext: def?.ext ?? ""};
  });
  return NextResponse.json({
    success: true,
    data: {
      maxSizeMb,
      maxSizeBytes: maxSizeMb * 1024 * 1024,
      allowedTypes,
      allowedTypesDetail,
    },
  });
}
