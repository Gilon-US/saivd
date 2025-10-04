'use client';

import { Button } from '@/components/ui/button';
import { XIcon, AlertTriangleIcon } from 'lucide-react';

type DeleteConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  videoFilename: string;
  isDeleting?: boolean;
};

export function DeleteConfirmDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  videoFilename,
  isDeleting = false 
}: DeleteConfirmDialogProps) {
  if (!isOpen) {
    return null;
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold text-red-600 dark:text-red-400">
            Delete Video
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
                Are you sure you want to delete this video?
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                <strong>&ldquo;{videoFilename}&rdquo;</strong>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This action cannot be undone. The video file will be permanently deleted from storage and removed from your account.
              </p>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={onConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Video'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
