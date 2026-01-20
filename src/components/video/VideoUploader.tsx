'use client';

import { useState, useEffect } from 'react';
import FileUploader from '@/components/FileUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useVideoUpload, UploadResult, UploadPhase } from '@/hooks/useVideoUpload';
import { v4 as uuidv4 } from 'uuid';
import { UploadIcon, CheckCircleIcon, AlertCircleIcon, AlertTriangleIcon } from 'lucide-react';

export type Video = {
  id: string;
  filename: string;
  original_url: string;
  original_thumbnail_url: string;
  preview_thumbnail_data: string | null;
  processed_url: string | null;
  processed_thumbnail_url: string | null;
  status: "uploaded" | "processing" | "processed" | "failed";
  upload_date: string;
};

type VideoUploaderProps = {
  onUploadComplete?: (result: UploadResult) => void;
  className?: string;
  maxSize?: number;
  existingVideos?: Video[];
};

export function VideoUploader({ 
  onUploadComplete, 
  className = '',
  maxSize = 500 * 1024 * 1024, // 500MB
  existingVideos = [],
}: VideoUploaderProps) {
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const { uploadVideo, cancelUpload, uploads } = useVideoUpload();
  
  // Check if selected video filename already exists
  const hasDuplicateFilename = selectedVideo 
    ? existingVideos.some(video => video.filename === selectedVideo.name)
    : false;
  
  // Generate video thumbnail when a video is selected
  useEffect(() => {
    if (!selectedVideo) {
      setVideoPreviewUrl(null);
      return;
    }
    
    // Create a preview URL for the video
    const url = URL.createObjectURL(selectedVideo);
    setVideoPreviewUrl(url);
    
    // Clean up the URL when component unmounts or video changes
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedVideo]);
  
  const handleFilesSelected = (files: File[]) => {
    const videoFile = files.length > 0 ? files[0] : null;
    setSelectedVideo(videoFile);
    setError(null);
    setUploadId(null);
  };
  
  const handleUpload = async () => {
    if (!selectedVideo || isUploading || hasDuplicateFilename) return;
    
    const id = uuidv4();
    setUploadId(id);
    setIsUploading(true);
    setError(null);
    
    try {
      const result = await uploadVideo(selectedVideo);
      
      if (onUploadComplete) {
        onUploadComplete(result);
      }
    } catch (err: unknown) {
      // Only set error if it's not an abort error (user cancelled)
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'An error occurred during upload');
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        setError((err as { message: string }).message || 'An error occurred during upload');
      } else {
        setError('An unknown error occurred during upload');
      }
    } finally {
      setIsUploading(false);
      setUploadId(null);
    }
  };
  
  const handleCancel = () => {
    if (uploadId) {
      cancelUpload(uploadId);
      setUploadId(null);
      setIsUploading(false);
    }
  };
  
  const currentUpload = uploadId ? uploads[uploadId] : null;
  // Use local isUploading state OR check currentUpload if available
  const uploading = isUploading || (currentUpload?.uploading ?? false);
  
  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };
  
  // Helper function to format upload speed
  const formatSpeed = (bytesPerSecond?: number): string => {
    if (!bytesPerSecond) return '';
    return formatFileSize(bytesPerSecond) + '/s';
  };
  
  // Helper function to format time remaining
  const formatTimeRemaining = (seconds?: number): string => {
    if (!seconds || seconds === Infinity || isNaN(seconds)) return '';
    if (seconds < 60) return `${Math.round(seconds)}s remaining`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s remaining`;
  };
  
  // Get phase message
  const getPhaseMessage = (phase: UploadPhase): string => {
    switch (phase) {
      case 'preparing':
        return 'Preparing video...';
      case 'requesting-url':
        return 'Requesting upload URL...';
      case 'uploading':
        return 'Uploading video...';
      case 'confirming':
        return 'Finalizing upload...';
      case 'complete':
        return 'Upload complete!';
      case 'error':
        return 'Upload failed';
      default:
        return 'Processing...';
    }
  };
  
  return (
    <div className={`space-y-6 ${className}`}>
      <FileUploader
        accept={{
          'video/*': ['.mp4', '.mov', '.avi', '.webm']
        }}
        maxSize={maxSize}
        onFilesSelected={handleFilesSelected}
      />
      
      {videoPreviewUrl && selectedVideo && !uploading && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-2">Video Preview</h3>
            <div className="aspect-video relative overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
              <video
                controls
                className="w-full h-full object-contain"
                src={videoPreviewUrl}
              >
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {selectedVideo.name} ({(selectedVideo.size / (1024 * 1024)).toFixed(2)} MB)
            </div>
          </CardContent>
        </Card>
      )}
      
      {selectedVideo && (
        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => setSelectedVideo(null)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleUpload}
            disabled={uploading || hasDuplicateFilename}
          >
            {uploading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <UploadIcon className="mr-2 h-4 w-4" />
                Upload Now
              </>
            )}
          </Button>
        </div>
      )}
      
      {uploading && currentUpload && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Phase indicator with spinner */}
              <div className="flex items-center space-x-3">
                {currentUpload.phase === 'complete' ? (
                  <CheckCircleIcon className="h-5 w-5 text-green-500" />
                ) : currentUpload.phase === 'error' ? (
                  <AlertCircleIcon className="h-5 w-5 text-red-500" />
                ) : (
                  <LoadingSpinner size="sm" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    {getPhaseMessage(currentUpload.phase)}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {currentUpload.file.name}
                  </p>
                </div>
              </div>
              
              {/* Progress bar - show for uploading phase or when progress > 0 */}
              {(currentUpload.phase === 'uploading' || currentUpload.progress > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {currentUpload.progress}%
                    </span>
                    {currentUpload.bytesUploaded && currentUpload.totalBytes && (
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatFileSize(currentUpload.bytesUploaded)} / {formatFileSize(currentUpload.totalBytes)}
                      </span>
                    )}
                  </div>
                  <Progress value={currentUpload.progress} className="h-2" />
                  
                  {/* Upload speed and time remaining */}
                  {(currentUpload.uploadSpeed || currentUpload.timeRemaining) && (
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      {currentUpload.uploadSpeed && (
                        <span>Speed: {formatSpeed(currentUpload.uploadSpeed)}</span>
                      )}
                      {currentUpload.timeRemaining && (
                        <span>{formatTimeRemaining(currentUpload.timeRemaining)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Indeterminate progress for non-uploading phases */}
              {currentUpload.phase !== 'uploading' && currentUpload.progress === 0 && currentUpload.phase !== 'complete' && currentUpload.phase !== 'error' && (
                <div className="space-y-2">
                  <Progress value={null} className="h-2" />
                  <p className="text-xs text-gray-500">
                    {currentUpload.phase === 'preparing' && 'Generating thumbnail...'}
                    {currentUpload.phase === 'requesting-url' && 'Getting upload URL...'}
                    {currentUpload.phase === 'confirming' && 'Confirming upload...'}
                  </p>
                </div>
              )}
              
              {/* Cancel button - only show if not complete or error */}
              {currentUpload.phase !== 'complete' && currentUpload.phase !== 'error' && (
                <div className="flex justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={handleCancel}>
                    Cancel Upload
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {hasDuplicateFilename && selectedVideo && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>
            You cannot upload a file with the filename <strong>&ldquo;{selectedVideo.name}&rdquo;</strong> because you already have a video with this name in your video list. 
            Please select a different file or rename the file before uploading.
          </AlertDescription>
        </Alert>
      )}
      
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
