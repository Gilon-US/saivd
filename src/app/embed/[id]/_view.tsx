"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {VideoPlayer} from "@/components/video/VideoPlayer";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {AlertTriangleIcon} from "lucide-react";
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

/** Embeddable video viewer at /embed/[id] (mirrors saivd-viewer). */
export function EmbedVideoView({videoId, initialPlaybackUrl, initialError, ssrVideo = false}: Props) {
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
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    initialPlaybackUrl ? "verifying" : null,
  );
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);

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
  }, [videoId]);

  const handleVerificationComplete = useCallback(
    (status: "verified" | "failed", userId: string | null) => {
      setVerificationStatus(status);
      setVerifiedUserId(userId);
    },
    [],
  );

  const noop = useCallback(() => {}, []);

  if (fetchStatus === "loading") {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-black">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  if (fetchStatus === "not_found") {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-black px-4">
        <div className="text-center">
          <AlertTriangleIcon className="mx-auto mb-3 h-8 w-8 text-yellow-400" />
          <p className="text-sm text-white/80">Video not found.</p>
        </div>
      </main>
    );
  }

  if (fetchStatus === "fetch_error") {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-black px-4">
        <div className="text-center">
          <AlertTriangleIcon className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-sm text-white/80">{fetchError ?? "Couldn't load this video."}</p>
        </div>
      </main>
    );
  }

  if (ssrVideo && playbackUrl) {
    return (
      <VideoPlayer
        embedded
        ssrVideo
        videoUrl={playbackUrl}
        videoId={videoId}
        isOpen
        onClose={noop}
        enableFrameAnalysis
        verificationStatus={verificationStatus}
        verifiedUserId={verifiedUserId}
        onVerificationComplete={handleVerificationComplete}
        playbackContext="public"
      />
    );
  }

  return (
    <main className="h-screen w-screen bg-black">
      {playbackUrl && (
        <VideoPlayer
          embedded
          videoUrl={playbackUrl}
          videoId={videoId}
          isOpen
          onClose={noop}
          enableFrameAnalysis
          verificationStatus={verificationStatus}
          verifiedUserId={verifiedUserId}
          onVerificationComplete={handleVerificationComplete}
          playbackContext="public"
        />
      )}
    </main>
  );
}
