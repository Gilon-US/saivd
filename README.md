# SAVD App

A comprehensive video management platform built with Next.js for uploading, processing, and managing videos with Wasabi Cloud Storage integration and watermarking capabilities.

## V2 Watermark Verification

The app uses the V2 in-browser verification strategy. See `docs/V2_WATERMARK_STRATEGY.md` for bootstrap, marker-aware decode, and every-10th-frame runtime verification policy.

## Features

- 🚀 **Next.js 15** with TypeScript and App Router
- 🎨 **Tailwind CSS** with **Shadcn UI** component library
- 🎥 **Video Management** - Upload, view, and organize videos in a grid layout
- ☁️ **Wasabi Cloud Storage** - Secure file storage with S3-compatible API
- 🔐 **Authentication** - Complete user auth system with Supabase
- 📁 **Drag & drop uploads** with progress tracking
- 🖼️ **Video Thumbnails** - Automatic thumbnail generation and preview
- 💧 **Watermarking** - Add watermarks to videos (processing workflow)
- 🗑️ **Video Deletion** - Safe video deletion with confirmation dialogs
- 📊 **Upload progress tracking** with real-time feedback
- 🎉 **Toast notifications** for user feedback
- 📱 **Responsive Design** - Works on desktop and mobile devices

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI + Lucide React Icons
- **File Upload**: React Dropzone
- **Cloud Storage**: Wasabi (S3-compatible)
- **AWS SDK**: v3 (for S3 operations)
- **Authentication**: Supabase Auth
- **Database**: Supabase PostgreSQL
- **State Management**: React Hooks + Context
- **Notifications**: Sonner (Toast system)
- **Testing**: Jest + React Testing Library
- **Deployment**: Docker + Docker Compose

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A Wasabi account and bucket
- A Supabase account (or Docker for local development)
- Docker and Docker Compose (optional, for local development)

### Installation

1. Clone or navigate to the project directory:

   ```bash
   cd savd-app
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.local.example .env.local
   ```

4. Edit `.env.local` with your credentials:

   ```env
   # Wasabi Configuration
   WASABI_ACCESS_KEY_ID=your_wasabi_access_key_here
   WASABI_SECRET_ACCESS_KEY=your_wasabi_secret_key_here
   WASABI_REGION=
   WASABI_BUCKET_NAME=your_bucket_name_here
   WASABI_ENDPOINT=

   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

   # App Configuration
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

5. Run the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Wasabi Setup

1. Create a [Wasabi account](https://wasabi.com/)
2. Create a new bucket in your preferred region
3. Generate Access Keys:
   - Go to "Access Keys" in your Wasabi console
   - Create a new access key pair
   - Copy the Access Key ID and Secret Access Key

## Configuration

### Environment Variables

| Variable                           | Description                                           | Required        |
| ---------------------------------- | ----------------------------------------------------- | --------------- |
| `WASABI_ACCESS_KEY_ID`             | Your Wasabi access key ID                             | Yes             |
| `WASABI_SECRET_ACCESS_KEY`         | Your Wasabi secret access key                         | Yes             |
| `WASABI_REGION`                    | Wasabi region for your bucket                         | Yes             |
| `WASABI_BUCKET_NAME`               | Your Wasabi bucket name                               | Yes             |
| `WASABI_ENDPOINT`                  | Wasabi endpoint URL                                   | Yes             |
| `NEXT_PUBLIC_APP_URL`              | Your app URL (for CORS and webhooks)                  | Yes for normalize |
| `NEXT_PUBLIC_SUPABASE_URL`         | Supabase URL                                          | Yes for auth    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`    | Supabase anonymous key                                | Yes for auth    |
| `SUPABASE_SERVICE_ROLE_KEY`        | Supabase service role key                             | No              |
| `WATERMARK_SERVICE_URL`            | Base URL of watermark/normalize service                 | Yes for watermark/normalize |
| `WATERMARK_CALLBACK_HMAC_SECRET`   | HMAC secret for watermark-complete webhook             | Yes for watermark |
| `NORMALIZE_CALLBACK_HMAC_SECRET`   | HMAC secret for normalize webhook (X-Signature verification) | Yes for normalize |

### File Upload Settings

The default configuration allows:

- **Max file size**: 100MB per file
- **File types**: Images, videos, audio, PDFs, and documents
- **Upload method**: Pre-signed POST URLs
- **Expiry**: 1 hour per upload URL

