# SAVD App - Technical Architecture

## System Overview

The SAVD App is a web application for managing video content with watermarking capabilities. The system consists of several key components working together to provide a seamless user experience.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Client Browser                               │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             Next.js App                                 │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │                 │  │                 │  │                         │  │
│  │  React UI       │  │  API Routes     │  │  Server Components      │  │
│  │  (Shadcn UI)    │  │                 │  │                         │  │
│  │                 │  │                 │  │                         │  │
│  └─────────────────┘  └────────┬────────┘  └─────────────────────────┘  │
│                                │                                        │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────┐  ┌─────────────────────┐  ┌───────────────────────────┐
│               │  │                     │  │                           │
│  Supabase     │◀─┼─▶ External          │  │ Wasabi Cloud Storage      │
│  (Auth & DB)  │  │  Watermarking       │  │ (Video Storage)           │
│               │  │  Service            │  │                           │
└───────────────┘  └─────────────────────┘  └───────────────────────────┘
```

## Component Architecture

### Frontend Components

1. **Authentication Components**
   - Login/Registration forms
   - Protected route wrappers
   - User profile management

2. **Video Management Components**
   - Video grid display
   - Thumbnail generation and display
   - Upload component with drag-and-drop
   - Watermark action buttons
   - Delete functionality
   - Public URL generation

3. **UI Components**
   - Navigation and layout
   - Loading states and progress indicators
   - Notification system for async operations
   - Mobile-responsive design elements

### Backend Services

1. **Next.js API Routes**
   - Authentication endpoints (leveraging Supabase)
   - Video upload handling with pre-signed URLs
   - Watermarking service integration
   - Callback handling for watermarking completion
   - Public URL generation

2. **External Services**
   - Supabase Authentication
   - Supabase PostgreSQL Database
   - External Watermarking API
   - Wasabi S3-compatible Storage

## Data Flow

### Video Upload Flow

```
┌──────────┐     ┌───────────────┐     ┌───────────────┐     ┌──────────────┐
│          │  1  │               │  2  │               │  3  │              │
│  Client  │────▶│  Next.js API  │────▶│  Wasabi SDK   │────▶│  Pre-signed  │
│          │     │               │     │               │     │  URL         │
└──────────┘     └───────────────┘     └───────────────┘     └──────────────┘
     │                                                              │
     │                                                              │
     │                                                              ▼
     │                                                       ┌──────────────┐
     │                                                       │              │
     │                                                       │  Wasabi S3   │
     │                                                       │              │
     │                                                       └──────────────┘
     │                                                              ▲
     │                                                              │
     │                           4                                  │
     └──────────────────────────────────────────────────────────────┘
```

1. Client requests a pre-signed URL from Next.js API
2. API uses Wasabi SDK to generate pre-signed URL
3. API returns pre-signed URL to client
4. Client uploads video directly to Wasabi

### Watermarking Flow

```
┌──────────┐     ┌───────────────┐     ┌───────────────────────┐
│          │  1  │               │  2  │                       │
│  Client  │────▶│  Next.js API  │────▶│  External Watermark   │
│          │     │               │     │  Service              │
└──────────┘     └───────────────┘     └───────────────────────┘
                        ▲                         │
                        │                         │
                        │         3              │
                        │  (Callback)            │
                        └─────────────────────────
