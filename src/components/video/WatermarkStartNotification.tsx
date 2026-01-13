'use client';

import { Button } from '@/components/ui/button';
import { XIcon, CheckCircleIcon } from 'lucide-react';
import { useEffect } from 'react';

type WatermarkStartNotificationProps = {
  isOpen: boolean;
  onClose: () => void;
  videoFilename: string;
  autoCloseDelay?: number; // milliseconds, default 4000ms
};

export function WatermarkStartNotification({ 
  isOpen, 
  onClose, 
  videoFilename,
  autoCloseDelay = 4000
}: WatermarkStartNotificationProps) {
  // Auto-close after delay
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      onClose();
    }, autoCloseDelay);

    return () => clearTimeout(timer);
  }, [isOpen, autoCloseDelay, onClose]);

  if (!isOpen) {
    return null;
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 pointer-events-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-3">
            <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            <h2 className="text-xl font-semibold text-green-600 dark:text-green-400">
              Watermark Started
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-200 mb-2">
            The watermarking process has started for:
          </p>
          <p className="font-medium text-gray-900 dark:text-gray-100 mb-4">
            &ldquo;{videoFilename}&rdquo;
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You can track the progress in the watermark thumbnail. The process may take a few moments depending on the video size.
          </p>
        </div>
        
        <div className="flex justify-end p-4 border-t bg-gray-50 dark:bg-gray-900/50">
          <Button onClick={onClose} variant="default">
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}

