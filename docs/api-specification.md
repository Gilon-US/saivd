# SAVD App - API Specification

This document provides detailed specifications for the SAVD App API endpoints, including request/response formats, authentication requirements, and error handling.

## Base URL

All API endpoints are relative to the base URL of your application:

- Development: `http://localhost:3000/api`
- Production: `https://your-domain.com/api`

## Authentication

Most API endpoints require authentication using a JWT token provided by Supabase Auth. The token should be included in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

## Common Response Formats

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "error_code",
    "message": "Human-readable error message",
    "details": { ... } // Optional additional details
  }
}
```

## Common Error Codes

- `unauthorized`: Authentication required or token invalid
- `forbidden`: User doesn't have permission for the requested resource
- `not_found`: Requested resource not found
- `validation_error`: Request validation failed
- `server_error`: Internal server error
- `service_unavailable`: External service unavailable

## API Endpoints

### Authentication

#### GET /api/auth/user

Get the current authenticated user's information.

**Authentication Required**: Yes

**Request**: No parameters

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "displayName": "User Name",
    "avatarUrl": "https://example.com/avatar.jpg"
  }
}
```

### Video Management

#### GET /api/videos

Get a list of videos for the authenticated user.

**Authentication Required**: Yes

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `status` (optional): Filter by watermark status (all, pending, processing, completed, error)

**Response**:
```json
{
  "success": true,
  "data": {
    "videos": [
      {
        "id": "video-uuid",
        "filename": "example.mp4",
        "filesize": 1024000,
        "originalUrl": "https://storage.example.com/videos/original.mp4",
        "originalThumbnailUrl": "https://storage.example.com/thumbnails/original.jpg",
        "uploadDate": "2025-09-20T10:00:00Z",
        "watermarkedVideo": {
          "id": "watermarked-video-uuid",
          "watermarkedUrl": "https://storage.example.com/videos/watermarked.mp4",
          "watermarkedThumbnailUrl": "https://storage.example.com/thumbnails/watermarked.jpg",
          "status": "completed",
          "watermarkDate": "2025-09-20T10:05:00Z",
          "hasPublicAccess": true,
          "publicAccessToken": "abc123"
        }
      }
    ],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 20,
      "totalPages": 3
    }
  }
}
```

#### GET /api/videos/:id

Get details for a specific video.

**Authentication Required**: Yes

**URL Parameters**:
- `id`: Video UUID

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "video-uuid",
    "filename": "example.mp4",
    "filesize": 1024000,
    "contentType": "video/mp4",
    "originalUrl": "https://storage.example.com/videos/original.mp4",
    "originalThumbnailUrl": "https://storage.example.com/thumbnails/original.jpg",
    "uploadDate": "2025-09-20T10:00:00Z",
    "watermarkedVideo": {
      "id": "watermarked-video-uuid",
      "watermarkedUrl": "https://storage.example.com/videos/watermarked.mp4",
      "watermarkedThumbnailUrl": "https://storage.example.com/thumbnails/watermarked.jpg",
      "status": "completed",
      "watermarkDate": "2025-09-20T10:05:00Z"
    }
  }
}
```

#### POST /api/videos/upload

Get a pre-signed URL for uploading a video to Wasabi storage.

**Authentication Required**: Yes

**Request Body**:
```json
{
  "filename": "example.mp4",
  "contentType": "video/mp4",
  "filesize": 1024000
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://your-bucket.s3.your-region.wasabisys.com",
    "fields": {
      "key": "uploads/user-uuid/timestamp-example.mp4",
      "Content-Type": "video/mp4",
      "Policy": "base64-encoded-policy",
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": "credential-string",
      "X-Amz-Date": "20250920T000000Z",
      "X-Amz-Signature": "signature-string"
    },
    "key": "uploads/user-uuid/timestamp-example.mp4"
  }
}
```

#### POST /api/videos/confirm

Confirm a successful upload and create the video record in the database.

**Authentication Required**: Yes

**Request Body**:
```json
{
  "key": "uploads/user-uuid/timestamp-example.mp4",
  "filename": "example.mp4",
  "filesize": 1024000,
  "contentType": "video/mp4"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "video-uuid",
    "filename": "example.mp4",
    "originalUrl": "https://your-bucket.s3.your-region.wasabisys.com/uploads/user-uuid/timestamp-example.mp4",
    "originalThumbnailUrl": "https://your-bucket.s3.your-region.wasabisys.com/thumbnails/user-uuid/timestamp-example.jpg"
  }
}
```

#### DELETE /api/videos/:id

Delete a video and its watermarked version.

**Authentication Required**: Yes

**URL Parameters**:
- `id`: Video UUID

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Video deleted successfully"
  }
}
```

### Watermarking

#### POST /api/videos/:id/watermark

Request watermarking for a video.