You can modify these settings in `src/components/FileUploader.tsx` and `src/app/api/upload/route.ts`.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── videos/
│   │   │   ├── [id]/
│   │   │   │   └── route.ts      # Video CRUD operations (GET, DELETE)
│   │   │   ├── confirm/
│   │   │   │   └── route.ts      # Video upload confirmation
│   │   │   ├── upload/
│   │   │   │   └── route.ts      # Pre-signed URL generation
│   │   │   └── route.ts          # Video listing API
│   │   ├── callbacks/
│   │   │   └── watermark/
│   │   │       └── route.ts      # Watermarking callback handler
│   │   └── upload/
│   │       └── route.ts          # Legacy upload endpoint
│   ├── dashboard/
│   │   ├── videos/
│   │   │   ├── page.tsx          # Main video grid dashboard
│   │   │   └── layout.tsx        # Dashboard layout
│   │   ├── upload/
│   │   │   └── page.tsx          # Dedicated upload page
│   │   └── page.tsx              # Dashboard overview
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx          # Login page
│   │   └── register/
│   │       └── page.tsx          # Registration page
│   ├── layout.tsx                # Root layout with providers
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Global styles
├── components/
│   ├── ui/                       # Shadcn UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── loading-spinner.tsx
│   │   └── ...
│   ├── video/
│   │   ├── VideoGrid.tsx         # Video grid display component
│   │   ├── VideoUploader.tsx     # Video upload component
│   │   ├── UploadModal.tsx       # Upload modal dialog
│   │   └── DeleteConfirmDialog.tsx # Delete confirmation dialog
│   ├── auth/
│   │   ├── AuthGuard.tsx         # Authentication wrapper
│   │   ├── LoginForm.tsx         # Login form component
│   │   ├── RegisterForm.tsx      # Registration form
│   │   └── LogoutButton.tsx      # Logout functionality
│   ├── profile/
│   │   └── PublicProfileCard.tsx # User profile display
│   └── FileUploader.tsx          # Generic file upload component
├── contexts/
│   └── AuthContext.tsx           # Authentication context provider
├── hooks/
│   ├── useVideos.ts              # Video data management hook
│   ├── useVideoUpload.ts         # Video upload logic hook
│   └── useToast.ts               # Toast notification hook
├── lib/
│   ├── utils.ts                  # Utility functions
│   ├── wasabi.ts                 # Wasabi S3 client configuration
│   └── watermark.ts              # Watermarking utilities
├── utils/
│   ├── supabase/
│   │   ├── client.ts             # Supabase client (browser)
│   │   ├── server.ts             # Supabase client (server)
│   │   └── middleware.ts         # Auth middleware
│   └── videoThumbnail.ts         # Video thumbnail generation
└── db/
    ├── schema/
    │   └── videos.sql            # Database schema definitions
    └── setup-videos.ts           # Database setup utilities
