import {NextResponse} from "next/server";
import {
  getMaxVideoSizeMb,
  getAllowedVideoTypes,
  getMaxImageSizeMb,
  getMaxImageBatchUpload,
  getAllowedImageTypes,
  ALL_VIDEO_TYPES,
  ALL_IMAGE_TYPES,
} from "@/lib/app-settings";

/**
 * GET /api/media/upload/limits
 * Returns upload constraints for both video and image flows.
 */
export async function GET() {
  const [maxVideoSizeMb, allowedVideoTypes, maxImageSizeMb, maxImageBatchUpload, allowedImageTypes] =
    await Promise.all([
      getMaxVideoSizeMb(),
      getAllowedVideoTypes(),
      getMaxImageSizeMb(),
      getMaxImageBatchUpload(),
      getAllowedImageTypes(),
    ]);

  const videoTypesDetail = allowedVideoTypes.map((mime) => {
    const def = ALL_VIDEO_TYPES.find((t) => t.mime === mime);
    return {mime, label: def?.label ?? mime, ext: def?.ext ?? ""};
  });

  const imageTypesDetail = allowedImageTypes.map((mime) => {
    const def = ALL_IMAGE_TYPES.find((t) => t.mime === mime);
    return {mime, label: def?.label ?? mime, ext: def?.ext ?? ""};
  });

  return NextResponse.json({
    success: true,
    data: {
      video: {
        maxSizeMb: maxVideoSizeMb,
        maxSizeBytes: maxVideoSizeMb * 1024 * 1024,
        allowedTypes: allowedVideoTypes,
        allowedTypesDetail: videoTypesDetail,
      },
      image: {
        maxSizeMb: maxImageSizeMb,
        maxSizeBytes: maxImageSizeMb * 1024 * 1024,
        maxBatchUpload: maxImageBatchUpload,
        allowedTypes: allowedImageTypes,
        allowedTypesDetail: imageTypesDetail,
      },
    },
  });
}
