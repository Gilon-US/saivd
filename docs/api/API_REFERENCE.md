# SAIVD Video Watermarking API - API Reference

This document provides complete API endpoint specifications for implementing client code. All endpoints return JSON responses and use standard HTTP status codes.

## Base Information

- **Base URL**: `http://localhost:8000` (development) or your production server URL
- **Content-Type**: `application/json`
- **Protocol**: HTTP/HTTPS
- **Authentication**: None (API keys should be managed via RSA keys in request body)

## Common Response Formats

### Success Response
All successful responses return JSON with relevant data fields.

### Error Response
All errors return JSON with the following structure:
```json
{
  "detail": "Error message describing what went wrong"
}
```

### HTTP Status Codes
- `200 OK`: Request successful
- `400 Bad Request`: Invalid input parameters or missing required fields
- `500 Internal Server Error`: Server-side processing error

---

## Endpoints

### 1. Health Check

Check if the API server is running and responsive.

**Endpoint**: `GET /health`

**Request**: No request body required

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

**Example Request**:
```bash
curl http://localhost:8000/health
```

**Example Response**:
```json
{
  "status": "ok"
}
```

---

### 2. Watermark Video

Embed an invisible watermark containing a user ID into a video file.

**Endpoint**: `POST /`

**Request Body Schema**:
```typescript
{
  input_location: string;          // Required: S3 key or local path to input video
  output_location: string;         // Required: S3 key or local path for output video
  client_key: string;              // Required: PEM-encoded RSA private key
  local_key?: string;               // Optional: PEM-encoded RSA private key for extraction
  user_id: number | string;        // Required: 9-digit user ID to embed
  bucket?: string;                  // Optional: S3 bucket name (default: "saivd-app")
  async_request?: boolean;           // Optional: Process asynchronously (default: false)
  stream?: boolean;                  // Optional: Use streaming mode (default: false)
}
```

**Request Body Example**:
```json
{
  "input_location": "videos/input_video.mp4",
  "output_location": "videos/watermarked_video.mp4",
  "client_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----",
  "local_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQD...\n-----END PRIVATE KEY-----",
  "user_id": 123456789,
  "bucket": "saivd-app",
  "async_request": false,
  "stream": false
}
```

**Synchronous Response** (200 OK):
```json
{
  "status": "completed",
  "output_path": "s3://saivd-app/videos/watermarked_video.mp4",
  "message": "Watermarking completed successfully"
}
```

**Asynchronous Response** (200 OK):
```json
{
  "status": "processing",
  "message": "Check output at s3://saivd-app/videos/watermarked_video.mp4 once processing is complete.",
  "path": "s3://saivd-app/videos/watermarked_video.mp4"
}
```

**Error Responses**:

**400 Bad Request** - Invalid user_id:
```json
{
  "detail": "Invalid user_id"
}
```

**400 Bad Request** - Missing required fields:
```json
{
  "detail": "Please pass video input and output locations in the request body"
}
```

**400 Bad Request** - Invalid RSA key:
```json
{
  "detail": "Invalid RSA key format: [error details]"
}
```

**400 Bad Request** - Watermarking process error:
```json
{
  "detail": "Error during watermarking process: [error details]"
}
```

**500 Internal Server Error**:
```json
{
  "detail": "Error: [error details]"
}
```

**Example Request (Synchronous)**:
```python
import requests

response = requests.post(
    "http://localhost:8000/",
    json={
        "input_location": "videos/input.mp4",
        "output_location": "videos/output.mp4",
        "client_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
        "user_id": 123456789,
        "bucket": "saivd-app",
        "async_request": False,
        "stream": False
    }
)

if response.status_code == 200:
    result = response.json()
    print(f"Status: {result['status']}")
    print(f"Output: {result.get('output_path', result.get('path'))}")
else:
    print(f"Error: {response.json()['detail']}")
```

**Example Request (Asynchronous)**:
```python
import requests
import time

# Start async job
response = requests.post(
    "http://localhost:8000/",
    json={
        "input_location": "videos/large_video.mp4",
        "output_location": "videos/output.mp4",
        "client_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
        "user_id": 123456789,
        "bucket": "saivd-app",
        "async_request": True,
        "stream": True
    }
)

job_info = response.json()
print(f"Job started: {job_info['message']}")
print(f"Output path: {job_info['path']}")

# Poll queue status (see queue_status endpoint)
```

**Notes**:
- `user_id` can be provided as integer or string (will be converted to integer)
- `input_location` and `output_location` are S3 keys when `bucket` is provided, otherwise local paths
- `async_request=true` returns immediately with job status; use `/queue_status/{user_id}` to check progress
- `stream=true` uses memory-efficient streaming mode (recommended for large videos)
- RSA keys must be PEM-encoded strings (include `\n` for line breaks in JSON)

