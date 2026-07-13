import {preload} from "react-dom";
import {PublicVideoShell} from "@/components/video/PublicVideoShell";
import {PublicVideoView} from "@/app/v/[id]/_view";
import {EmbedVideoView} from "@/app/embed/[id]/_view";
import type {PlaybackResult} from "@/lib/playback-url";
import {isSsrShellEnabled} from "@/lib/video-perf-flags";

type PublicVideoPageContentProps = {
  videoId: string;
  result: PlaybackResult;
  embed?: boolean;
};

export function PublicVideoPageContent({videoId, result, embed = false}: PublicVideoPageContentProps) {
  const View = embed ? EmbedVideoView : PublicVideoView;

  if (!result.ok) {
    return (
      <View
        videoId={videoId}
        initialPlaybackUrl={null}
        initialError={{code: result.code, message: result.message, status: result.status}}
      />
    );
  }

  if (!isSsrShellEnabled()) {
    return (
      <View
        videoId={videoId}
        initialPlaybackUrl={result.playbackUrl}
        initialError={null}
      />
    );
  }

  preload(result.playbackUrl, {as: "video", crossOrigin: "anonymous"});

  return (
    <>
      <link rel="preload" as="video" href={result.playbackUrl} crossOrigin="anonymous" />
      <PublicVideoShell viewUrl={result.playbackUrl} videoId={videoId} embed={embed}>
        <View
          videoId={videoId}
          initialPlaybackUrl={result.playbackUrl}
          initialError={null}
          ssrVideo
        />
      </PublicVideoShell>
    </>
  );
}
