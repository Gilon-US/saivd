import {useState, useEffect, useCallback} from "react";
import {Video} from "@/components/video/VideoGrid";

type UseVideosOptions = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  autoFetch?: boolean;
};

type PaginationInfo = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function useVideos({
  page = 1,
  limit = 20,
  sortBy = "upload_date",
  sortOrder = "desc",
  autoFetch = true,
}: UseVideosOptions = {}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page,
    limit,
    total: 0,
    totalPages: 0,
  });

  const fetchVideos = useCallback(
    async (options?: {silent?: boolean}) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const queryParams = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
          sortBy,
          sortOrder,
        });

        const response = await fetch(`/api/videos?${queryParams}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || "Failed to fetch videos");
        }

        const data = await response.json();

        if (data.success) {
          setVideos(data.data.videos);
          setPagination(data.data.pagination);
        } else {
          throw new Error(data.error?.message || "Failed to fetch videos");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred while fetching videos");
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [page, limit, sortBy, sortOrder]
  );

  useEffect(() => {
    if (autoFetch) {
      void fetchVideos();
    }
  }, [fetchVideos, autoFetch]);

  const refresh = useCallback(() => fetchVideos(), [fetchVideos]);
  const refreshSilently = useCallback(() => fetchVideos({silent: true}), [fetchVideos]);

  return {
    videos,
    isLoading,
    error,
    pagination,
    refresh,
    refreshSilently,
  };
}
