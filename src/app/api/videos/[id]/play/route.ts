import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {generatePresignedVideoUrl, extractKeyFromUrl} from "@/lib/wasabi-urls";

export async function GET(request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: videoId} = await context.params;

    const supabase = await createClient();
    const {data: authData} = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json(
        {success: false, error: {code: "unauthorized", message: "Authentication required"}},
        {status: 401}
      );
    }

    const {data: video, error} = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", authData.user.id)
      .single();

    if (error || !video) {
      return NextResponse.json({success: false, error: {code: "not_found", message: "Video not found"}}, {status: 404});
    }

    // Choose which asset to play based on query param:
    // - watermarked: processed_url
    // - upload: original_url only (user's uploaded object; not the normalized "clean" file)
    // - default / original: normalized_url (stable MP4) when available, else original_url
    const url = new URL(request.url);
    const variant = url.searchParams.get("variant");

    let key: string | null = null;

    if (variant === "watermarked" && video.processed_url) {
      if (video.processed_url.startsWith("http")) {
        key = extractKeyFromUrl(video.processed_url);
      } else {
        key = video.processed_url;
      }
    } else if (variant === "upload") {
      const uploadAsset = video.original_url;
      if (uploadAsset?.startsWith("http")) {
        key = extractKeyFromUrl(uploadAsset);
      } else {
        key = uploadAsset ?? null;
      }
    } else {
      const originalAsset = video.normalized_url ?? video.original_url;
      if (originalAsset?.startsWith("http")) {
        key = extractKeyFromUrl(originalAsset);
      } else {
        key = originalAsset ?? null;
      }
    }

    if (!key) {
      return NextResponse.json(
        {success: false, error: {code: "invalid_data", message: "Missing or invalid video storage key"}},
        {status: 500}
      );
    }

    const playbackUrl = await generatePresignedVideoUrl(key);

    return NextResponse.json({
      success: true,
      data: {
        playbackUrl,
      },
    });
  } catch (error) {
    console.error("Error generating playback URL:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to generate playback URL"}},
      {status: 500}
    );
  }
}
