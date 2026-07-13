import type {ReactNode} from "react";
import {getPublicVideoShellPreload} from "@/lib/video-perf-flags";

type PublicVideoShellProps = {
  viewUrl: string;
  videoId: string;
  embed?: boolean;
  children: ReactNode;
};

/** Server-rendered video shell so the browser starts fetching before client hydration. */
export function PublicVideoShell({viewUrl, videoId, embed = false, children}: PublicVideoShellProps) {
  return (
    <div
      className={`relative bg-black ${embed ? "h-full w-full" : "min-h-screen flex flex-col items-center justify-center p-2 sm:p-4"}`}>
      <div
        data-video-stage
        data-saivd-fullscreen-root
        className={embed ? "relative h-full w-full" : "relative w-full max-w-5xl"}>
        <video
          data-saivd-public-video={videoId}
          src={viewUrl}
          crossOrigin="anonymous"
          playsInline
          preload={getPublicVideoShellPreload()}
          className={embed ? "h-full w-full object-contain" : "w-full aspect-video rounded-lg"}
        />
        {children}
      </div>
    </div>
  );
}
