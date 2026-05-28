"use client";

import {useState} from "react";
import {Button} from "@/components/ui/button";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {ImageIcon, ShieldCheckIcon, ShieldAlertIcon, TrashIcon, UploadIcon} from "lucide-react";
import type {ImageRecord} from "@/hooks/useImages";
import {useImageWatermarkVerification} from "@/hooks/useImageWatermarkVerification";

const SAIVD_API_ORIGIN = process.env.NEXT_PUBLIC_SAIVD_API_URL?.replace(/\/+$/, "") ?? "https://saivd.netlify.app";

type ImageGridProps = {
  images: ImageRecord[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenUploadModal: () => void;
  onDelete: (id: string) => Promise<void>;
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {year: "numeric", month: "short", day: "numeric"});
}

function ImageCard({image, onDelete}: {image: ImageRecord; onDelete: (id: string) => Promise<void>}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  // Prefer the watermarked PNG; fall back to the original if watermarking
  // hasn't finished (status='processing') or has failed.
  const displayUrl = image.processed_url ?? image.original_url;
  const watermarkAvailable = Boolean(image.processed_url);

  // Verification only runs while the lightbox is open AND we have a
  // processed PNG to verify. Closed lightbox -> hook idles.
  const verification = useImageWatermarkVerification(
    lightbox && watermarkAvailable ? displayUrl : null,
    {enabled: lightbox && watermarkAvailable},
  );

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(image.id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="group relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        {/* Thumbnail */}
        <button
          type="button"
          className="w-full aspect-square bg-gray-100 dark:bg-gray-900 relative block cursor-zoom-in"
          onClick={() => setLightbox(true)}
          aria-label={`View ${image.filename}`}>
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt={image.filename}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <ImageIcon className="w-10 h-10" />
            </div>
          )}

          {/* Status corner badge — derived from image.status, not from
              client-side verification (which runs only when the lightbox
              is open). */}
          {image.status === "processing" && (
            <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
              <LoadingSpinner size="sm" /> Processing
            </span>
          )}
          {image.status === "processed" && (
            <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
              <ShieldCheckIcon className="h-3 w-3" /> Watermarked
            </span>
          )}
          {image.status === "failed" && (
            <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-md bg-amber-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white" title={image.watermark_error ?? "watermark failed"}>
              <ShieldAlertIcon className="h-3 w-3" /> Failed
            </span>
          )}
        </button>

        {/* Info */}
        <div className="p-3">
          <p className="text-sm font-medium truncate" title={image.filename}>{image.filename}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-500">
              {formatDate(image.created_at)}{image.file_size ? ` · ${formatFileSize(image.file_size)}` : ""}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-destructive" disabled={deleting} aria-label="Delete image">
                  {deleting ? <LoadingSpinner size="sm" /> : <TrashIcon className="h-4 w-4" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete image?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <span className="font-medium">{image.filename}</span>. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {deleteError && <p className="text-xs text-destructive mt-1">{deleteError}</p>}
        </div>
      </div>

      {/* Lightbox — verification-aware. The image element sits inside a
          `relative inline-block` container so the absolutely-positioned QR
          badge anchors to the image's bounding box. Matches
          saivd-viewer/src/components/video/VideoPlayer.tsx:236-268. */}
      {lightbox && displayUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(false)}>
          <div
            className="relative inline-block max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt={image.filename}
              className="block max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />

            {/* QR / Logo flip overlay — only when verification has succeeded.
                JSX + classes mirror VideoPlayer.tsx so the badge animates and
                renders identically on video and image. */}
            {verification.verifiedUserId !== null && !verification.isVerificationFailed && (
              <button
                type="button"
                onClick={() => {
                  if (verification.verifiedUserId !== null) {
                    window.open(
                      `${SAIVD_API_ORIGIN}/profile/${verification.verifiedUserId}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }
                }}
                aria-label="View creator profile"
                className="absolute top-2 right-2 sm:top-4 sm:right-4 z-20 qr-logo-flip-container cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded-md">
                <div className="qr-logo-flip-card">
                  <div className="qr-logo-flip-face qr-logo-flip-face-front">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${SAIVD_API_ORIGIN}/profile/${verification.verifiedUserId}/qr`}
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

            {/* Verifying spinner overlay — small, top-left corner. */}
            {verification.verificationStatus === "verifying" && (
              <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                <LoadingSpinner size="sm" /> Verifying…
              </div>
            )}

            {/* Failed verification banner. Shown only when verification
                returned a definite failure (not when watermark isn't
                available yet). */}
            {watermarkAvailable && verification.isVerificationFailed && (
              <div className="absolute bottom-2 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4 z-20 rounded-md bg-amber-600/90 px-3 py-2 text-xs text-white">
                <div className="font-medium">Watermark verification failed</div>
                <div className="opacity-90">
                  {verification.failReason === "invalid_signature"
                    ? "Signature does not match the public key."
                    : verification.failReason === "fetch_failed"
                      ? "Could not fetch the public key."
                      : verification.failReason === "no_watermark"
                        ? "No watermark detected."
                        : "Image could not be decoded."}
                </div>
              </div>
            )}

            {/* "Original — not watermarked yet" hint while status='processing'
                or watermark hasn't completed. Shown over the original_url
                fallback. */}
            {!watermarkAvailable && image.status === "processing" && (
              <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                <LoadingSpinner size="sm" /> Watermarking…
              </div>
            )}
          </div>

          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 text-white text-2xl font-bold bg-black/40 rounded-full w-10 h-10 flex items-center justify-center hover:bg-black/60"
            aria-label="Close">
            ×
          </button>
        </div>
      )}
    </>
  );
}

export function ImageGrid({images, isLoading, error, onRefresh, onOpenUploadModal, onDelete}: ImageGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}{" "}
          <button onClick={onRefresh} className="underline ml-1">Try again</button>
        </AlertDescription>
      </Alert>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-4 py-12">
        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
          <ImageIcon className="w-10 h-10 text-gray-400" />
        </div>
        <div>
          <p className="text-xl font-semibold">No images yet</p>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Upload your first image to get started.</p>
        </div>
        <Button onClick={onOpenUploadModal}>
          <UploadIcon className="mr-2 h-4 w-4" />
          Upload an Image
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {images.map((img) => (
        <ImageCard key={img.id} image={img} onDelete={onDelete} />
      ))}
    </div>
  );
}
