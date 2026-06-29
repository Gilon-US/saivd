"use client";

import type {PlaybackResult} from "@/lib/playback-url";

type PublicVideoViewProps = {
  videoId: string;
  result: PlaybackResult;
  embed?: boolean;
};

export function PublicVideoView({videoId, result, embed = false}: PublicVideoViewProps) {
  const shellClass = embed
    ? "relative flex h-full w-full items-center justify-center bg-black"
    : "relative flex min-h-screen items-center justify-center bg-black p-4";

  if (!result.ok) {
    if (result.status === 404) {
      return (
        <div className={shellClass}>
          <p className="text-sm text-gray-300">Video not found</p>
        </div>
      );
    }

    return (
      <div className={shellClass}>
        <p className="text-sm text-red-400">{result.message}</p>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <video
        data-saivd-public-video={videoId}
        src={result.playbackUrl}
        controls
        playsInline
        crossOrigin="anonymous"
        className={embed ? "h-full w-full" : "w-full max-w-5xl rounded-lg"}
      />
    </div>
  );
}