**Authentication Required**: Yes

**URL Parameters**:
- `id`: Video UUID

**Request Body**:
```json
{
  "options": {
    "position": "center", // Optional watermark position
    "opacity": 0.5 // Optional watermark opacity
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "watermarked-video-uuid",
    "status": "processing",
    "message": "Watermarking process started"
  }
}
```

#### GET /api/videos/:id/watermark/status

Check the status of a watermarking job.

**Authentication Required**: Yes

**URL Parameters**:
- `id`: Video UUID

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "watermarked-video-uuid",
    "status": "processing",
    "progress": 50, // Optional progress percentage if available
    "startedAt": "2025-09-20T10:00:00Z",
    "estimatedCompletionTime": "2025-09-20T10:05:00Z" // Optional
  }
}
```

#### DELETE /api/videos/:id/watermark

Delete the watermarked version of a video.

**Authentication Required**: Yes

**URL Parameters**:
- `id`: Video UUID

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Watermarked version deleted successfully"
  }
}
```

### Public Sharing

#### POST /api/videos/:id/public-url

Generate a public URL for a watermarked video.

**Authentication Required**: Yes

**URL Parameters**:
- `id`: Video UUID

**Request Body**:
```json
{
  "expiresIn": 2592000 // Optional expiration in seconds (default: 30 days)
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "token": "secure-random-token",
    "publicUrl": "https://your-domain.com/watch/secure-random-token",
    "expiresAt": "2025-10-20T10:00:00Z"
  }
}
```

#### DELETE /api/videos/:id/public-url

Revoke public access to a watermarked video.

**Authentication Required**: Yes

**URL Parameters**:
- `id`: Video UUID

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Public access revoked successfully"
  }
}
```

### Callback Endpoints

#### POST /api/callbacks/watermark

Endpoint for the external watermarking service to notify when processing is complete.

**Authentication Required**: Special token authentication

**Request Headers**:
- `X-Callback-Token`: Secret token for callback authentication

**Request Body**:
```json
{
  "jobId": "external-job-id",
  "status": "completed",
  "videoUrl": "https://your-bucket.s3.your-region.wasabisys.com/watermarked/user-uuid/timestamp-example.mp4",
  "thumbnailUrl": "https://your-bucket.s3.your-region.wasabisys.com/thumbnails/watermarked/user-uuid/timestamp-example.jpg",
  "metadata": {
    "processingTime": 120,
    "watermarkPosition": "center",
    "watermarkOpacity": 0.5
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Callback processed successfully"
  }
}
```

## Public Video Access

### GET /watch/:token

Public endpoint to watch a watermarked video with a valid token.

**Authentication Required**: No (uses token in URL)

**URL Parameters**:
- `token`: Public access token

**Response**: HTML page with video player or error page if token is invalid

## Error Handling

### 400 Bad Request

```json
{
  "success": false,
  "error": {
    "code": "validation_error",
    "message": "Invalid request parameters",
    "details": {
      "filename": "Filename is required"
    }
  }
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "error": {
    "code": "unauthorized",
    "message": "Authentication required"
  }
}
```

### 403 Forbidden

```json
{
  "success": false,
  "error": {
    "code": "forbidden",
    "message": "You don't have permission to access this resource"
  }
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": {
    "code": "not_found",
    "message": "Video not found"
  }
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": {
    "code": "server_error",
    "message": "An unexpected error occurred",
    "reference": "error-uuid" // For server-side logging reference
  }
}
```

## Rate Limiting

API endpoints are rate-limited to prevent abuse. Rate limits are applied per user and per IP address.

- Authentication endpoints: 10 requests per minute
- Video management endpoints: 60 requests per minute
- Upload endpoints: 10 requests per minute
- Public access endpoints: 100 requests per minute

When a rate limit is exceeded, the API returns a 429 Too Many Requests response:

```json
{
  "success": false,
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Try again in 30 seconds.",
    "retryAfter": 30
  }
}
```

## CORS Configuration

The API supports Cross-Origin Resource Sharing (CORS) with the following configuration:

- Allowed origins: Configured based on environment
- Allowed methods: GET, POST, PUT, DELETE, OPTIONS
- Allowed headers: Content-Type, Authorization
- Max age: 86400 seconds (24 hours)

## API Versioning

The API does not currently use explicit versioning in the URL path. Future versions may be implemented using:

1. URL path versioning (e.g., `/api/v2/videos`)
2. Accept header versioning (e.g., `Accept: application/vnd.savd.v2+json`)

## Webhook Integration

For applications that need to integrate with the SAVD App, webhook notifications can be configured for the following events:

- Video upload completed
- Watermarking started
- Watermarking completed
- Watermarking failed
- Public URL generated
- Video deleted

Webhook configuration is not available through the API and must be set up by an administrator.
