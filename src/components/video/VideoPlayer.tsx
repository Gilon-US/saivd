"use client";

import {useEffect, useRef, useState, useCallback} from "react";
import {X, Play, Pause, Volume2, VolumeX, Maximize} from "lucide-react";
import {useFrameAnalysis, type FrameAnalysisFunction} from "@/hooks/useFrameAnalysis";
import {LoadingSpinner} from "@/components/ui/loading-spinner";

interface VideoPlayerProps {
  videoUrl: string;
  videoId?: string | null;
  onClose: () => void;
  isOpen: boolean;
  enableFrameAnalysis: boolean;
  verificationStatus?: "verifying" | "verified" | "failed" | null;
  verifiedUserId?: string | null;
}

export function VideoPlayer({videoUrl, videoId, onClose, isOpen, enableFrameAnalysis, verificationStatus, verifiedUserId}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Prevent playback until verification passes (for watermarked videos)
  const isPlaybackAllowed = verificationStatus === null || verificationStatus === "verified";

  // Frame analysis hook – controlled explicitly by enableFrameAnalysis.
  // When enabled and videoId is provided, the hook will extract user ID
  // from the video frames every 20 frames using the watermark service API.
  // When disabled or videoId is not provided, the analysis function is used.
  const analysisFunction = useCallback<FrameAnalysisFunction>(() => {
    if (!enableFrameAnalysis) {
      return null;
    }
    // If videoId is provided, user ID extraction is handled by useFrameAnalysis hook
    // This function is only used as a fallback when videoId is not available
    return null;
  }, [enableFrameAnalysis]);
  const {qrUrl: frameAnalysisQrUrl} = useFrameAnalysis(videoRef, isPlaying, analysisFunction, enableFrameAnalysis && videoId ? videoId : undefined);

  // Use verified user ID for QR code if available, otherwise use frame analysis QR URL
  const qrUrl = verifiedUserId ? `/profile/${verifiedUserId}/qr` : frameAnalysisQrUrl;

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
        videoRef.current.requestFullscreen();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="relative w-full max-w-5xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
          aria-label="Close video player">
          <X className="w-8 h-8" />
        </button>

        {/* Video container */}
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full aspect-video"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            controls={false}
          />

          {/* Verification overlay */}
          {verificationStatus === "verifying" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
              <LoadingSpinner size="lg" />
              <p className="mt-4 text-white text-center px-4 max-w-md">
                We are verifying the video&apos;s authenticity. Your video will play shortly, please wait.
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

          {/* QR overlay – shown when we have a verified user ID or frame analysis returns a QR URL.
              The image itself is served from the public profile QR route, which
              ultimately reads the QR PNG from Wasabi. */}
          {qrUrl && isPlaybackAllowed && (
            <div className="absolute top-2 left-2 pointer-events-none z-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="Creator QR code" className="w-16 h-16 object-contain rounded-md shadow-md" />
            </div>
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