---

### 3. Extract User ID

Extract a user ID from a specific frame of a watermarked video.

**Endpoint**: `POST /extract_user_id`

**Request Body Schema**:
```typescript
{
  video_name: string;      // Required: Video filename (without .mp4 extension) or S3 key
  frame_index?: number;    // Optional: Frame index to analyze (default: 0)
  bucket?: string;         // Optional: S3 bucket name (default: "saivd-app")
}
```

**Request Body Example**:
```json
{
  "video_name": "watermarked_video",
  "frame_index": 0,
  "bucket": "saivd-app"
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "user_id": "123456789",
  "frame_index": 0,
  "video_name": "watermarked_video"
}
```

**Error Responses**:

**400 Bad Request** - Missing video name:
```json
{
  "detail": "No video name provided"
}
```

**500 Internal Server Error** - Video loading failed:
```json
{
  "detail": "Failed to load video frames: Could not download video watermarked_video.mp4 from bucket saivd-app: [S3 error details]"
}
```

**500 Internal Server Error** - Extraction failed:
```json
{
  "detail": "Error: [extraction error details]"
}
```

**Example Request**:
```python
import requests

response = requests.post(
    "http://localhost:8000/extract_user_id",
    json={
        "video_name": "watermarked_video",
        "frame_index": 0,
        "bucket": "saivd-app"
    }
)

if response.status_code == 200:
    result = response.json()
    if result["success"]:
        print(f"Extracted User ID: {result['user_id']}")
        print(f"From frame: {result['frame_index']}")
    else:
        print("Extraction failed")
else:
    print(f"Error: {response.json()['detail']}")
```

**Notes**:
- `video_name` can be just the filename (e.g., "watermarked_video") or full S3 key path
- `frame_index` is automatically adjusted based on video FPS: `frame_index // min(30, fps)`
- First extraction from a video may take longer (downloads and processes video)
- Subsequent extractions from the same video are faster (uses cached frames)
- The API caches Y-channel frames in memory for faster repeated extractions

---

### 4. Get Queue Status

Get the status of all watermarking jobs for a specific user ID.

**Endpoint**: `GET /queue_status/{user_id}`

**Path Parameters**:
- `user_id` (string or integer): User ID to filter jobs

**Request**: No request body required

**Success Response** (200 OK):
```json
{
  "timestamp": ["01_01_2024_12_00_00", "01_01_2024_12_05_00"],
  "jobID": [0, 1],
  "status": ["processing", "success"],
  "message": ["50.00%", "Watermarked video"],
  "path": ["s3://saivd-app/output1.mp4", "s3://saivd-app/output2.mp4"],
  "user_id": ["123456789", "123456789"]
}
```

**Empty Response** (200 OK) - No jobs found:
```json
{
  "timestamp": [],
  "jobID": [],
  "status": [],
  "message": [],
  "path": [],
  "user_id": []
}
```

**Example Request**:
```python
import requests

user_id = 123456789
response = requests.get(f"http://localhost:8000/queue_status/{user_id}")

if response.status_code == 200:
    queue_data = response.json()
    for i in range(len(queue_data["jobID"])):
        print(f"Job {queue_data['jobID'][i]}: {queue_data['status'][i]}")
        print(f"  Message: {queue_data['message'][i]}")
        print(f"  Path: {queue_data['path'][i]}")
```

**Notes**:
- Returns only jobs matching the specified `user_id`
- All arrays in the response have the same length (one entry per job)
- `status` values: "processing", "success", "failed"
- `message` contains progress percentage (e.g., "50.00%") or completion message
- `timestamp` format: "MM_DD_YYYY_HH_MM_SS"

---

### 5. Clear Queue

Remove all jobs for a specific user ID from the processing queue.

**Endpoint**: `POST /clear_queue`

**Request Body Schema**:
```typescript
{
  user_id: number;  // Required: User ID whose jobs should be cleared
}
```

**Request Body Example**:
```json
{
  "user_id": 123456789
}
```

**Success Response** (200 OK):
```json
{
  "status": "cleared",
  "items_removed": 3
}
```

**No Items Response** (200 OK):
```json
{
  "status": "no items to clear"
}
```

**Example Request**:
```python
import requests

response = requests.post(
    "http://localhost:8000/clear_queue",
    json={
        "user_id": 123456789
    }
)

if response.status_code == 200:
    result = response.json()
    print(f"Status: {result['status']}")
    if "items_removed" in result:
        print(f"Removed {result['items_removed']} items")
```

