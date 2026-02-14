# QR Code / Logo Flip Animation Implementation Guide

This document explains how to implement the QR code and logo card-flip overlay animation used in the video player. The implementation uses pure CSS 3D transforms and keyframe animations to create a back-and-forth flip between two images (e.g., a QR code and a brand logo) during video playback.

## Overview

- **Effect:** A 64×64px card overlay in the top-left corner of a video that flips back and forth between two faces: a QR code (front) and a logo (back).
- **Animation:** Rotates 180° on the Y-axis to reveal the back face, holds briefly, then rotates back. The full cycle runs every 6 seconds.
- **Implementation:** CSS keyframes + 3D transforms with `backface-visibility: hidden` to create the illusion of two distinct faces.
- **Stacking:** The overlay uses `pointer-events-none` so it does not block video controls.

---

## 1. CSS Implementation

Add the following to your global CSS file (e.g., `src/app/globals.css` in Next.js) or a dedicated CSS module.

### 1.1 Keyframe Animation

The animation flips the card back and forth with hold periods on each side:

```
0%–45%:   Front face visible (QR code)
50%–95%:  Back face visible (logo) — achieved by rotating 180°
100%:     Back to front
```

```css
@keyframes qr-logo-flip {
  0% {
    transform: rotateY(0deg);
  }
  45% {
    transform: rotateY(0deg);
  }
  50% {
    transform: rotateY(180deg);
  }
  95% {
    transform: rotateY(180deg);
  }
  100% {
    transform: rotateY(0deg);
  }
}
```

**Customization:**
- Adjust `45%` and `95%` to change how long each face is shown.
- A symmetric hold would use `25%`/`75%` for equal time on each face.
- The current values keep the QR code visible slightly longer than the logo.

### 1.2 Container and Card Classes

```css
/* Container: establishes 3D perspective and fixed size */
.qr-logo-flip-container {
  perspective: 1000px;
  width: 4rem;   /* 64px */
  height: 4rem;
}

/* Card: the element that rotates, preserves 3D for children */
.qr-logo-flip-card {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  animation: qr-logo-flip 6s infinite;
}

/* Both faces: absolute, full size, backface hidden for clean flip */
.qr-logo-flip-face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* Front face: default orientation (visible at 0deg) */
.qr-logo-flip-face-front {
  transform: rotateY(0deg);
}

/* Back face: pre-rotated 180deg so it appears when card rotates */
.qr-logo-flip-face-back {
  transform: rotateY(180deg);
  background-color: rgba(255, 255, 255, 0.85);
  border-radius: 0.375rem;
}
```

**Important concepts:**
- `perspective: 1000px` gives the 3D depth.
- `transform-style: preserve-3d` ensures child elements participate in 3D space.
- `backface-visibility: hidden` hides the back of each face so only one side is visible at a time.
- The back face uses `rotateY(180deg)` so it lines up correctly when the card flips.

**Customization:**
- Change `6s` in `animation: qr-logo-flip 6s infinite` to alter flip speed.
- Change `width`/`height` of the container for different sizes.
- Adjust `background-color` on `.qr-logo-flip-face-back` for visibility over dark video.

---

## 2. React/JSX Structure

Place the overlay inside a relatively positioned video container. The structure is:

```
[Video container - position: relative]
  └── [Overlay wrapper - absolute, top-left, z-index, pointer-events-none]
        └── .qr-logo-flip-container
              └── .qr-logo-flip-card
                    ├── .qr-logo-flip-face-front  →  <img> QR code
                    └── .qr-logo-flip-face-back   →  <img> Logo
```

### 2.1 Minimal Component Example

