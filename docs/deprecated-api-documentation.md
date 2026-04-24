# SAVD App - API Documentation

## Overview

SAVD App provides a set of API endpoints to facilitate file uploads to Wasabi Cloud Storage. The API is built using Next.js API Routes and focuses on generating pre-signed URLs for secure, direct-to-S3 file uploads.

## Base URL

When running locally:
```
http://localhost:3000/api
```

In production:
```
https://your-domain.com/api
```

## Authentication

Currently, the API does not implement authentication. In a production environment, you should implement appropriate authentication mechanisms to secure these endpoints.

## API Endpoints

### Upload Endpoint

Generates a pre-signed URL for uploading files directly to Wasabi Cloud Storage.

**URL**: `/api/upload`

**Method**: `POST`

**Content-Type**: `application/json`

**Request Body**:

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `filename` | string | Name of the file to upload | Yes |
| `contentType` | string | MIME type of the file | Yes |

**Example Request**:
```json
{
  "filename": "example.jpg",
  "contentType": "image/jpeg"
}
```

**Success Response**:

- **Code**: 200 OK
- **Content**:
```json
{
  "uploadUrl": "https://s3.wasabisys.com/your-bucket-name",
  "fields": {
    "key": "uploads/1234567890-example.jpg",
    "Content-Type": "image/jpeg",
    "Policy": "base64-encoded-policy",
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": "credential-string",
    "X-Amz-Date": "20250920T000000Z",
    "X-Amz-Signature": "signature-string"
  },
  "key": "uploads/1234567890-example.jpg"
}
```

**Error Responses**:

- **Code**: 400 Bad Request
  - **Content**: `{ "error": "Filename and content type are required" }`
  - **Cause**: Missing required fields in the request body

- **Code**: 500 Internal Server Error
  - **Content**: `{ "error": "Failed to create upload URL" }`
  - **Cause**: Server-side error when generating the pre-signed URL

**Implementation Details**:

The endpoint uses AWS SDK v3's `createPresignedPost` function to generate a pre-signed POST URL with the following configuration:

- Bucket: Specified by the `WASABI_BUCKET` environment variable
- Key: Generated using timestamp and original filename
- Content-Type: Set to match the uploaded file
- Conditions:
  - File size limit: 100MB
  - Content type validation
- Expiry: 1 hour (3600 seconds)

### Health Check Endpoint

Provides application health status information for monitoring.

**URL**: `/api/health`

**Method**: `GET`

**Success Response**:

- **Code**: 200 OK
- **Content**:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-20T10:30:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "0.1.0"
}
```

**Error Response**:

- **Code**: 500 Internal Server Error
  - **Content**: 
  ```json
  {
    "status": "unhealthy",
    "timestamp": "2025-09-20T10:30:00.000Z",
    "error": "Error message"
  }
  ```
  - **Cause**: Server-side error during health check

## Using the API

### File Upload Process

1. **Request a pre-signed URL**:
   ```javascript
   const response = await fetch('/api/upload', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       filename: file.name,
       contentType: file.type,
     }),
   });
   
   const { uploadUrl, fields, key } = await response.json();
   ```

2. **Create FormData for the upload**:
   ```javascript
   const formData = new FormData();
   
   // Add all fields from the pre-signed URL response
   Object.entries(fields).forEach(([k, v]) => {
     formData.append(k, v);
   });
   
   // Add the file as the last field
   formData.append('file', file);
   ```

3. **Upload directly to Wasabi**:
   ```javascript
   const uploadResponse = await fetch(uploadUrl, {
     method: 'POST',
     body: formData,
   });
   
   if (uploadResponse.ok) {
     console.log('Upload successful');
     // File URL will be: `${uploadUrl}/${key}`
   }
   ```

### Health Check Usage

For monitoring and status checks:

```javascript
const healthCheck = async () => {
  const response = await fetch('/api/health');
  const healthData = await response.json();
  
  if (healthData.status === 'healthy') {
    console.log('Application is healthy');
  } else {
    console.error('Application is unhealthy:', healthData.error);
  }
};
```

## Rate Limiting

Currently, the API does not implement rate limiting. In a production environment, consider implementing rate limiting to prevent abuse.

## CORS Configuration

The API endpoints are configured to accept requests from the origin specified in the `NEXT_PUBLIC_APP_URL` environment variable. For proper cross-origin requests, ensure your Wasabi bucket has the appropriate CORS configuration:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "POST", "PUT"],
    "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain.com"],
    "MaxAgeSeconds": 3000
  }
]
```

## Error Handling

The API implements basic error handling:

- **Input Validation**: Checks for required fields
- **Try-Catch Blocks**: Catches and formats errors
- **Appropriate Status Codes**: Returns relevant HTTP status codes

## Future API Enhancements

1. **Authentication**: Implement JWT or OAuth2 authentication
2. **File Management**: Add endpoints for listing, retrieving, and deleting files
3. **Chunked Uploads**: Support for large file uploads using multipart upload
4. **Metadata**: Allow adding metadata to uploaded files
5. **Webhooks**: Implement webhook notifications for upload events
6. **Rate Limiting**: Add rate limiting to prevent abuse
7. **Analytics**: Track upload statistics and usage metrics

## Testing the API

You can test the API using tools like Postman, curl, or the browser's fetch API:

**Example curl command**:
```bash
curl -X POST \
  http://localhost:3000/api/upload \
  -H 'Content-Type: application/json' \
  -d '{
    "filename": "test.jpg",
    "contentType": "image/jpeg"
  }'
```

**Example health check**:
```bash
curl http://localhost:3000/api/health
```
