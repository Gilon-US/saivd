"use client";

import {useEffect} from "react";
import {prewarmFfmpegVerificationAssets} from "@/lib/ffmpeg-verification-assets";

/** Fire-and-forget HTTP cache warm for ffmpeg.wasm verification assets at app shell load. */
export function FfmpegVerificationAssetPrewarm() {
  useEffect(() => {
    prewarmFfmpegVerificationAssets();
  }, []);
  return null;
}