```tsx
interface QrLogoOverlayProps {
  qrImageUrl: string;
  logoImageUrl?: string;
  className?: string;
}

export function QrLogoOverlay({
  qrImageUrl,
  logoImageUrl = "/images/default-logo.png",
  className = "",
}: QrLogoOverlayProps) {
  return (
    <div
      className={`absolute top-2 left-2 pointer-events-none z-20 qr-logo-flip-container ${className}`}
    >
      <div className="qr-logo-flip-card">
        {/* Front face: QR code */}
        <div className="qr-logo-flip-face qr-logo-flip-face-front">
          <img
            src={qrImageUrl}
            alt="Creator QR code"
            className="w-16 h-16 object-contain rounded-md shadow-md"
          />
        </div>
        {/* Back face: Logo */}
        <div className="qr-logo-flip-face qr-logo-flip-face-back">
          <img
            src={logoImageUrl}
            alt="Brand logo"
            className="w-16 h-16 object-contain rounded-md shadow-md"
          />
        </div>
      </div>
    </div>
  );
}
```

### 2.2 Usage in a Video Player

```tsx
<div className="relative bg-black rounded-lg overflow-hidden">
  <video ref={videoRef} src={videoUrl} className="w-full aspect-video" />

  {/* Conditionally show overlay when you have a QR URL */}
  {qrUrl && (
    <QrLogoOverlay
      qrImageUrl={qrUrl}
      logoImageUrl="/images/saivd-logo.png"
    />
  )}
</div>
```

---

## 3. Positioning and Styling

| Property | Value | Purpose |
|----------|-------|---------|
| `position: absolute` | On overlay wrapper | Positions relative to video container |
| `top: 0.5rem` (`top-2`) | Tailwind | 8px from top |
| `left: 0.5rem` (`left-2`) | Tailwind | 8px from left |
| `pointer-events: none` | On overlay | Prevents blocking clicks on controls |
| `z-index: 20` | Tailwind `z-20` | Above video, below modal overlays |
| `w-16 h-16` | Tailwind | 64×64px images |
| `object-contain` | Tailwind | Preserves image aspect ratio |
| `rounded-md` | Tailwind | Rounded corners |
| `shadow-md` | Tailwind | Subtle shadow for visibility |

---

## 4. Customization Options

### 4.1 Animation Timing

| Setting | Location | Example |
|---------|----------|---------|
| Cycle duration | `.qr-logo-flip-card` | `6s` → `3s` for faster flip |
| Hold on front | Keyframe `45%` | Increase for longer QR visibility |
| Hold on back | Keyframe `95%` | Decrease for shorter logo visibility |

### 4.2 Size

Change the container and image size together:

```css
.qr-logo-flip-container {
  perspective: 1000px;
  width: 6rem;   /* 96px */
  height: 6rem;
}
```

```tsx
<img className="w-24 h-24 ..." />  /* 96px in Tailwind */
```

### 4.3 Position

Move the overlay by adjusting the wrapper:

```tsx
className="absolute top-4 right-4 ..."   /* Top-right */
className="absolute bottom-4 left-4 ..." /* Bottom-left */
```

### 4.4 Logo Visibility

The back face uses `background-color: rgba(255, 255, 255, 0.85)` so a light logo stays visible on dark video. For dark logos, use a dark background:

```css
.qr-logo-flip-face-back {
  transform: rotateY(180deg);
  background-color: rgba(0, 0, 0, 0.75);
  border-radius: 0.375rem;
}
```

---

## 5. Integration Checklist

- [ ] Add the CSS (keyframes + utility classes) to your global styles or CSS module
- [ ] Ensure the overlay’s parent has `position: relative`
- [ ] Use `pointer-events-none` on the overlay so controls remain clickable
- [ ] Set a sensible `z-index` above the video
- [ ] Provide a valid QR image URL (remote or local)
- [ ] Place logo asset (e.g. in `public/images/`) and reference it
- [ ] Test in WebKit (Safari) — `-webkit-backface-visibility: hidden` is included for compatibility

---

## 6. Reference Implementation

The implementation in this project is used in:

- **Component:** `src/components/video/VideoPlayer.tsx`
- **Styles:** `src/app/globals.css` (in `@layer utilities`)
- **QR URL source:** `verifiedUserId` or `useFrameAnalysis` hook (app-specific; not required for the animation itself)

The overlay is shown only when `verificationStatus === "verified"` and `qrUrl` is non-null. For a standalone animation without verification, you can pass a static or dynamically resolved QR URL.
