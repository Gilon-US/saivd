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

    // Choose which asset to play based on query param. If the client requests
    // the watermarked variant and a processed_url exists, use that; otherwise
    // fall back to the original_url.
    const url = new URL(request.url);
    const variant = url.searchParams.get("variant");

    let key: string | null = null;

    if (variant === "watermarked" && video.processed_url) {
      if (video.processed_url.startsWith("http")) {
        key = extractKeyFromUrl(video.processed_url);
      } else {
        key = video.processed_url;
      }
    } else if (video.original_url?.startsWith("http")) {
      key = extractKeyFromUrl(video.original_url);
    } else {
      key = video.original_url;
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