```

1. Client requests watermarking for a specific video
2. Next.js API calls external watermarking service with video URL and callback URL
3. External service processes video and calls back to Next.js API when complete

### Database Schema

#### Users Table
- `id`: UUID (from Supabase Auth)
- `email`: String
- `created_at`: Timestamp
- `updated_at`: Timestamp

#### Videos Table
- `id`: UUID
- `user_id`: UUID (foreign key to Users)
- `original_url`: String
- `original_thumbnail_url`: String
- `watermarked_url`: String (nullable)
- `watermarked_thumbnail_url`: String (nullable)
- `filename`: String
- `filesize`: Integer
- `upload_date`: Timestamp
- `watermark_date`: Timestamp (nullable)
- `status`: Enum ('uploaded', 'processing', 'watermarked', 'error')
- `public_url_token`: String (nullable)
- `created_at`: Timestamp
- `updated_at`: Timestamp

## API Endpoints

### Authentication Endpoints
- `POST /api/auth/login`: Login with email/password
- `POST /api/auth/register`: Register new user
- `POST /api/auth/logout`: Logout current user
- `GET /api/auth/user`: Get current user info

### Video Management Endpoints
- `GET /api/videos`: List all videos for current user
- `POST /api/videos/upload`: Get pre-signed URL for upload
- `POST /api/videos/confirm`: Confirm upload completion
- `DELETE /api/videos/:id`: Delete a video and its watermarked version
- `POST /api/videos/:id/watermark`: Request watermarking for a video
- `DELETE /api/videos/:id/watermark`: Delete watermarked version
- `POST /api/videos/:id/public-url`: Generate public URL for watermarked video
- `DELETE /api/videos/:id/public-url`: Remove public access

### Callback Endpoint
- `POST /api/callbacks/watermark`: Endpoint for watermarking service to call when processing completes

## Security Considerations

### Authentication & Authorization
- Supabase Auth for user authentication
- JWT tokens for API authorization
- Row-level security in Supabase for data isolation

### API Security
- CORS configuration to prevent unauthorized access
- Rate limiting to prevent abuse
- Input validation for all API endpoints

### Video Storage Security
- Pre-signed URLs with expiration for uploads
- Access control for video retrieval
- Secure token generation for public URLs

## Infrastructure Architecture

### Docker Deployment

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Docker Host                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Docker Network                             │    │
│  │                                                                 │    │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐  │    │
│  │  │                 │    │                 │    │             │  │    │
│  │  │  Nginx          │    │  SAVD App       │    │  Redis      │  │    │
│  │  │  Container      │◀───▶  Container      │◀───▶ Container   │  │    │
│  │  │  (Port 80/443)  │    │  (Port 3000)    │    │ (Optional)  │  │    │
│  │  │                 │    │                 │    │             │  │    │
│  │  └─────────────────┘    └─────────────────┘    └─────────────┘  │    │
│  │         │                       │                     │         │    │
│  │         ▼                       ▼                     ▼         │    │
│  │  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐  │    │
│  │  │ nginx_logs  │        │ next_cache  │        │ redis_data  │  │    │
│  │  │  Volume     │        │  Volume     │        │  Volume     │  │    │
│  │  └─────────────┘        └─────────────┘        └─────────────┘  │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Environment Configuration
- Development environment with hot reloading
- Production environment with optimized builds
- Environment variables for service configuration
- Secrets management for API tokens and keys

## Performance Considerations

### Video Upload Optimization
- Chunked uploads for large files
- Client-side validation for file types and sizes
- Progress indicators for user feedback

### Thumbnail Generation
- Server-side thumbnail generation
- Caching of thumbnails for quick loading
- Responsive image sizing for different devices

### Watermarking Process
- Asynchronous processing to prevent blocking
- Status updates for long-running operations
- Retry mechanisms for failed operations

## Monitoring & Logging

### Application Monitoring
- API endpoint performance metrics
- Error rate tracking
- User activity monitoring

### Infrastructure Monitoring
- Container health checks
- Resource utilization metrics
- Database performance monitoring

### Logging Strategy
- Structured logging for API operations
- Error logging with context
- Audit logging for security-relevant events

## Development Workflow

### Local Development
- Next.js development server
- Local Supabase instance (via Docker)
- Mock external watermarking service

### CI/CD Pipeline
- Automated testing for frontend and API
- Docker image building and versioning
- Deployment automation

### Testing Strategy
- Unit tests for components and utilities
- Integration tests for API endpoints
- End-to-end tests for critical user flows

## External Service Integration

### Wasabi Cloud Storage
- S3-compatible API integration
- Pre-signed URL generation
- Access control and bucket policies

### External Watermarking Service
- API token authentication
- Webhook configuration for callbacks
- Error handling and retry logic

### Supabase Integration
- Authentication service configuration
- Database schema and migrations
- Row-level security policies
