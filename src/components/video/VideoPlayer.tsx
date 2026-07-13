"use client";

import {useEffect, useLayoutEffect, useRef, useState, useCallback} from "react";
import {X, Play, Pause, Volume2, VolumeX, Maximize, ExternalLink} from "lucide-react";
import {getPublicWatchUrl} from "@/lib/public-media-urls";
import {useFrameAnalysis, type FrameAnalysisFunction} from "@/hooks/useFrameAnalysis";
import {useWatermarkVerification, type VerificationProgress, type VerificationProgressPhase} from "@/hooks/useWatermarkVerification";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {PresentationQrFlipButton} from "@/components/presentation/PresentationQrFlipButton";
import {prewarmWasmVerificationSession} from "@/lib/wasm-watermark-verification-client";
import {useProfile} from "@/contexts/ProfileContext";
import {usePublicQrOverlayPosition} from "@/hooks/usePublicQrOverlayPosition";
import {ssrVideoSelector} from "@/lib/video-playback-url";
import {getVideoElementPlaybackPlan, type PlaybackContext} from "@/lib/video-perf-flags";
import {
  getQrOverlayPositionClasses,
  parseQrOverlayPosition,
} from "@/lib/presentation-qr/position";
import {cn} from "@/lib/utils";
import {watermarkedPlaybackScaleX} from "@/lib/video-display-aspect";

const CREATOR_APP_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.PUBLIC_APP_URL ??
  "https://saivd.netlify.app";

interface VideoPlayerProps {
  videoUrl: string;
  videoId?: string | null;
  onClose: () => void;
  isOpen: boolean;
  enableFrameAnalysis: boolean;
  verificationStatus?: "verifying" | "verified" | "failed" | null;
  verifiedUserId?: string | null;
  onVerificationComplete?: (status: "verified" | "failed", userId: string | null) => void;
  /** True display aspect (width/height) from upload, including SAR when present. */
  displayAspectRatio?: number | null;
  /** Inline public / embed layout (no dashboard modal chrome). */
  embedded?: boolean;
  /** Bind to server-rendered `<video data-saivd-public-video>` in PublicVideoShell. */
  ssrVideo?: boolean;
  playbackContext?: PlaybackContext;
  contentLengthBytes?: number | null;
}

