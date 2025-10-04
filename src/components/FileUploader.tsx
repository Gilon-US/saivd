'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UploadIcon, XIcon, FileIcon } from 'lucide-react';
// Import statements

type FileUploaderProps = {
  accept?: Record<string, string[]>;
  maxSize?: number;
  maxFiles?: number;
  onFilesSelected: (files: File[]) => void;
  className?: string;
};

export default function FileUploader({
  accept = {
    'video/*': ['.mp4', '.mov', '.avi', '.webm']
  },
  maxSize = 500 * 1024 * 1024, // 500MB
  maxFiles = 1,
  onFilesSelected,
  className = '',
}: FileUploaderProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    // Handle file rejections
    if (fileRejections.length > 0) {
      const rejection = fileRejections[0];
      if (rejection.errors[0].code === 'file-too-large') {
        setError(`File is too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`);
      } else if (rejection.errors[0].code === 'file-invalid-type') {
        setError('Invalid file type. Please upload a video file.');
      } else {
        setError(rejection.errors[0].message);
      }
      return;
    }
    
    // Clear previous error
    setError(null);
    
    // Update selected files
    setSelectedFiles(acceptedFiles);
    
    // Call parent callback
    onFilesSelected(acceptedFiles);
  }, [maxSize, onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    maxFiles,
  });
  
  const removeFile = (index: number) => {
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {selectedFiles.length === 0 ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-primary/50'
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center space-y-2">
            <UploadIcon className="h-10 w-10 text-gray-400" />
            <p className="text-lg font-medium">
              {isDragActive ? 'Drop the file here' : 'Drag & drop a file here'}
            </p>
            <p className="text-sm text-gray-500">
              or click to select a file
            </p>
            <p className="text-xs text-gray-400">
              Maximum file size: {maxSize / (1024 * 1024)}MB
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {selectedFiles.map((file, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-primary/10 p-2 rounded-md">
                    <FileIcon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(file.size)} • {file.type}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(index)}
                  aria-label="Remove file"
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedFiles([]);
                onFilesSelected([]);
              }}
            >
              Clear selection
            </Button>
          </div>
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