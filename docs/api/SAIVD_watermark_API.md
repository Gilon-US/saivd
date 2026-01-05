# SAIVD Video Watermarking API

A FastAPI-based service for video watermarking and user ID extraction using advanced watermarking techniques.

## Overview

This API provides three main functionalities:
1. **Video Watermarking**: Embed invisible watermarks containing user IDs into videos
2. **User ID Extraction**: Extract user IDs from watermarked videos using frame analysis
3. **Video Prefetch**: Pre-load video frames for efficient extraction operations


## API Endpoints

### 1. Health Check

**GET** `/health`

Check if the API is running properly.

**Response:**
```json
{
  "status": "ok"
}
```

### 2. Video Watermarking

**POST** `/`

Embed an invisible watermark containing a user ID into a video.

**Request Body:**
```json
{
  "input_location": "path/to/input/video.mp4",
  "output_location": "path/to/output/watermarked_video.mp4",
  "local_key": "optional-local-private-key-pem-string",
  "client_key": "client-private-key-pem-string",
  "user_id": 123456789,
  "bucket": "saivd-app",
  "async_request": false,
  "stream": false
}
```

**Parameters:**
- `input_location` (string): Path to the input video file (local path or S3 URL)
- `output_location` (string): Path where the watermarked video will be saved (local path or S3 key)
- `local_key` (string, optional): PEM-encoded local private key for decryption
- `client_key` (string): PEM-encoded client private key for encryption
- `user_id` (integer): User ID to embed in the watermark (9-digit number)
- `bucket` (string, optional): S3 bucket name (default: "saivd-app")
- `async_request` (boolean, optional): Whether to process asynchronously (default: false)
- `stream` (boolean, optional): Whether to use streaming processing (default: false)

**Synchronous Response:**
```json
{
  "status": "completed",
  "output_path": "path/to/output/watermarked_video.mp4",
  "message": "Watermarking completed successfully"
}
```

**Asynchronous Response:**
```json
{
  "status": "processing",
  "message": "Check output at s3://saivd-app/path/to/output/watermarked_video.mp4 once processing is complete.",
  "path": "s3://saivd-app/path/to/output/watermarked_video.mp4"
}
```

### 3. User ID Extraction from Frame

**POST** `/extract_user_id`

Extract a user ID from a specific frame of a watermarked video.

**Request Body:**
```json
{
  "video_name": "watermarked_video",
  "frame_index": 0
}
```

**Parameters:**
- `video_name` (string): Name of the video file (without .mp4 extension)
- `frame_index` (integer, optional): Frame index to analyze (default: 0)

**Response:**
```json
{
  "success": true,
  "user_id": "123456789",
  "frame_index": 0,
  "video_name": "watermarked_video"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Video file not found: videos/watermarked_video.mp4"
}
```

### 4. Queue Status

**GET** `/queue_status`

Get the status of all watermarking jobs in the processing queue.

**Response:**
```json
{
  "timestamp": ["2024-01-01T12:00:00Z", "2024-01-01T12:05:00Z"],
  "jobID": ["job_001", "job_002"],
  "status": ["completed", "processing"],
  "message": ["Watermarking completed successfully", "Processing frame 150/300"],
  "path": ["s3://bucket/output1.mp4", "s3://bucket/output2.mp4"]
}
```

### 5. Clear Queue

**POST** `/clear_queue`

Clear all jobs from the processing queue.

**Response:**
```json
{
  "status": "cleared"
}
```

## Usage Examples

### Watermarking a Video

```python
import requests

# Synchronous watermarking
response = requests.post("http://localhost:8000/", json={
    "input_location": "input_video.mp4",
    "output_location": "watermarked_video.mp4",
    "client_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "user_id": 123456789
})

print(response.json())
```

### Extracting User ID

```python
import requests

# Extract user ID from first frame
response = requests.post("http://localhost:8000/extract_user_id", json={
    "video_name": "watermarked_video",
    "frame_index": 0
})

result = response.json()
if result["success"]:
    print(f"Extracted User ID: {result['user_id']}")
```

### Asynchronous Processing

```python
import requests
import time

# Start async watermarking
response = requests.post("http://localhost:8000/", json={
    "input_location": "large_video.mp4",
    "output_location": "output.mp4",
    "client_key": "...",
    "user_id": 123456789,
    "async_request": True
})

job_info = response.json()
print(f"Job started: {job_info['message']}")

# Check queue status
while True:
    queue_response = requests.get("http://localhost:8000/queue_status")
    queue_data = queue_response.json()
    if queue_data.get("status") and "completed" in queue_data["status"]:
        print("Watermarking completed!")
        break
    time.sleep(5)
```

## Video Prefetch for Frame Extraction

The API automatically caches Y-channel frames when extracting user IDs. This means:

1. **First extraction** from a video: Frames are loaded and cached (may take time)
2. **Subsequent extractions** from the same video: Frames are served from cache (fast)

### Benefits:
- Faster subsequent extractions from the same video
- Reduced I/O operations
- Better performance for multiple frame analyses

### Cache Management:
- Videos are cached in memory as numpy arrays
- Cache persists for the lifetime of the API process
- No manual cache clearing needed (automatically managed)

## Error Handling

The API provides detailed error messages for common issues:

- **400 Bad Request**: Invalid input parameters, missing required fields
- **404 Not Found**: Video file not found
- **500 Internal Server Error**: Processing errors, file I/O issues