export function VideoPlayer({
  videoUrl,
  videoId,
  onClose,
  isOpen,
  enableFrameAnalysis,
  verificationStatus,
  verifiedUserId,
  onVerificationComplete,
  displayAspectRatio,
  embedded = false,
  ssrVideo = false,
  playbackContext = "dashboard",
  contentLengthBytes = null,
}: VideoPlayerProps) {
  const isPublicLayout = playbackContext === "public" || embedded || ssrVideo;
  const {profile} = useProfile();
  const dashboardQrOverlayPosition = parseQrOverlayPosition(profile?.qr_overlay_position);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ssrVideoBound, setSsrVideoBound] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [codedSize, setCodedSize] = useState<{width: number; height: number} | null>(null);
  const [verificationProgress, setVerificationProgress] = useState<VerificationProgress | null>(null);
  const [microcopyIndex, setMicrocopyIndex] = useState(0);

  // Allow playback while verification runs; block only on verification failure.
  const isVerificationInProgress = verificationStatus === "verifying";
  const isPlaybackBlocked = verificationStatus === "failed";

  // Frontend watermark verification: decode frame 0, fetch public key, verify; then verify frames 10, 20, ...
  const verificationEnabled =
    Boolean(enableFrameAnalysis && verificationStatus === "verifying" && videoUrl) && isOpen;
  console.log("[VideoPlayer] Render with verification state", {
    verificationEnabled,
    enableFrameAnalysis,
    verificationStatus,
    isOpen,
    hasVideoUrl: !!videoUrl,
    verifiedUserId,
  });
  useWatermarkVerification(videoRef, videoUrl ?? null, {
    enabled: verificationEnabled,
    onVerificationComplete,
    onVerificationProgress: setVerificationProgress,
  });

  const playbackPlan = getVideoElementPlaybackPlan({
    videoUrl,
    context: playbackContext,
    contentLengthBytes,
    verificationStatus,
    playRequested: true,
  });

  useEffect(() => {
    if (!isPublicLayout || !isOpen || isPlaybackBlocked || !playbackPlan.src) return;
    if (ssrVideo && !ssrVideoBound) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    const startPlayback = async () => {
      if (cancelled || isPlaybackBlocked) return;
      try {
        await video.play();
        if (!cancelled) setIsPlaying(true);
        return;
      } catch {
        /* autoplay blocked */
      }
      if (cancelled) return;
      video.muted = true;
      setIsMuted(true);
      try {
        await video.play();
        if (!cancelled) setIsPlaying(true);
      } catch {
        /* user can press play */
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      void startPlayback();
    } else {
      video.addEventListener("canplay", startPlayback, {once: true});
    }

    return () => {
      cancelled = true;
      video.removeEventListener("canplay", startPlayback);
    };
  }, [isPublicLayout, isOpen, isPlaybackBlocked, playbackPlan.src, videoUrl, ssrVideo, ssrVideoBound]);

  useEffect(() => {
    if (!ssrVideo || !videoRef.current) return;
    const video = videoRef.current;
    if (playbackPlan.src) {
      if (video.getAttribute("src") !== playbackPlan.src) {
        video.src = playbackPlan.src;
      }
    } else {
      video.removeAttribute("src");
    }
    video.preload = playbackPlan.preload;
  }, [ssrVideo, playbackPlan.src, playbackPlan.preload]);

  useLayoutEffect(() => {
    if (!ssrVideo || !videoId || !isOpen) {
      setSsrVideoBound(false);
      return;
    }
    const el = document.querySelector(ssrVideoSelector(videoId));
    if (el instanceof HTMLVideoElement) {
      videoRef.current = el;
      setSsrVideoBound(true);
    }
  }, [ssrVideo, videoId, isOpen, videoUrl]);

  useEffect(() => {
    if (verificationStatus !== "verifying") {
      setMicrocopyIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setMicrocopyIndex((prev) => prev + 1);
    }, 1700);
    return () => window.clearInterval(id);
  }, [verificationStatus, verificationProgress?.phase]);

  useEffect(() => {
    if (!isOpen || !enableFrameAnalysis || !videoUrl) return;
    void prewarmWasmVerificationSession(videoUrl);
  }, [isOpen, enableFrameAnalysis, videoUrl]);

  // Frame analysis hook – when videoId is provided, QR URL comes from verifiedUserId (parent state).
  const analysisFunction = useCallback<FrameAnalysisFunction>(() => {
    if (!enableFrameAnalysis) return null;
    return null;
  }, [enableFrameAnalysis]);
  const {qrUrl: frameAnalysisQrUrl} = useFrameAnalysis(
    videoRef,
    isPlaying,
    analysisFunction,
    !isPublicLayout && enableFrameAnalysis && videoId ? videoId : undefined,
  );

  const presentationNumericId = verifiedUserId ? Number(verifiedUserId) : null;
  const publicQrOverlay = usePublicQrOverlayPosition(
    isPublicLayout && presentationNumericId !== null && Number.isFinite(presentationNumericId)
      ? presentationNumericId
      : null,
  );
  const qrOverlayPosition = isPublicLayout
    ? publicQrOverlay.position
    : dashboardQrOverlayPosition;
  const creatorLogoUrl = isPublicLayout ? publicQrOverlay.logoUrl : profile?.logo;

  const extractedUserId =
    verifiedUserId ?? (!isPublicLayout ? extractNumericUserIdFromQrUrl(frameAnalysisQrUrl) : null);
  const creatorProfileUrl = extractedUserId ? `${CREATOR_APP_ORIGIN}/profile/${extractedUserId}` : null;
  const dashboardPresentationNumericId = extractedUserId ? Number(extractedUserId) : null;
  const showPresentationQr = isPublicLayout
    ? Boolean(presentationNumericId && videoId && verifiedUserId && !isPlaybackBlocked)
    : Boolean(
        dashboardPresentationNumericId && videoId && verifiedUserId && !isPlaybackBlocked,
      );
  const showLegacyQr =
    !isPublicLayout &&
    Boolean(!verifiedUserId && frameAnalysisQrUrl && !isPlaybackBlocked);

  // Diagnostic: src is always set now; verification no longer blocks playback start.
  const videoSrcWithheld = false;
  useEffect(() => {
    console.log("[Frame0Decode] Video element src", {
      withheld: videoSrcWithheld,
      reason: videoSrcWithheld
        ? "verification pending or failed – video has no src (no full load)"
        : "playback allowed – src set",
      verificationStatus,
      t: Math.round(performance.now()),
    });
  }, [videoSrcWithheld, verificationStatus]);

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
      setCodedSize(null);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (verificationStatus === "failed") {
      setIsPlaying(false);
    }
  }, [verificationStatus]);

  const togglePlay = () => {
    if (isPlaybackBlocked) {
      return;
    }

    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // If video has ended (currentTime >= duration), seek to start before playing
        if (videoRef.current.currentTime >= videoRef.current.duration) {
          videoRef.current.currentTime = 0;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setCodedSize({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  };

  useEffect(() => {
    if (!ssrVideo || !isOpen) return;
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("ended", onEnded);
    if (video.readyState >= 1) {
      onLoadedMetadata();
    }

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("ended", onEnded);
    };
  }, [ssrVideo, isOpen, videoId, videoUrl]);

  const playbackScaleX =
    enableFrameAnalysis &&
    displayAspectRatio &&
    codedSize &&
    codedSize.width > 0 &&
    codedSize.height > 0
      ? watermarkedPlaybackScaleX(codedSize.width, codedSize.height, displayAspectRatio)
      : 1;

  const toggleFullscreen = () => {
    const target = stageRef.current ?? videoRef.current;
    if (!target) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }

    const videoEl = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitEnterFullScreen?: () => void;
    }) | null;

    if (videoEl && typeof videoEl.webkitEnterFullscreen === "function") {
      videoEl.webkitEnterFullscreen();
    } else if (videoEl && typeof videoEl.webkitEnterFullScreen === "function") {
      videoEl.webkitEnterFullScreen();
    } else {
      target.requestFullscreen();
    }
  };

  const publicWatchUrl =
    !isPublicLayout && enableFrameAnalysis && videoId ? getPublicWatchUrl("video", videoId) : null;
  const videoSrc = isPublicLayout ? playbackPlan.src : videoUrl;
  const qrNumericId = isPublicLayout ? presentationNumericId : dashboardPresentationNumericId;

  if (!isOpen) return null;

  const overlayMode = ssrVideo;

  return (
    <div
      className={
        overlayMode
          ? "absolute inset-0 z-10"
          : isPublicLayout
            ? embedded
              ? "relative w-full h-full bg-black"
              : "fixed inset-0 z-50 bg-black flex items-center justify-center p-2 sm:p-4"
            : "fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-2 sm:p-4"
      }>
      <div
        className={
          overlayMode || (isPublicLayout && embedded)
            ? "relative w-full h-full"
            : "relative w-full max-w-5xl"
        }>
        {!embedded && (
          <button
            onClick={onClose}
            className={
              overlayMode
                ? "absolute top-2 right-2 sm:top-4 sm:right-4 text-white hover:text-gray-300 transition-colors touch-manipulation z-30"
                : "absolute -top-10 sm:-top-12 right-0 sm:right-2 text-white hover:text-gray-300 transition-colors touch-manipulation z-30"
            }
            aria-label="Close video player">
            <X className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        )}

        {publicWatchUrl && (
          <a
            href={publicWatchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute -top-10 sm:-top-12 left-0 sm:left-2 flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition-colors touch-manipulation z-30">
            <ExternalLink className="w-4 h-4" />
            Open public page
          </a>
        )}

        <div
          ref={stageRef}
          className={
            overlayMode
              ? "relative w-full h-full"
              : isPublicLayout
                ? "relative bg-black rounded-lg overflow-hidden w-full h-full"
                : "relative mx-auto w-full max-h-[80vh] aspect-video overflow-hidden rounded-lg bg-black"
          }>
          {!ssrVideo && (
            <video
              ref={videoRef}
              src={videoSrc}
              playsInline
              crossOrigin="anonymous"
              preload={isPublicLayout ? playbackPlan.preload : undefined}
              className={
                isPublicLayout
                  ? embedded
                    ? "h-full w-full object-contain"
                    : "w-full aspect-video"
                  : "h-full w-full object-contain bg-black"
              }
              style={
                !isPublicLayout && playbackScaleX !== 1
                  ? {transform: `scaleX(${playbackScaleX})`, transformOrigin: "center center"}
                  : undefined
              }
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
              controls={false}
            />
          )}

          {/* Verification overlay */}
          {isVerificationInProgress && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/35 z-20 pointer-events-none">
              <div className="relative">
                <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping" />
                <LoadingSpinner size="lg" />
              </div>
              <p className="mt-5 text-white text-center px-4 max-w-md font-medium">
                {phaseHeadline(verificationProgress?.phase)}
              </p>
              <p className="mt-2 text-white/80 text-center px-4 max-w-lg text-sm">
                {phaseMicrocopy(verificationProgress?.phase, microcopyIndex)}
              </p>
            </div>
          )}

          {isPlaybackBlocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-6 max-w-md mx-4">
                <p className="text-white text-center text-lg font-medium">
                  This video is not authentic, viewing not allowed
                </p>
              </div>
            </div>
          )}

          {/* QR / Logo flip overlay – flips between QR code (front) and logo (back) every 6s.
              Shown when we have a verified user ID or frame analysis returns a QR URL. */}
          {showPresentationQr && qrNumericId && videoId && (
            <PresentationQrFlipButton
              numericUserId={qrNumericId}
              mediaKind="video"
              mediaId={videoId}
              enabled={isOpen && !isPlaybackBlocked}
              position={qrOverlayPosition}
              logoUrl={creatorLogoUrl}
              elevateAboveBottomControls
            />
          )}

          {showLegacyQr && frameAnalysisQrUrl && (
            <button
              type="button"
              onClick={() => {
                if (creatorProfileUrl) {
                  window.location.assign(creatorProfileUrl);
                }
              }}
              disabled={!creatorProfileUrl}
              aria-label="View creator profile"
              className={cn(
                "absolute z-20 qr-logo-flip-container cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded-md",
                getQrOverlayPositionClasses(qrOverlayPosition, {elevateAboveBottomControls: true}),
              )}>
              <div className="qr-logo-flip-card">
                <div className="qr-logo-flip-face qr-logo-flip-face-front">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={frameAnalysisQrUrl}
                    alt="Creator QR code"
                    className="w-16 h-16 object-contain rounded-md shadow-md"
                  />
                </div>
                <div className="qr-logo-flip-face qr-logo-flip-face-back">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profile?.logo || "/images/saivd-logo.png"}
                    alt="Creator logo"
                    className="w-16 h-16 object-cover rounded-md shadow-md"
                  />
                </div>
              </div>
            </button>
          )}

          {/* Custom controls - hidden only when playback is blocked after failed verification */}
          {!isPlaybackBlocked && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            {/* Seek bar */}
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full mb-4 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />

            {/* Control buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlay}
                  className="text-white hover:text-gray-300 transition-colors"
                  aria-label={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                </button>

                <button
                  onClick={toggleMute}
                  className="text-white hover:text-gray-300 transition-colors"
                  aria-label={isMuted ? "Unmute" : "Mute"}>
                  {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                </button>

                <span className="text-white text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-gray-300 transition-colors"
                aria-label="Fullscreen">
                <Maximize className="w-6 h-6" />
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function extractNumericUserIdFromQrUrl(qrUrl: string | null): string | null {
  if (!qrUrl) return null;

  const match = qrUrl.match(/\/profile\/(\d+)\/qr(?:$|\?)/);
  return match?.[1] ?? null;
}

function phaseHeadline(phase?: VerificationProgressPhase): string {
  switch (phase) {
    case "session_init":
      return "Preparing secure verification";
    case "moov_parse":
      return "Reading video structure";
    case "ffmpeg_load":
      return "Loading verification engine";
    case "frame_decode":
      return "Checking watermark on frame 0";
    case "key_fetch":
      return "Retrieving signer key";
    case "rsa_verify":
      return "Validating authenticity signature";
    case "finalizing":
      return "Final checks";
    default:
      return "Verifying authenticity";
  }
}

function phaseMicrocopy(phase: VerificationProgressPhase | undefined, index: number): string {
  const messages: Record<VerificationProgressPhase | "default", string[]> = {
    prewarm: [
      "Getting things ready for a faster start.",
      "Warming the verification stack.",
    ],
    session_init: [
      "Starting a secure verification session.",
      "Preparing everything needed to validate this video.",
    ],
    moov_parse: [
      "Inspecting video metadata and frame layout.",
      "Mapping where verification data lives in frame 0.",
    ],
    ffmpeg_load: [
      "Loading the decode engine on your device.",
      "One-time setup can take a little longer on mobile.",
    ],
    frame_decode: [
      "Decoding frame 0 and extracting watermark bits.",
      "Checking embedded identity markers now.",
    ],
    key_fetch: [
      "Fetching the creator verification key.",
      "Contacting the key service securely.",
    ],
    rsa_verify: [
      "Running cryptographic signature validation.",
      "Confirming the decoded identity is authentic.",
    ],
    finalizing: [
      "Finishing up and enabling playback.",
      "Almost done.",
    ],
    default: [
      "Your video will play automatically once verification completes.",
      "Thanks for waiting while we verify authenticity.",
    ],
  };
  const list = messages[phase ?? "default"];
  return list[index % list.length];
}
