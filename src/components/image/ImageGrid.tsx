"use client";

import {useState} from "react";
import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {ImageIcon, QrCode, TrashIcon, UploadIcon} from "lucide-react";
import type {ImageRecord} from "@/hooks/useImages";
import {useImageWatermarkVerification} from "@/hooks/useImageWatermarkVerification";
import {imageProcessedVerificationUrl} from "@/lib/image-verification-url";
import {useToast} from "@/hooks/useToast";

const SAIVD_API_ORIGIN = process.env.NEXT_PUBLIC_SAIVD_API_URL?.replace(/\/+$/, "") ?? "https://saivd.netlify.app";

type ImageGridProps = {
  images: ImageRecord[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenUploadModal: () => void;
  onDelete: (id: string) => Promise<void>;
};

type LightboxVariant = "original" | "watermarked";

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function ImageLightbox({
  image,
  variant,
  onClose,
}: {
  image: ImageRecord;
  variant: LightboxVariant;
  onClose: () => void;
}) {
  const watermarkedReady = variant === "watermarked" && image.status === "processed" && Boolean(image.processed_url);
  const url =
    watermarkedReady
      ? imageProcessedVerificationUrl(image.id)
      : image.original_url;

  const verification = useImageWatermarkVerification(image.id, {
    enabled: watermarkedReady,
  });

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}>
      <div
        className="relative inline-block max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${image.filename} — ${variant}`}
          className="block max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        />

        {variant === "watermarked" && verification.verifiedUserId !== null && !verification.isVerificationFailed && (
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

        {variant === "watermarked" && verification.verificationStatus === "verifying" && (
          <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
            <LoadingSpinner size="sm" /> Verifying…
          </div>
        )}

        {variant === "watermarked" && verification.isVerificationFailed && (
          <div className="absolute bottom-2 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4 z-20 rounded-md bg-amber-600/90 px-3 py-2 text-xs text-white">
            <div className="font-medium">Watermark verification failed</div>
            <div className="opacity-90">
              {verification.failReason === "invalid_signature"
                ? "Signature does not match the public key."
                : verification.failReason === "fetch_failed"
                  ? verification.result && !verification.result.ok &&
                      verification.result.detail?.startsWith("image_fetch_failed")
                    ? "Could not load the watermarked image for verification."
                    : "Could not fetch the public key."
                  : verification.failReason === "no_watermark"
                    ? "No watermark detected."
                    : verification.result && !verification.result.ok
                      ? verification.result.detail ?? "Image could not be decoded."
                      : "Image could not be decoded."}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl font-bold bg-black/40 rounded-full w-10 h-10 flex items-center justify-center hover:bg-black/60"
        aria-label="Close">
        ×
      </button>
    </div>
  );
}

function ImagePairCard({
  image,
  onDelete,
  onRefresh,
}: {
  image: ImageRecord;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxVariant | null>(null);
  const [isWatermarking, setIsWatermarking] = useState(false);
  const {toast} = useToast();

  const handleCreateWatermark = async () => {
    toast({
      title: "Creating watermarked version",
      description: `Starting watermark process for "${image.filename}"`,
    });

    setIsWatermarking(true);
    try {
      const response = await fetch(`/api/images/${image.id}/watermark`, {method: "POST"});
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to create watermarked image");
      }

      toast({
        title: "Watermark complete",
        description: `"${image.filename}" has been watermarked successfully.`,
        variant: "success",
      });
      onRefresh();
    } catch (error) {
      console.error("Error creating watermarked image:", error);
      toast({
        title: "Watermark failed",
        description: error instanceof Error ? error.message : "Failed to create watermarked image. Please try again.",
        variant: "error",
      });
      onRefresh();
    } finally {
      setIsWatermarking(false);
    }
  };

  const isProcessing = image.status === "processing" || isWatermarking;

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

  const panelClass =
    "w-44 sm:w-52 max-w-[208px] aspect-square relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden";

  return (
    <>
      <Card className="overflow-hidden flex-shrink-0 w-fit min-w-0">
        <CardContent className="p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-lg truncate max-w-[360px]" title={image.filename}>
                {image.filename}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Uploaded {new Date(image.created_at).toLocaleDateString()}
                {image.file_size ? ` · ${formatFileSize(image.file_size)}` : ""}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                  disabled={deleting}
                  aria-label={`Delete ${image.filename}`}>
                  {deleting ? <LoadingSpinner size="sm" /> : <TrashIcon className="h-4 w-4" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete image?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <span className="font-medium">{image.filename}</span> (original and
                    watermarked versions). This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {deleteError && <p className="text-xs text-destructive mb-2">{deleteError}</p>}

          <div className="flex gap-4 justify-start items-start">
            {/* Original */}
            <div className="space-y-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Original</h4>
                {image.original_url && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Ready</span>
                )}
              </div>
              <button
                type="button"
                className={`${panelClass} block cursor-zoom-in hover:opacity-90 transition-opacity`}
                onClick={() => image.original_url && setLightbox("original")}
                aria-label={`View original ${image.filename}`}
                disabled={!image.original_url}>
                {image.original_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.original_url}
                    alt={`${image.filename} — Original`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </button>
            </div>

            {/* Watermarked */}
            <div className="space-y-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Watermarked</h4>
                {image.status === "processed" && image.processed_url && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Ready</span>
                )}
                {image.status === "processing" && !isWatermarking && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">Processing…</span>
                )}
                {image.status === "failed" && (
                  <span
                    className="text-xs text-red-500 dark:text-red-400 truncate max-w-[120px]"
                    title={image.watermark_error ?? undefined}>
                    Failed
                  </span>
                )}
              </div>
              <div className={panelClass}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-7 w-7 rounded-full bg-white/80 hover:bg-white shadow-sm z-10 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
                  title={
                    isProcessing
                      ? "Image is being watermarked. Please wait."
                      : "Create or refresh watermarked version"
                  }
                  disabled={isProcessing || !image.original_url}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCreateWatermark();
                  }}>
                  {isWatermarking ? <LoadingSpinner size="sm" /> : <QrCode className="h-3 w-3" />}
                </Button>

                {image.status === "processed" && image.processed_url && !isWatermarking ? (
                  <button
                    type="button"
                    className="w-full h-full cursor-zoom-in hover:opacity-90 transition-opacity"
                    onClick={() => setLightbox("watermarked")}
                    aria-label={`View watermarked ${image.filename}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.processed_url}
                      alt={`${image.filename} — Watermarked`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ) : isProcessing ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 dark:bg-gray-700 animate-pulse">
                    <LoadingSpinner size="sm" />
                    <span className="text-xs mt-2 text-gray-600 dark:text-gray-300 px-2 text-center">
                      Watermarking…
                    </span>
                  </div>
                ) : image.status === "failed" && !isWatermarking ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/20 px-2">
                    <span className="text-red-500 text-xs text-center font-medium">Processing failed</span>
                    {image.watermark_error && (
                      <span className="text-red-600 dark:text-red-400 text-xs mt-1 text-center line-clamp-3">
                        {image.watermark_error.length > 80
                          ? `${image.watermark_error.slice(0, 80)}…`
                          : image.watermark_error}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 dark:bg-gray-700 px-2">
                    <span className="text-gray-400 text-xs text-center">No watermarked version</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {lightbox && <ImageLightbox image={image} variant={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

export function ImageGrid({images, isLoading, error, onRefresh, onOpenUploadModal, onDelete}: ImageGridProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-500 dark:text-gray-400">Loading images…</p>
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
    <div className="flex flex-wrap gap-6 justify-start">
      {images.map((img) => (
        <ImagePairCard key={img.id} image={img} onDelete={onDelete} onRefresh={onRefresh} />
      ))}
    </div>
  );
}
