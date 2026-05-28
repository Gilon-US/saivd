"use client";

import {useState} from "react";
import {Button} from "@/components/ui/button";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {ImageIcon, TrashIcon, UploadIcon} from "lucide-react";
import type {ImageRecord} from "@/hooks/useImages";

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
          {image.original_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.original_url}
              alt={image.filename}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <ImageIcon className="w-10 h-10" />
            </div>
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

      {/* Lightbox */}
      {lightbox && image.original_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.original_url}
            alt={image.filename}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
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
