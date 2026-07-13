"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import Link from "next/link";
import {VideoPlayer} from "@/components/video/VideoPlayer";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {Button} from "@/components/ui/button";
import {AlertTriangleIcon, PlayIcon, RefreshCwIcon} from "lucide-react";
import {getCreatorAppPublicOrigin} from "@/lib/public-media-urls";
import {isPrewarmEnabled} from "@/lib/video-perf-flags";
import {prewarmWasmVerificationSession} from "@/lib/wasm-watermark-verification-client";

type FetchStatus = "loading" | "ready" | "not_found" | "fetch_error";
type VerificationStatus = "verifying" | "verified" | "failed" | null;

type InitialError = {code: string; message: string; status: number};

type Props = {
  videoId: string;
  initialPlaybackUrl: string | null;
  initialError: InitialError | null;
  ssrVideo?: boolean;
};

/**
 * Public, unauthenticated video viewer at /v/[id] (mirrors saivd-viewer).
 * Uses presigned Wasabi playback URL + the same VideoPlayer verification pipeline as the dashboard.
 */
export function PublicVideoView({videoId, initialPlaybackUrl, initialError, ssrVideo = false}: Props) {
  const initialStatus: FetchStatus = initialPlaybackUrl
    ? "ready"
    : initialError?.status === 404
      ? "not_found"
      : "loading";

  const [fetchStatus, setFetchStatus] = useState<FetchStatus>(initialStatus);
  const [fetchError, setFetchError] = useState<string | null>(
    initialError && initialError.status !== 404 ? initialError.message : null,
  );
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(initialPlaybackUrl);
  const [playerOpen, setPlayerOpen] = useState(Boolean(initialPlaybackUrl));
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    initialPlaybackUrl ? "verifying" : null,
  );
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchInflightRef = useRef(false);
  const skipNextFetchRef = useRef(Boolean(initialPlaybackUrl) || initialError?.status === 404);

  useEffect(() => {
    if (!isPrewarmEnabled() || !initialPlaybackUrl) return;
    void prewarmWasmVerificationSession(initialPlaybackUrl);
  }, [initialPlaybackUrl]);

  useEffect(() => {
    let cancelled = false;
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (fetchInflightRef.current) return;
    fetchInflightRef.current = true;

    setFetchStatus("loading");
    setFetchError(null);

    const load = async () => {
      try {
        const res = await fetch(`/api/public/videos/${videoId}/play?variant=watermarked`);
        const body = await res.json().catch(() => null);

        if (cancelled) return;

        if (res.status === 404) {
          setFetchStatus("not_found");
          return;
        }

        if (!res.ok || !body?.success || !body?.data?.playbackUrl) {
          setFetchError(body?.error?.message ?? `Failed to load video (status ${res.status})`);
          setFetchStatus("fetch_error");
          return;
        }

        setPlaybackUrl(body.data.playbackUrl);
        setVerificationStatus("verifying");
        setVerifiedUserId(null);
        setPlayerOpen(true);
        setFetchStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : "Failed to load video");
        setFetchStatus("fetch_error");
      } finally {
        fetchInflightRef.current = false;
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [videoId, retryCount]);

  const handleVerificationComplete = useCallback(
    (status: "verified" | "failed", userId: string | null) => {
      setVerificationStatus(status);
      setVerifiedUserId(userId);
    },
    [],
  );

  const handleClosePlayer = useCallback(() => {
    setPlayerOpen(false);
  }, []);

  const handleReplay = useCallback(() => {
    if (!playbackUrl) return;
    setVerificationStatus("verifying");
    setVerifiedUserId(null);
    setPlayerOpen(true);
  }, [playbackUrl]);

  const handleRetry = useCallback(() => {
    setPlaybackUrl(null);
    setVerificationStatus(null);
    setVerifiedUserId(null);
    setRetryCount((n) => n + 1);
  }, []);

  if (fetchStatus === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 bg-black">
        <div className="flex flex-col items-center gap-4 text-center">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-white/70">Loading video…</p>
        </div>
      </main>
    );
  }

  if (fetchStatus === "not_found") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 bg-black">
        <div className="max-w-md rounded-lg border border-white/10 bg-white/5 p-6 text-center">
          <AlertTriangleIcon className="mx-auto mb-4 h-10 w-10 text-yellow-400" />
          <h1 className="text-2xl font-semibold text-white">Video not found</h1>
          <p className="mt-2 text-sm text-white/70">
            This video doesn&apos;t exist or has been removed by its owner.
          </p>
          <PoweredBySaivdLink className="mt-6" />
        </div>
      </main>
    );
  }

  if (fetchStatus === "fetch_error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 bg-black">
        <div className="max-w-md rounded-lg border border-white/10 bg-white/5 p-6 text-center">
          <AlertTriangleIcon className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h1 className="text-2xl font-semibold text-white">Couldn&apos;t load this video</h1>
          <p className="mt-2 text-sm text-white/70">{fetchError ?? "Please try again later."}</p>
          <Button onClick={handleRetry} className="mt-4" variant="outline">
            <RefreshCwIcon className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <PoweredBySaivdLink className="mt-6" />
        </div>
      </main>
    );
  }

  const finishedCard = !playerOpen ? (
    <div
      className={
        ssrVideo
          ? "absolute inset-0 z-20 flex min-h-0 items-center justify-center bg-black/90 px-4"
          : "flex min-h-screen items-center justify-center px-4"
      }>
      {verificationStatus === "failed" ? (
        <div className="max-w-md rounded-lg border border-red-500/40 bg-red-500/10 p-6 text-center">
          <AlertTriangleIcon className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h1 className="text-2xl font-semibold text-white">This video could not be verified as authentic</h1>
          <p className="mt-2 text-sm text-white/70">
            The watermark on this video did not match a registered SAIVD creator key.
            Playback was blocked for your safety.
          </p>
          <PoweredBySaivdLink className="mt-6" />
        </div>
      ) : (
        <div className="max-w-md rounded-lg border border-white/10 bg-white/5 p-6 text-center">
          <h1 className="text-2xl font-semibold text-white">You&apos;ve finished watching</h1>
          <p className="mt-2 text-sm text-white/70">Want to watch it again?</p>
          <Button onClick={handleReplay} className="mt-6">
            <PlayIcon className="mr-2 h-4 w-4" />
            Replay
          </Button>
          <PoweredBySaivdLink className="mt-6" />
        </div>
      )}
    </div>
  ) : null;

  if (ssrVideo) {
    return (
      <>
        {playbackUrl && (
          <VideoPlayer
            videoUrl={playbackUrl}
            videoId={videoId}
            isOpen={playerOpen}
            onClose={handleClosePlayer}
            enableFrameAnalysis
            verificationStatus={verificationStatus}
            verifiedUserId={verifiedUserId}
            onVerificationComplete={handleVerificationComplete}
            ssrVideo
            playbackContext="public"
          />
        )}
        {finishedCard}
      </>
    );
  }

  return (
    <main className="relative min-h-screen bg-black">
      {playbackUrl && (
        <VideoPlayer
          videoUrl={playbackUrl}
          videoId={videoId}
          isOpen={playerOpen}
          onClose={handleClosePlayer}
          enableFrameAnalysis
          verificationStatus={verificationStatus}
          verifiedUserId={verifiedUserId}
          onVerificationComplete={handleVerificationComplete}
          playbackContext="public"
        />
      )}
      {finishedCard}
    </main>
  );
}

function PoweredBySaivdLink({className = ""}: {className?: string}) {
  const origin = getCreatorAppPublicOrigin();
  return (
    <div className={`text-xs text-white/50 ${className}`}>
      Powered by{" "}
      <Link href={origin} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
        SAIVD
      </Link>
    </div>
  );
}
