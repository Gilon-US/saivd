"use client";

import {useEffect, useRef, useState, useCallback} from "react";
import {X, Play, Pause, Volume2, VolumeX, Maximize} from "lucide-react";
import {useFrameAnalysis, type FrameAnalysisFunction} from "@/hooks/useFrameAnalysis";
import {useWatermarkVerification, type VerificationProgress, type VerificationProgressPhase} from "@/hooks/useWatermarkVerification";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import { prewarmWasmVerificationSession } from "@/lib/wasm-watermark-verification-client";

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
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [verificationProgress, setVerificationProgress] = useState<VerificationProgress | null>(null);
  const [microcopyIndex, setMicrocopyIndex] = useState(0);

  // Prevent playback until verification passes (for watermarked videos).
  // Only treat videos as playable when either:
  // - verification has not been requested (null), or
  // - verification has positively succeeded ("verified").
  const isPlaybackAllowed = verificationStatus === null || verificationStatus === "verified";

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
  const {qrUrl: frameAnalysisQrUrl} = useFrameAnalysis(videoRef, isPlaying, analysisFunction, enableFrameAnalysis && videoId ? videoId : undefined);

  // Use verified user ID for QR code if available, otherwise use frame analysis QR URL
  const qrUrl = verifiedUserId ? `/profile/${verifiedUserId}/qr` : frameAnalysisQrUrl;
  const extractedUserId = verifiedUserId ?? extractNumericUserIdFromQrUrl(qrUrl);
  const creatorProfileUrl = extractedUserId ? `${CREATOR_APP_ORIGIN}/profile/${extractedUserId}` : null;

  // Diagnostic: log when video src is withheld vs set (to trace full-video preload)
  const videoSrcWithheld = enableFrameAnalysis && verificationStatus !== "verified";
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
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isOpen]);

  const togglePlay = () => {
    // Prevent playback if verification hasn't passed
    if (!isPlaybackAllowed) {
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
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        const el = videoRef.current as HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
          webkitEnterFullScreen?: () => void;
        };
        // iOS Safari often doesn't support requestFullscreen() for <video>; use the WebKit API when available.
        if (typeof el.webkitEnterFullscreen === "function") {
          el.webkitEnterFullscreen();
        } else if (typeof el.webkitEnterFullScreen === "function") {
          el.webkitEnterFullScreen();
        } else {
          videoRef.current.requestFullscreen();
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-2 sm:p-4">
      <div className="relative w-full max-w-5xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 sm:-top-12 right-0 sm:right-2 text-white hover:text-gray-300 transition-colors touch-manipulation z-30"
          aria-label="Close video player">
          <X className="w-6 h-6 sm:w-8 sm:h-8" />
        </button>

        {/* Video container */}
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            src={enableFrameAnalysis && verificationStatus !== "verified" ? undefined : videoUrl}
            playsInline
            crossOrigin="anonymous"
            className="w-full aspect-video"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            controls={false}
          />

          {/* Verification overlay */}
          {verificationStatus === "verifying" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
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

          {verificationStatus === "failed" && (
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
          {qrUrl && isPlaybackAllowed && (
            <button
              type="button"
              onClick={() => {
                if (creatorProfileUrl) {
                  window.location.assign(creatorProfileUrl);
                }
              }}
              disabled={!creatorProfileUrl}
              aria-label="View creator profile"
              className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20 qr-logo-flip-container cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded-md">
              <div className="qr-logo-flip-card">
                <div className="qr-logo-flip-face qr-logo-flip-face-front">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrUrl}
                    alt="Creator QR code"
                    className="w-16 h-16 object-contain rounded-md shadow-md"
                  />
                </div>
                <div className="qr-logo-flip-face qr-logo-flip-face-back">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/saivd-logo.png"
                    alt="Brand logo"
                    className="w-16 h-16 object-contain rounded-md shadow-md"
                  />
                </div>
              </div>
            </button>
          )}

          {/* Custom controls - only shown when playback is allowed */}
          {isPlaybackAllowed && (
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
