"use client";

import type {ImageViewResult} from "@/lib/image-view-url";

type PublicImageViewProps = {
  imageId: string;
  result: ImageViewResult;
  embed?: boolean;
};

export function PublicImageView({imageId, result, embed = false}: PublicImageViewProps) {
  const shellClass = embed
    ? "relative flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-900"
    : "relative flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-900";

  if (!result.ok) {
    if (result.status === 404) {
      return (
        <div className={shellClass}>
          <p className="text-sm text-gray-600 dark:text-gray-400">Image not found</p>
        </div>
      );
    }

    return (
      <div className={shellClass}>
        <p className="text-sm text-red-600 dark:text-red-400">{result.message}</p>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="relative inline-block max-h-full max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-saivd-public-image={imageId}
          src={result.viewUrl}
          alt="Verified image"
          crossOrigin="anonymous"
          fetchPriority="high"
          className="block max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>
  );
}
