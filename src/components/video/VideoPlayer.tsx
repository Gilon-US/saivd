"use client";

import {useEffect, useRef, useState, useCallback} from "react";
import {X, Play, Pause, Volume2, VolumeX, Maximize} from "lucide-react";
import {useFrameAnalysis, type FrameAnalysisFunction} from "@/hooks/useFrameAnalysis";

interface VideoPlayerProps {
  videoUrl: string;
  onClose: () => void;
  isOpen: boolean;
}

export function VideoPlayer({videoUrl, onClose, isOpen}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [numericUserId, setNumericUserId] = useState<number | null>(null);

  // Frame analysis hook – for now, treat any "-watermarked" playback URL as
  // eligible for QR/verification overlay, and conceptually "extract" a
  // numeric_user_id from frames. Since we don't yet have real frame decoding
  // implemented, use a hard-coded numeric_user_id = 1 when playing a
  // watermarked video.
  const isWatermarked = videoUrl.includes("-watermarked");
  const analysisFunction = useCallback<FrameAnalysisFunction>(() => {
    if (isWatermarked) {
      // Placeholder for future frame analysis that would decode the creator's
      // numeric_user_id from the video frames. For now, hard-code user 1.
      setNumericUserId(1);
      return true;
    }
    return false;
  }, [isWatermarked]);
  const {showOverlay} = useFrameAnalysis(videoRef, isPlaying, analysisFunction);

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
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
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
          />

          {/* QR / analysis overlay - only shown when frame analysis says so
              and we have a numeric_user_id (currently hard-coded to 1 for
              watermarked videos). */}
          {showOverlay && numericUserId != null && (
            <div className="absolute inset-0 bg-black/40 pointer-events-none flex items-center justify-center transition-opacity duration-200">
              <div className="bg-white rounded-lg p-4 shadow-lg flex flex-col items-center gap-2">
                {/* The QR image is served from the public profile QR route, which
                    ultimately reads the QR PNG from Wasabi. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/profile/${numericUserId}/qr`} alt="Creator QR code" className="w-32 h-32 object-contain" />
                <span className="text-xs text-gray-700">Scan to view creator profile</span>
              </div>
            </div>
          )}

          {/* Custom controls */}
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