**Notes**:
- Only removes jobs matching the specified `user_id`
- Does not affect jobs from other users
- Removed jobs cannot be recovered

---

## Complete Client Implementation Example

### Python Client

```python
import requests
import time
from typing import Optional, Dict, Any

class SAIVDWatermarkingClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip('/')
    
    def health_check(self) -> bool:
        """Check if API is healthy."""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            return response.status_code == 200 and response.json().get("status") == "ok"
        except Exception as e:
            print(f"Health check failed: {e}")
            return False
    
    def watermark_video(
        self,
        input_location: str,
        output_location: str,
        client_key: str,
        user_id: int,
        local_key: Optional[str] = None,
        bucket: str = "saivd-app",
        async_request: bool = False,
        stream: bool = False
    ) -> Dict[str, Any]:
        """
        Watermark a video with a user ID.
        
        Returns:
            Dict with status, message, and path (for async) or output_path (for sync)
        """
        payload = {
            "input_location": input_location,
            "output_location": output_location,
            "client_key": client_key,
            "user_id": user_id,
            "bucket": bucket,
            "async_request": async_request,
            "stream": stream
        }
        
        if local_key:
            payload["local_key"] = local_key
        
        response = requests.post(f"{self.base_url}/", json=payload)
        response.raise_for_status()
        return response.json()
    
    def extract_user_id(
        self,
        video_name: str,
        frame_index: int = 0,
        bucket: str = "saivd-app"
    ) -> Optional[str]:
        """
        Extract user ID from a watermarked video frame.
        
        Returns:
            User ID as string, or None if extraction failed
        """
        payload = {
            "video_name": video_name,
            "frame_index": frame_index,
            "bucket": bucket
        }
        
        response = requests.post(f"{self.base_url}/extract_user_id", json=payload)
        response.raise_for_status()
        result = response.json()
        
        if result.get("success"):
            return result.get("user_id")
        return None
    
    def get_queue_status(self, user_id: int) -> Dict[str, Any]:
        """Get queue status for a user ID."""
        response = requests.get(f"{self.base_url}/queue_status/{user_id}")
        response.raise_for_status()
        return response.json()
    
    def clear_queue(self, user_id: int) -> Dict[str, Any]:
        """Clear queue for a user ID."""
        response = requests.post(
            f"{self.base_url}/clear_queue",
            json={"user_id": user_id}
        )
        response.raise_for_status()
        return response.json()
    
    def watermark_video_and_wait(
        self,
        input_location: str,
        output_location: str,
        client_key: str,
        user_id: int,
        local_key: Optional[str] = None,
        bucket: str = "saivd-app",
        stream: bool = False,
        poll_interval: int = 5,
        timeout: int = 3600
    ) -> Dict[str, Any]:
        """
        Watermark a video asynchronously and wait for completion.
        
        Args:
            poll_interval: Seconds between queue status checks
            timeout: Maximum seconds to wait
        
        Returns:
            Final job status dict
        """
        # Start async job
        result = self.watermark_video(
            input_location=input_location,
            output_location=output_location,
            client_key=client_key,
            user_id=user_id,
            local_key=local_key,
            bucket=bucket,
            async_request=True,
            stream=stream
        )
        
        start_time = time.time()
        
        # Poll until complete
        while time.time() - start_time < timeout:
            queue_status = self.get_queue_status(user_id)
            
            # Find our job
            job_ids = queue_status.get("jobID", [])
            statuses = queue_status.get("status", [])
            
            for i, job_id in enumerate(job_ids):
                status = statuses[i]
                if status == "success":
                    return {
                        "status": "completed",
                        "path": queue_status["path"][i],
                        "message": queue_status["message"][i]
                    }
                elif status == "failed":
                    return {
                        "status": "failed",
                        "message": queue_status["message"][i]
                    }
            
            time.sleep(poll_interval)
        
        raise TimeoutError("Watermarking job did not complete within timeout period")


# Usage example
if __name__ == "__main__":
    client = SAIVDWatermarkingClient("http://localhost:8000")
    
    # Check health
    if not client.health_check():
        print("API is not healthy")
        exit(1)
    
    # Watermark video (synchronous)
    try:
        result = client.watermark_video(
            input_location="videos/input.mp4",
            output_location="videos/output.mp4",
            client_key="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
            user_id=123456789,
            bucket="saivd-app"
        )
        print(f"Watermarking completed: {result}")
    except requests.exceptions.HTTPError as e:
        print(f"Error: {e.response.json()}")
    
    # Extract user ID
    try:
        user_id = client.extract_user_id("output", frame_index=0)
        print(f"Extracted user ID: {user_id}")
    except requests.exceptions.HTTPError as e:
        print(f"Error: {e.response.json()}")
```

