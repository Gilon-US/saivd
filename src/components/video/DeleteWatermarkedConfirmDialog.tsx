'use client';

import { Button } from '@/components/ui/button';
import { XIcon, AlertTriangleIcon } from 'lucide-react';

export type DeleteWatermarkedAssetKind = 'video' | 'image';

type DeleteWatermarkedConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  assetFilename: string;
  assetKind?: DeleteWatermarkedAssetKind;
  isDeleting?: boolean;
};

export function DeleteWatermarkedConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  assetFilename,
  assetKind = 'video',
  isDeleting = false,
}: DeleteWatermarkedConfirmDialogProps) {
  if (!isOpen) {
    return null;
  }

  const assetLabel = assetKind === 'image' ? 'Image' : 'Video';
  const assetLabelLower = assetKind === 'image' ? 'image' : 'video';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold text-red-600 dark:text-red-400">
            Delete Watermarked {assetLabel}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isDeleting}>
            <XIcon className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-6">
          <div className="flex items-start space-x-3 mb-4">
            <AlertTriangleIcon className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-medium mb-2">
                Are you sure you want to delete the watermarked version?
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                <strong>&ldquo;{assetFilename}&rdquo;</strong>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This action cannot be undone. The watermarked {assetLabelLower} file will be permanently deleted from
                storage. The original {assetLabelLower} will remain unchanged.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={onClose} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : `Delete Watermarked ${assetLabel}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
