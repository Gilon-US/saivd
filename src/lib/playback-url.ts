import {createServiceRoleClient} from "@/utils/supabase/service";
import {generatePresignedVideoUrl, extractKeyFromUrl} from "@/lib/wasabi-urls";

export type PlaybackVariant = "original" | "watermarked";

export type PlaybackResult =
  | {ok: true; playbackUrl: string}
  | {ok: false; status: number; code: string; message: string};

export async function getPublicPlaybackData(
  videoId: string | undefined | null,
  variant: PlaybackVariant = "watermarked",
): Promise<PlaybackResult> {
  if (!videoId) {
    return {ok: false, status: 400, code: "validation_error", message: "Missing video id"};
  }

  if (variant !== "original" && variant !== "watermarked") {
    return {
      ok: false,
      status: 400,
      code: "invalid_variant",
      message: 'Variant must be "original" or "watermarked"',
    };
  }

  let video: {id: string; original_url: string | null; processed_url: string | null} | null;
  try {
    const supabase = createServiceRoleClient();
    const {data, error} = await supabase
      .from("videos")
      .select("id, original_url, processed_url")
      .eq("id", videoId)
      .maybeSingle();

    if (error) {
      console.error("[playback-url] Supabase error fetching public video:", error);
      return {ok: false, status: 500, code: "server_error", message: "Failed to load video"};
    }
    video = data;
  } catch (err) {
    console.error("[playback-url] Unexpected Supabase failure:", err);
    return {ok: false, status: 500, code: "server_error", message: "Failed to load video"};
  }

  if (!video) {
    return {ok: false, status: 404, code: "not_found", message: "Video not found"};
  }

  let key: string | null = null;
  if (variant === "watermarked") {
    const watermarkedUrl = video.processed_url || video.original_url;
    if (!watermarkedUrl) {
      return {
        ok: false,
        status: 400,
        code: "watermarked_not_available",
        message: "Watermarked version not available for this video",
      };
    }
    key = watermarkedUrl.startsWith("http") ? extractKeyFromUrl(watermarkedUrl) : watermarkedUrl;
  } else {
    const originalUrl = video.original_url;
    if (!originalUrl) {
      return {
        ok: false,
        status: 500,
        code: "invalid_data",
        message: "Missing or invalid video storage key",
      };
    }
    key = originalUrl.startsWith("http") ? extractKeyFromUrl(originalUrl) : originalUrl;
  }

  if (!key) {
    return {
      ok: false,
      status: 500,
      code: "invalid_data",
      message: "Missing or invalid video storage key",
    };
  }

  try {
    const playbackUrl = await generatePresignedVideoUrl(key);
    return {ok: true, playbackUrl};
  } catch (err) {
    console.error("[playback-url] Wasabi presign failed:", err);
    return {
      ok: false,
      status: 500,
      code: "server_error",
      message: "Failed to generate playback URL",
    };
  }
}
