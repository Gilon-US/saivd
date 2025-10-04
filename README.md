# SAVD App

A Next.js application for uploading files to Wasabi Cloud Storage using pre-signed URLs.

## Features

- 🚀 **Next.js 15** with TypeScript
- 🎨 **Tailwind CSS** for styling  
- 🧩 **Shadcn UI** component library
- ☁️ **Wasabi Cloud Storage** integration
- 📁 **Drag & drop file uploads**
- 📊 **Upload progress tracking**
- 🎉 **Toast notifications**

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI
- **File Upload**: React Dropzone
- **Cloud Storage**: Wasabi (S3-compatible)
- **AWS SDK**: v3 (for S3 operations)
- **Authentication**: Supabase Auth
- **Database**: Supabase PostgreSQL

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- A Wasabi account and bucket
- Docker and Docker Compose (for local Supabase development)

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

4. Edit `.env.local` with your Wasabi credentials:
   ```env
   WASABI_ACCESS_KEY_ID=your_wasabi_access_key_here
   WASABI_SECRET_ACCESS_KEY=your_wasabi_secret_key_here
   WASABI_REGION=us-east-1
   WASABI_BUCKET_NAME=your_bucket_name_here
   WASABI_ENDPOINT=https://s3.wasabisys.com
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

| Variable | Description | Required |
|----------|-------------|----------|
| `WASABI_ACCESS_KEY_ID` | Your Wasabi access key ID | Yes |
| `WASABI_SECRET_ACCESS_KEY` | Your Wasabi secret access key | Yes |
| `WASABI_REGION` | Wasabi region (default: us-east-1) | Yes |
| `WASABI_BUCKET_NAME` | Your Wasabi bucket name | Yes |
| `WASABI_ENDPOINT` | Wasabi endpoint URL | Yes |
| `NEXT_PUBLIC_APP_URL` | Your app URL (for CORS) | No |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Yes for auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes for auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | No |

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
│   │   └── upload/
│   │       └── route.ts          # Pre-signed URL API endpoint
│   ├── layout.tsx                # Root layout with Toaster
│   ├── page.tsx                  # Main page with FileUploader
│   └── globals.css               # Global styles
├── components/
│   ├── ui/                       # Shadcn UI components
│   └── FileUploader.tsx          # Main file upload component
└── lib/
    ├── utils.ts                  # Utility functions
    └── wasabi.ts                 # Wasabi client configuration
```

## API Endpoints

### POST /api/upload

Generates a pre-signed URL for file upload.

**Request body:**
```json
{
  "filename": "example.jpg",
  "contentType": "image/jpeg"
}
```

**Response:**
```json
{
  "uploadUrl": "https://s3.wasabisys.com/bucket-name",
  "fields": {
    "key": "uploads/1234567890-example.jpg",
    "Content-Type": "image/jpeg",
    // ... other form fields
  },
  "key": "uploads/1234567890-example.jpg"
}
```

## Usage

1. Open the application in your browser
2. Drag and drop files onto the upload area, or click to select files
3. Files will be uploaded directly to your Wasabi bucket
4. Upload progress and completion status will be displayed
5. Toast notifications will confirm successful uploads

## Customization

### File Types

Modify the `acceptedFileTypes` prop in `FileUploader.tsx`:

```typescript
acceptedFileTypes={['image/*', 'application/pdf']}
```

### File Size Limits

Adjust the `maxFileSize` prop and API route conditions:

```typescript
maxFileSize={50 * 1024 * 1024} // 50MB
```

### Upload Destination

Change the key prefix in `src/app/api/upload/route.ts`:

```typescript
const key = `custom-folder/${Date.now()}-${filename}`;
```

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
   - Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

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

1. **CORS Errors**: Ensure your Wasabi bucket has the correct CORS policy
2. **Access Denied**: Verify your Wasabi credentials and bucket permissions
3. **Upload Failures**: Check file size limits and content type restrictions
4. **Authentication Issues**: Check Supabase URL and keys in environment variables

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).
