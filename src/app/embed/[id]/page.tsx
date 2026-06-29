import {PublicVideoView} from "@/components/public/PublicVideoView";
import {getPublicPlaybackData} from "@/lib/playback-url";

export const revalidate = 60;

type Params = {id: string};

export default async function EmbedVideoPage({params}: {params: Promise<Params>}) {
  const {id} = await params;
  const result = await getPublicPlaybackData(id, "watermarked");

  return <PublicVideoView videoId={id} result={result} embed />;
}
