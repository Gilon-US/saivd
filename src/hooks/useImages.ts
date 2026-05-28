import {useState, useEffect, useCallback} from "react";

export type ImageRecord = {
  id: string;
  user_id: string;
  filename: string;
  original_url: string | null;
  // Phase 2 watermark fields. Null until /api/images/confirm completes the
  // sync watermark step (~1-3s after upload). Migration:
  // supabase/migrations/20260528120000_images_watermark_fields.sql
  processed_url: string | null;
  width: number | null;
  height: number | null;
  watermark_error: string | null;
  watermarked_at: string | null;
  file_size: number | null;
  content_type: string | null;
  // Application-enforced enum: uploaded | processing | processed | failed.
  status: string;
  created_at: string;
  updated_at: string;
};

type PaginationInfo = {page: number; limit: number; total: number; totalPages: number};

export function useImages({page = 1, limit = 20, autoFetch = true} = {}) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({page, limit, total: 0, totalPages: 0});

  const fetchImages = useCallback(
    async (options?: {silent?: boolean}) => {
      if (!options?.silent) setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/images?page=${page}&limit=${limit}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message ?? "Failed to fetch images");
        }
        const data = await res.json();
        if (data.success) {
          setImages(data.data.images);
          setPagination(data.data.pagination);
        } else {
          throw new Error(data.error?.message ?? "Failed to fetch images");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "An error occurred");
      } finally {
        if (!options?.silent) setIsLoading(false);
      }
    },
    [page, limit]
  );

  useEffect(() => {
    if (autoFetch) void fetchImages();
  }, [fetchImages, autoFetch]);

  const refresh = useCallback(() => fetchImages(), [fetchImages]);
  const refreshSilently = useCallback(() => fetchImages({silent: true}), [fetchImages]);

  const deleteImage = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/images?id=${id}`, {method: "DELETE", credentials: "include"});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? "Failed to delete image");
      }
      setImages((prev) => prev.filter((img) => img.id !== id));
    },
    []
  );

  return {images, isLoading, error, pagination, refresh, refreshSilently, deleteImage};
}
