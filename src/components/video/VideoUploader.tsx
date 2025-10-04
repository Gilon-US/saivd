'use client';

import { useState, useEffect } from 'react';
import FileUploader from '@/components/FileUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useVideoUpload, UploadResult } from '@/hooks/useVideoUpload';
import { v4 as uuidv4 } from 'uuid';

type VideoUploaderProps = {
  onUploadComplete?: (result: UploadResult) => void;
  className?: string;
  maxSize?: number;
};

export function VideoUploader({ 
  onUploadComplete, 
  className = '',
  maxSize = 500 * 1024 * 1024, // 500MB
}: VideoUploaderProps) {
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  
  const { uploadVideo, cancelUpload, uploads } = useVideoUpload();
  
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
    if (!selectedVideo) return;
    
    const id = uuidv4();
    setUploadId(id);
    
    try {
      setError(null);
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
    }
  };
  
  const handleCancel = () => {
    if (uploadId) {
      cancelUpload(uploadId);
      setUploadId(null);
    }
  };
  
  const currentUpload = uploadId ? uploads[uploadId] : null;
  const isUploading = currentUpload?.uploading;
  
  return (
    <div className={`space-y-6 ${className}`}>
      <FileUploader
        accept={{
          'video/*': ['.mp4', '.mov', '.avi', '.webm']
        }}
        maxSize={maxSize}
        onFilesSelected={handleFilesSelected}
      />
      
      {videoPreviewUrl && selectedVideo && (
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
      
      {selectedVideo && !isUploading && (
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={() => setSelectedVideo(null)}>
            Cancel
          </Button>
          <Button onClick={handleUpload}>
            Upload Video
          </Button>
        </div>
      )}
      
      {isUploading && currentUpload && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">Uploading {currentUpload.file.name}</p>
              <p className="text-sm font-medium">{currentUpload.progress}%</p>
            </div>
            <Progress value={currentUpload.progress} className="h-2" />
          </div>
          <Button variant="outline" onClick={handleCancel}>
            Cancel Upload
          </Button>
        </div>
      )}
      
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
