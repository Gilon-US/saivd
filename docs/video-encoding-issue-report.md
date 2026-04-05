# Video Encoding Issue Report

**File:** `95C0E148-DE71-4FB6-B72D-87480004D09E-watermarked.mp4`
**Date:** 2026-04-03
**Symptom:** Video stutters/pauses approximately every second during web browser playback

---

## Summary

The watermarked output video has been encoded with every frame as an independent keyframe (IDR frame). This eliminates all inter-frame compression, inflating the file to ~10–20x its expected size and causing the browser's network buffer to stall repeatedly during playback. The issue almost certainly originates in the normalization or watermarking pipeline.

---

## Findings

### All Frames Are Keyframes

In a correctly encoded H.264 video, only a small percentage of frames are keyframes (I-frames). The remaining frames are P-frames or B-frames that store only the *difference* from neighboring frames, achieving high compression ratios. In this file, every one of the 357 frames is an IDR keyframe — there are no P-frames or B-frames at all.

```
Total frames:      357
Keyframes (IDR):   357  ← should be ~7–18 for an 11-second clip
P-frames:            0
B-frames:            0
```

### Impact on File Size and Bitrate

Because every frame is stored as a complete image with no temporal compression, the file is dramatically oversized:

| Metric             | This file              | Expected for web delivery |
|--------------------|------------------------|---------------------------|
| Duration           | 11.9 seconds           | —                         |
| File size          | **67.6 MB**            | ~5–10 MB                  |
| Video bitrate      | **45.3 Mbps**          | 2–8 Mbps                  |
| Average frame size | **184 KB**             | 5–20 KB                   |
| Keyframe ratio     | **100%**               | ~2–5%                     |

### Why This Causes Stuttering

A browser video player buffers incoming data as it downloads. At 45 Mbps, even a fast connection struggles to keep up, and the player stalls waiting for the next frame's data — producing the ~1-second pause pattern reported. The problem is not device performance or network quality; it is that the encoded data rate is simply too high for streaming.

### moov Atom Position (Not an Issue)

The `moov` atom (which contains the metadata the browser needs to begin playback) is correctly positioned at the beginning of the file, before the `mdat` payload. This is the `faststart` layout required for progressive web playback. This part of the pipeline is fine.

```
offset=0        ftyp  (32 bytes)
offset=32       moov  (11,440 bytes)  ← correct position for web streaming
offset=11,472   free
offset=11,480   mdat  (67,611,282 bytes)
```

---

## Probable Cause in the Pipeline

Forcing all-keyframe output is a known side effect of certain ffmpeg pipeline configurations:

- **`-g 1`** — sets the GOP size to 1, making every frame a keyframe. Sometimes used to allow frame-accurate seeking during compositing.
- **`-x264-params keyint=1`** — same effect via libx264 parameters.
- **Chained filter graphs without re-encoding** — if the watermark filter forces a full decode/re-encode pass with default or incorrect GOP settings, the encoder may default to all-keyframes.
- **Segment-based processing** — if the video is split into individual frames or very short segments for watermarking, then concatenated, the resulting stream may consist entirely of keyframes.

The watermarking step should preserve or explicitly set a normal GOP structure on output.

---

## Recommended Fix

The output of the watermarking step should be re-encoded with a standard GOP configuration:

```bash
ffmpeg -i input_watermarked.mp4 \
  -c:v libx264 \
  -preset slow \
  -crf 23 \
  -g 60 \
  -keyint_min 30 \
  -c:a copy \
  -movflags +faststart \
  output_fixed.mp4
```

| Flag | Purpose |
|------|---------|
| `-crf 23` | Quality-based encoding; results in ~2–4 Mbps for typical content |
| `-g 60` | Keyframe every 2 seconds at 30fps (standard for web video) |
| `-keyint_min 30` | Minimum 1 second between forced keyframes |
| `-movflags +faststart` | Ensures moov atom remains at the front of the file |

Ideally, these parameters are applied at the end of the watermarking pipeline rather than as a separate post-processing step, so every output is web-ready without an additional encode pass.

---

## Raw ffprobe Output (for Reference)

<details>
<summary>Stream and format details</summary>

```
Video codec:    H.264 High Profile, Level 4.0
Resolution:     1080×1920 (portrait)
Frame rate:     30 fps
Pixel format:   yuv420p
Duration:       11.9 seconds
Video bitrate:  45,308,945 bps (~45.3 Mbps)
Audio codec:    AAC-LC, 44100 Hz, mono, ~144 kbps
File size:      67,622,762 bytes (~67.6 MB)
Encoder:        Lavf60.16.100 / Lavc60.31.102 libx264
```

</details>