### JavaScript/TypeScript Client

```typescript
interface WatermarkRequest {
  input_location: string;
  output_location: string;
  client_key: string;
  local_key?: string;
  user_id: number | string;
  bucket?: string;
  async_request?: boolean;
  stream?: boolean;
}

interface WatermarkResponse {
  status: "completed" | "processing";
  output_path?: string;
  path?: string;
  message: string;
}

interface ExtractRequest {
  video_name: string;
  frame_index?: number;
  bucket?: string;
}

interface ExtractResponse {
  success: boolean;
  user_id: string | null;
  frame_index: number;
  video_name: string;
}

interface QueueStatus {
  timestamp: string[];
  jobID: number[];
  status: string[];
  message: string[];
  path: string[];
  user_id: string[];
}

class SAIVDWatermarkingClient {
  constructor(private baseUrl: string = "http://localhost:8000") {}
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const data = await response.json();
      return data.status === "ok";
    } catch (error) {
      console.error("Health check failed:", error);
      return false;
    }
  }
  
  async watermarkVideo(request: WatermarkRequest): Promise<WatermarkResponse> {
    const response = await fetch(`${this.baseUrl}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Watermarking failed");
    }
    
    return response.json();
  }
  
  async extractUserId(request: ExtractRequest): Promise<ExtractResponse> {
    const response = await fetch(`${this.baseUrl}/extract_user_id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Extraction failed");
    }
    
    return response.json();
  }
  
  async getQueueStatus(userId: number): Promise<QueueStatus> {
    const response = await fetch(`${this.baseUrl}/queue_status/${userId}`);
    
    if (!response.ok) {
      throw new Error("Failed to get queue status");
    }
    
    return response.json();
  }
  
  async clearQueue(userId: number): Promise<{ status: string; items_removed?: number }> {
    const response = await fetch(`${this.baseUrl}/clear_queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId })
    });
    
    if (!response.ok) {
      throw new Error("Failed to clear queue");
    }
    
    return response.json();
  }
}

// Usage
const client = new SAIVDWatermarkingClient("http://localhost:8000");

client.watermarkVideo({
  input_location: "videos/input.mp4",
  output_location: "videos/output.mp4",
  client_key: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
  user_id: 123456789,
  bucket: "saivd-app"
}).then(result => {
  console.log("Watermarking result:", result);
}).catch(error => {
  console.error("Error:", error);
});
```

---

## Important Notes for Client Developers

### 1. RSA Key Format
- RSA keys must be PEM-encoded strings
- Include newline characters (`\n`) in JSON strings
- Example: `"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----"`

### 2. Video Paths
- When `bucket` is provided, paths are S3 keys (e.g., `"videos/input.mp4"`)
- When `bucket` is `null` or not provided, paths are local file system paths
- S3 keys should not include `s3://` prefix in `input_location`/`output_location`

### 3. Async Processing
- Use `async_request=true` for long-running jobs
- Poll `/queue_status/{user_id}` to check progress
- Status values: "processing", "success", "failed"
- Message contains progress percentage or completion message

### 4. Frame Index Adjustment
- The `frame_index` in extraction is automatically adjusted: `frame_index // min(30, fps)`
- For 30fps video, frame_index 0-29 all map to frame 0
- For 60fps video, frame_index 0-59 all map to frame 0

### 5. Error Handling
- Always check HTTP status codes
- Parse `detail` field from error responses
- Common errors:
  - 400: Invalid input (check required fields, key formats, user_id)
  - 500: Server error (video processing, S3 access, etc.)

### 6. Timeouts
- Synchronous watermarking can take several minutes for large videos
- Set appropriate HTTP client timeouts (recommended: 5-10 minutes)
- For async requests, use polling with reasonable intervals (5-10 seconds)

### 7. Caching Behavior
- First extraction from a video downloads and processes the video
- Subsequent extractions use cached frames (much faster)
- Cache is per-process (cleared on server restart)

---

## Testing Checklist

When implementing a client, test the following scenarios:

- [ ] Health check endpoint
- [ ] Synchronous watermarking (small video)
- [ ] Asynchronous watermarking (large video)
- [ ] Queue status polling
- [ ] User ID extraction (first frame)
- [ ] User ID extraction (different frame)
- [ ] Error handling (invalid user_id)
- [ ] Error handling (invalid RSA key)
- [ ] Error handling (missing video)
- [ ] Queue clearing
- [ ] Streaming mode vs batch mode
- [ ] S3 bucket operations
- [ ] Local file operations (if supported)

---

**API Version**: 1.0  
**Last Updated**: 2024  
**Base URL**: Configurable (default: `http://localhost:8000`)