```

## API Endpoints

### Video Management

#### GET /api/videos

Lists all videos for the authenticated user with pagination.

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `sortBy` (optional): Sort field (default: upload_date)
- `sortOrder` (optional): Sort direction (default: desc)

**Response:**

```json
{
  "success": true,
  "data": {
    "videos": [
      {
        "id": "uuid",
        "filename": "video.mp4",
        "original_url": "https://your-bucket.s3.your-region.wasabisys.com/...",
        "original_thumbnail_url": "https://your-bucket.s3.your-region.wasabisys.com/...",
        "processed_url": null,
        "processed_thumbnail_url": null,
        "status": "uploaded",
        "upload_date": "2024-01-01T12:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

#### POST /api/videos/upload

Generates pre-signed URL for video upload.

**Request body:**

```json
{
  "filename": "video.mp4",
  "contentType": "video/mp4"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://your-bucket.s3.your-region.wasabisys.com/...",
    "fields": {
      "key": "videos/user-id/timestamp-video.mp4",
      "Content-Type": "video/mp4"
    },
    "videoId": "uuid"
  }
}
```

#### POST /api/videos/confirm

Confirms video upload completion and saves metadata.

**Request body:**

```json
{
  "videoId": "uuid",
  "filename": "video.mp4",
  "originalUrl": "https://your-bucket.s3.your-region.wasabisys.com/...",
  "thumbnailUrl": "https://your-bucket.s3.your-region.wasabisys.com/..."
}
```

#### GET /api/videos/[id]

Retrieves specific video details for the authenticated user.

#### DELETE /api/videos/[id]

Deletes a video and its associated files from storage.

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Video deleted successfully",
    "id": "uuid"
  }
}
```

## Usage

### Getting Started

1. **Register/Login**: Create an account or sign in to access the dashboard
2. **Navigate to Videos**: Go to `/dashboard/videos` to see your video collection
3. **Upload Videos**: Click "Upload Video" to add new videos to your collection
4. **Manage Videos**: View, organize, and delete your uploaded videos

### Video Management Workflow

1. **Upload**: Drag and drop video files or click to select (MP4, MOV, AVI, WEBM supported)
2. **Processing**: Videos are uploaded to Wasabi storage with automatic thumbnail generation
3. **Organization**: View all videos in a responsive grid layout with thumbnails
4. **Watermarking**: Create watermarked versions of your videos (processing workflow)
5. **Deletion**: Safely delete videos with confirmation dialogs
6. **Sharing**: Generate public access links for video sharing (future feature)

### Supported Features

- **Video Formats**: MP4, MOV, AVI, WEBM (up to 500MB per file)
- **Thumbnail Generation**: Automatic preview thumbnails for uploaded videos
- **Progress Tracking**: Real-time upload progress with visual feedback
- **Error Handling**: Comprehensive error messages and retry mechanisms
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Customization

### Video Upload Settings

#### File Types

Modify accepted video formats in `VideoUploader.tsx`:

```typescript
const acceptedTypes = {
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/x-msvideo": [".avi"],
  "video/webm": [".webm"],
};
```

#### File Size Limits

Adjust maximum video file size in the upload components:

```typescript
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
```

#### Upload Destination

Customize the S3 key structure in `src/app/api/videos/upload/route.ts`:

```typescript
const key = `videos/${user.id}/${Date.now()}-${filename}`;
```

### Video Grid Configuration

#### Pagination Settings

Modify default pagination in `useVideos.ts`:

```typescript
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT_BY = "upload_date";
const DEFAULT_SORT_ORDER = "desc";
```

#### Thumbnail Settings

Adjust thumbnail generation in `videoThumbnail.ts`:

```typescript
const THUMBNAIL_WIDTH = 240;
const THUMBNAIL_HEIGHT = 135;
const THUMBNAIL_QUALITY = 0.8;
```

### UI Customization

#### Grid Layout

Modify video card dimensions in `VideoGrid.tsx`:

```typescript
className = "w-60 max-w-[240px] aspect-video";
```

#### Color Scheme

Update delete button styling:

```typescript
className = "hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20";
```

## Testing

The SAVD app includes comprehensive test coverage for all major components and functionality.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure

```
src/
├── components/
│   └── video/
│       └── __tests__/
│           ├── VideoGrid.test.tsx
│           ├── VideoUploader.test.tsx
│           ├── UploadModal.test.tsx
│           └── DeleteConfirmDialog.test.tsx
├── hooks/
│   └── __tests__/
│       └── useVideoUpload.test.tsx
└── app/
    └── api/
        └── videos/
            └── __tests__/
                └── videos-api.test.ts
```

### Key Test Coverage

- **Video Grid Component**: Delete functionality, confirmation dialogs, API integration
- **Upload Components**: File validation, progress tracking, error handling
- **API Endpoints**: CRUD operations, authentication, error responses
- **Hooks**: State management, data fetching, upload logic
- **Authentication**: Login/logout flows, protected routes

### Testing Features

- **Mocked APIs**: All external API calls are mocked for reliable testing
- **User Interactions**: Button clicks, form submissions, drag & drop
- **Error Scenarios**: Network failures, validation errors, edge cases
- **Loading States**: Progress indicators, disabled states during operations

## Deployment

### Docker Deployment (Recommended)

The SAVD app includes comprehensive Docker support for both development and production environments.

#### Prerequisites

- Docker (v20.0+)
- Docker Compose (v2.0+)

#### Development with Docker

1. **Setup environment variables**:

   ```bash
   cp .env.docker.example .env.docker
   # Edit .env.docker with your actual Wasabi credentials
   ```

2. **Start development environment**:

   ```bash
   npm run docker:dev
   # or
   ./scripts/docker-dev.sh up
   ```

3. **Access the application**:

   - App: http://localhost:3000
   - Health check: http://localhost:3000/api/health

4. **Development commands**:
   ```bash
   npm run docker:dev:logs    # View logs
   npm run docker:dev:shell   # Access container shell
   npm run docker:dev:down    # Stop services
   npm run docker:dev:rebuild # Rebuild and restart
   npm run docker:dev:clean   # Clean up everything
   ```

#### Production with Docker

1. **Setup production environment**:

   ```bash
   cp .env.docker.prod.example .env.docker.prod
   # Edit .env.docker.prod with your production configuration
   ```

2. **Deploy to production**:

   ```bash
   npm run docker:prod
   # or
   ./scripts/docker-prod.sh up
   ```

3. **Production services**:

   - **SAVD App**: Main Next.js application
   - **Nginx**: Reverse proxy with SSL support and caching
   - **Redis**: Session storage and caching
   - **Health monitoring**: Built-in health checks

4. **Production management**:
   ```bash
   npm run docker:prod:health  # Check service health
   npm run docker:prod:logs    # View logs
   npm run docker:prod:backup  # Backup data
   npm run docker:prod:shell   # Access app container
   ```

#### Docker Architecture

**Development Stack:**

```
┌─────────────────┐
│   SAVD App      │  Hot reloading, volume mounts
│   (Port 3000)   │  Source code synchronization
└─────────────────┘
```

**Local Supabase Development Stack:**

```
┌─────────────────┐    ┌─────────────────────────────────────────────┐
│   SAVD App      │    │              Supabase Local                 │
│   (Port 3000)   │◄───┤                                             │
│                 │    │  ┌─────────┐ ┌────┐ ┌────────┐ ┌────────┐  │
└─────────────────┘    │  │ Studio  │ │API │ │Postgres│ │Storage │  │
                       │  │(8000)   │ │Kong│ │  DB    │ │        │  │
                       │  └─────────┘ └────┘ └────────┘ └────────┘  │
                       └─────────────────────────────────────────────┘
```

**Production Stack:**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Nginx       │───▶│   SAVD App      │    │     Redis       │
│  (Port 80/443)  │    │   (Port 3000)   │◄───│   (Internal)    │
│  Load Balancer  │    │   Multi-stage   │    │    Sessions     │
│  SSL Termination│    │   Optimized     │    │     Cache       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### Docker Features

- **🔒 Security**: Non-root user, minimal attack surface
- **📦 Multi-stage builds**: Optimized production images
- **🚀 Performance**: Nginx caching, compression, rate limiting
- **📊 Monitoring**: Health checks, logging, metrics
- **🔄 Hot reloading**: Development environment with live updates
- **📋 Easy management**: NPM scripts and utility commands

#### SSL/HTTPS Configuration

To enable HTTPS in production:

1. **Add SSL certificates** to `ssl_certs` volume or mount them:

   ```yaml
   volumes:
     - ./certs:/etc/nginx/certs:ro
   ```

2. **Update nginx configuration** to enable SSL:

   ```bash
   # Uncomment SSL lines in nginx/conf.d/default.conf
   ```

3. **Set environment variables**:
   ```bash
   SSL_CERT_PATH=/etc/nginx/certs/cert.pem
   SSL_KEY_PATH=/etc/nginx/certs/private.key
   ```

#### Docker Compose Files

- `docker-compose.yml`: Development environment
- `docker-compose.prod.yml`: Production environment
- `Dockerfile`: Multi-stage production build
- `nginx/`: Nginx configuration for production
- `scripts/`: Utility scripts for Docker operations

### Traditional Deployment

1. **Vercel** (alternative):

   ```bash
   npm run build
   vercel deploy
   ```

2. **Other platforms**: Build the app and deploy:
   ```bash
   npm run build
   npm start
   ```

Don't forget to set your environment variables in your deployment platform.

## Local Supabase Development

The SAVD app includes support for local Supabase development using Docker Compose. This allows you to develop and test authentication and database features without relying on the production Supabase instance.

### Setting Up Local Supabase

1. **Prerequisites**:

   - Docker and Docker Compose installed
   - Basic understanding of Supabase and PostgreSQL

2. **Start Local Development Environment**:

   ```bash
   ./scripts/start-dev-with-supabase.sh
   ```

   This script will:

   - Start the local Supabase services
   - Initialize the database schema
   - Start the SAVD app with Supabase integration
   - Wait for all services to be ready

3. **Access Local Services**:

   - SAVD App: http://localhost:3000
   - Supabase Studio: http://localhost:8000
   - Supabase API: http://localhost:8000/rest/v1/

4. **Default Credentials**:
   - Supabase Dashboard Username: admin
   - Supabase Dashboard Password: secure-dashboard-password

### Directory Structure

```
supabase-local/
├── docker-compose.yml       # Supabase services configuration
├── .env                     # Supabase environment variables
└── volumes/
    ├── db/
    │   └── init/           # Database initialization scripts
    │       └── 01-profiles-schema.sql
    ├── storage/            # Storage data
    └── kong/               # API Gateway configuration
```

### Database Schema

The local Supabase instance is initialized with the following tables:

- **profiles**: User profile information linked to auth.users
- **videos**: Metadata for uploaded videos
- **watermarked_videos**: Metadata for watermarked versions of videos
- **watermarking_jobs**: Tracking watermarking job requests and status
- **public_access_tokens**: Managing public access tokens for sharing

### Troubleshooting Local Supabase

1. **Services Not Starting**: Check Docker logs for errors

   ```bash
   docker logs supabase-local_db_1
   docker logs supabase-local_kong_1
   ```

2. **Database Connection Issues**: Verify PostgreSQL is running

   ```bash
   docker exec -it supabase-local_db_1 psql -U postgres
   ```

3. **Reset Local Database**: If you need to start fresh
   ```bash
   docker-compose -f supabase-local/docker-compose.yml down -v
   ```

## Troubleshooting

### Common Issues

#### Video Upload Issues

1. **CORS Errors**: Ensure your Wasabi bucket has the correct CORS policy
2. **Access Denied**: Verify your Wasabi credentials and bucket permissions
3. **Upload Failures**: Check file size limits (500MB max) and video format support
4. **Thumbnail Generation Failed**: Ensure browser supports HTML5 video and canvas

#### Authentication Issues

5. **Login/Registration Failures**: Check Supabase URL and keys in environment variables
6. **Session Expiry**: Verify Supabase JWT settings and refresh token configuration
7. **Protected Route Access**: Ensure AuthGuard is properly configured

#### Video Management Issues

8. **Videos Not Loading**: Check database connection and video table schema
9. **Delete Operations Failing**: Verify user permissions and Wasabi delete permissions
10. **Pagination Issues**: Check API response format and useVideos hook configuration

#### Performance Issues

11. **Slow Video Loading**: Optimize thumbnail sizes and implement lazy loading
12. **Memory Issues**: Large video files may cause browser memory issues during upload

### CORS Configuration

Add this CORS policy to your Wasabi bucket:

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

## Recent Updates

### Version 1.2.0 - Video Deletion Feature

- ✅ **Safe Video Deletion**: Added delete buttons to video cards with confirmation dialogs
- ✅ **Comprehensive Testing**: Full test coverage for delete functionality
- ✅ **Error Handling**: Robust error handling with user-friendly feedback
- ✅ **API Integration**: Seamless integration with existing DELETE endpoint
- ✅ **UI/UX Improvements**: Intuitive trash icon with hover effects

### Version 1.1.0 - Video Management Platform

- ✅ **Video Grid Dashboard**: Responsive grid layout for video organization
- ✅ **Authentication System**: Complete user registration and login system
- ✅ **Video Upload**: Drag & drop video uploads with progress tracking
- ✅ **Thumbnail Generation**: Automatic video thumbnail creation
- ✅ **Watermarking Workflow**: Infrastructure for video watermarking

### Version 1.0.0 - Initial Release

- ✅ **File Upload System**: Basic file upload to Wasabi storage
- ✅ **Next.js 15 Setup**: Modern React framework with TypeScript
- ✅ **Shadcn UI Integration**: Beautiful, accessible UI components
- ✅ **Docker Support**: Development and production containerization

## Contributing

We welcome contributions to the SAVD app! Here's how to get started:

1. **Fork the repository** and clone your fork locally
2. **Create a feature branch** from main: `git checkout -b feature/your-feature-name`
3. **Make your changes** following the existing code style and patterns
4. **Write tests** for any new functionality
5. **Run the test suite** to ensure nothing is broken: `npm test`
6. **Update documentation** if you've added new features
7. **Submit a pull request** with a clear description of your changes

### Development Guidelines

- Follow TypeScript best practices and maintain type safety
- Use existing UI patterns and components from Shadcn UI
- Write comprehensive tests for new features
- Follow the existing API response format for consistency
- Update the README if you add new configuration options

## License

This project is open source and available under the [MIT License](LICENSE).

---

**SAVD App** - Secure, scalable video management platform built with modern web technologies.
