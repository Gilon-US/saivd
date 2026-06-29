import type {Metadata} from "next";
import {PublicVideoView} from "@/components/public/PublicVideoView";
import {getPublicPlaybackData} from "@/lib/playback-url";
import {getCreatorAppPublicOrigin} from "@/lib/public-media-urls";

export const revalidate = 60;

type Params = {id: string};

export async function generateMetadata({params}: {params: Promise<Params>}): Promise<Metadata> {
  const {id} = await params;
  const origin = getCreatorAppPublicOrigin();
  const watchUrl = `${origin}/v/${id}`;

  return {
    title: "Verified video — SAIVD",
    description: "Cryptographically verified video, watermarked at the source.",
    openGraph: {
      type: "video.other",
      url: watchUrl,
      title: "Verified video — SAIVD",
    },
  };
}

export default async function PublicVideoPage({params}: {params: Promise<Params>}) {
  const {id} = await params;
  const result = await getPublicPlaybackData(id, "watermarked");

  return <PublicVideoView videoId={id} result={result} />;
}
