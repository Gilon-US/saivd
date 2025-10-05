# SAVD App - Technical Documentation

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Core Components](#core-components)
6. [API Documentation](#api-documentation)
7. [Data Flow](#data-flow)
8. [Deployment](#deployment)
9. [Environment Configuration](#environment-configuration)
10. [Security Considerations](#security-considerations)
11. [Performance Optimizations](#performance-optimizations)
12. [Troubleshooting](#troubleshooting)

## Introduction

SAVD App is a modern web application built with Next.js that enables users to upload files to Wasabi Cloud Storage. The application provides a clean, user-friendly interface for file uploads with real-time progress tracking and status notifications.

### Key Features

- Drag-and-drop file uploads
- Real-time upload progress tracking
- Direct-to-cloud uploads via pre-signed URLs
- Support for various file types (images, videos, audio, PDFs, documents)
- Toast notifications for operation status
- Responsive design with Tailwind CSS and Shadcn UI

## Architecture Overview

SAVD App follows a client-server architecture with Next.js serving as both the frontend and backend framework. The application uses the App Router pattern introduced in Next.js 13+.

### High-Level Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  Client Browser │ ──── │  Next.js Server │ ──── │  Wasabi Cloud   │
│                 │      │                 │      │  Storage (S3)   │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

### Key Architectural Patterns

1. **Server Components & Client Components**: Next.js App Router pattern with clear separation between server and client components
2. **API Routes**: Next.js API routes for server-side operations
3. **Direct-to-S3 Upload**: Pre-signed URL pattern for secure, efficient file uploads
4. **Containerization**: Docker-based deployment for both development and production

## Technology Stack

### Frontend
- **Framework**: Next.js 15.5.3
- **Language**: TypeScript
- **UI Library**: React 19.1.0
- **Styling**: Tailwind CSS 4.x
- **Component Library**: Shadcn UI (based on Radix UI)
- **File Upload**: React Dropzone 14.3.8
- **Notifications**: Sonner 2.0.7

### Backend
- **Server**: Next.js API Routes
- **Cloud Storage**: Wasabi (S3-compatible)
- **AWS SDK**: AWS SDK v3 for JavaScript

### DevOps
- **Containerization**: Docker with multi-stage builds
- **Orchestration**: Docker Compose
- **Web Server**: Nginx (production)
- **Caching**: Redis (optional in production)

## Project Structure

```
savd-app/
├── .github/                  # GitHub workflows and templates
├── docs/                     # Project documentation
├── nginx/                    # Nginx configuration for production
│   ├── conf.d/               # Site-specific configurations
│   └── nginx.conf            # Main Nginx configuration
├── public/                   # Static assets
├── scripts/                  # Utility scripts
│   ├── docker-dev.sh         # Development Docker utilities
│   └── docker-prod.sh        # Production Docker utilities
├── src/                      # Application source code
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # API routes
│   │   │   ├── health/       # Health check endpoint
│   │   │   └── upload/       # File upload endpoint
│   │   ├── globals.css       # Global styles
│   │   ├── layout.tsx        # Root layout
│   │   └── page.tsx          # Main page
│   ├── components/           # React components
│   │   ├── ui/               # Shadcn UI components
│   │   └── FileUploader.tsx  # Main file upload component
│   └── lib/                  # Utility libraries
│       ├── utils.ts          # General utilities
│       └── wasabi.ts         # Wasabi client configuration
├── .env.docker               # Docker development environment variables
├── .env.docker.prod          # Docker production environment variables
├── .env.local.example        # Example local environment variables
├── docker-compose.yml        # Development Docker Compose
├── docker-compose.prod.yml   # Production Docker Compose
├── Dockerfile                # Multi-stage Docker build
├── package.json              # Dependencies and scripts
└── README.md                 # Project overview and setup instructions
```

## Core Components

### FileUploader Component

The `FileUploader` component (`src/components/FileUploader.tsx`) is the central component responsible for handling file uploads. It uses React Dropzone for file selection and drag-and-drop functionality.

#### Key Features

- Drag-and-drop file selection
- File type filtering
- Size limit enforcement
- Upload progress tracking
- Status notifications
- Direct-to-S3 uploads

#### Component Props

```typescript
interface FileUploadProps {
  onUploadComplete?: (key: string, url: string) => void;
  maxFileSize?: number;  // Default: 100MB
  acceptedFileTypes?: string[];  // Default: images, videos, audio, PDFs, documents
}
```

#### Upload Process

1. User selects or drops files
2. Component validates file types and sizes
3. For each file:
   - Request pre-signed URL from API
   - Upload directly to Wasabi using FormData
   - Track upload progress
   - Display completion status
   - Trigger onUploadComplete callback

### API Routes

#### Upload API (`src/app/api/upload/route.ts`)

Generates pre-signed URLs for direct-to-S3 uploads.

**Request:**
- Method: POST
- Body: `{ filename: string, contentType: string }`

**Response:**
- `uploadUrl`: Base URL for the upload
- `fields`: Form fields required for the S3 POST request
- `key`: Generated unique file key

#### Health API (`src/app/api/health/route.ts`)

Provides application health status for monitoring.

**Request:**
- Method: GET

**Response:**
- `status`: Application health status
- `timestamp`: Current timestamp
- `uptime`: Server uptime
- `environment`: Current environment
- `version`: Application version

## Data Flow

### File Upload Flow

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

1. Client requests a pre-signed URL from the Next.js API
2. API uses Wasabi SDK to generate a pre-signed POST URL
3. API returns the pre-signed URL and form fields to the client
4. Client uploads the file directly to Wasabi S3 using the pre-signed URL

## Deployment

SAVD App supports two primary deployment methods:

### Docker Deployment

The application includes comprehensive Docker support for both development and production environments.

#### Development Environment

```bash
# Start development environment
npm run docker:dev
# or
./scripts/docker-dev.sh up
```

**Features:**
- Hot reloading
- Volume mounts for code changes
- Development-specific optimizations

#### Production Environment

```bash
# Start production environment
npm run docker:prod
# or
./scripts/docker-prod.sh up
```

**Features:**
- Multi-stage build for optimized image size
- Nginx reverse proxy with SSL support
- Redis for caching (optional)
- Health checks and monitoring
- Resource limits and optimizations

#### Docker Architecture

**Development:**
```
┌─────────────────┐
│   SAVD App      │  Hot reloading, volume mounts
│   (Port 3000)   │  Source code synchronization
└─────────────────┘
```

**Production:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Nginx       │───▶│   SAVD App      │    │     Redis       │
│  (Port 80/443)  │    │   (Port 3000)   │◄───│   (Internal)    │
│  Load Balancer  │    │   Multi-stage   │    │    Sessions     │
│  SSL Termination│    │   Optimized     │    │     Cache       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Traditional Deployment

For non-Docker deployments:

1. Build the application:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

3. Or deploy to Vercel (recommended for Next.js):
   ```bash
   vercel deploy
   ```

## Environment Configuration

### Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `WASABI_ACCESS_KEY_ID` | Wasabi access key ID | Yes |
| `WASABI_SECRET_ACCESS_KEY` | Wasabi secret access key | Yes |
| `WASABI_REGION` | Wasabi region for your bucket | Yes |
| `WASABI_BUCKET_NAME` | Wasabi bucket name | Yes |
| `WASABI_ENDPOINT` | Wasabi endpoint URL | Yes |
| `NEXT_PUBLIC_APP_URL` | App URL for CORS | No |

### Environment Files

- `.env.local` - Local development
- `.env.docker` - Docker development
- `.env.docker.prod` - Docker production

## Security Considerations

### File Upload Security

- **Pre-signed URLs**: Limited-time access for uploads
- **Content Type Validation**: Enforced on both client and server
- **Size Limits**: Enforced on both client and server (100MB default)
- **CORS Configuration**: Proper CORS setup required on Wasabi bucket

### Wasabi Configuration

- **Credentials**: Stored as environment variables, never exposed to client
- **Minimal Permissions**: Use IAM roles with least privilege
- **Path Style Access**: Enabled for compatibility with Wasabi

### Docker Security

- **Non-root User**: Application runs as non-root user
- **Multi-stage Builds**: Minimal attack surface
- **Resource Limits**: Prevents resource exhaustion attacks

## Performance Optimizations

### Frontend Optimizations

- **Next.js App Router**: Optimized rendering with React Server Components
- **Turbopack**: Faster development builds with `--turbopack` flag
- **Tailwind CSS**: Utility-first CSS for minimal bundle size
- **Direct-to-S3 Uploads**: Bypasses server for large file transfers

### Backend Optimizations

- **Pre-signed URLs**: Reduces server load for file uploads
- **API Route Handlers**: Efficient Next.js API routes

### Docker Optimizations

- **Multi-stage Builds**: Minimal production image size
- **Nginx Caching**: Static asset caching in production
- **Resource Limits**: Appropriate container resource allocation

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure Wasabi bucket has proper CORS configuration
   - Example CORS policy:
     ```json
     [
       {
         "AllowedHeaders": ["*"],
         "AllowedMethods": ["GET", "POST", "PUT"],
         "AllowedOrigins": ["*"],
         "MaxAgeSeconds": 3000
       }
     ]
     ```

2. **Upload Failures**
   - Check file size limits (default 100MB)
   - Verify content type restrictions
   - Ensure Wasabi credentials are correct

3. **Docker Issues**
   - Verify Docker and Docker Compose installation
   - Check environment variables in `.env.docker` or `.env.docker.prod`
   - Ensure ports are not already in use

4. **Wasabi Access Issues**
   - Verify access key and secret key
   - Check bucket permissions
   - Ensure bucket exists in specified region
