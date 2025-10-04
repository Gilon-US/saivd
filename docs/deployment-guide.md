# SAVD App - Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Configuration](#environment-configuration)
4. [Docker Deployment](#docker-deployment)
   - [Development Environment](#development-environment)
   - [Production Environment](#production-environment)
5. [Traditional Deployment](#traditional-deployment)
6. [Wasabi Cloud Storage Setup](#wasabi-cloud-storage-setup)
7. [Nginx Configuration](#nginx-configuration)
8. [SSL/HTTPS Setup](#sslhttps-setup)
9. [Monitoring and Maintenance](#monitoring-and-maintenance)
10. [Backup and Recovery](#backup-and-recovery)
11. [Troubleshooting](#troubleshooting)

## Overview

This guide provides detailed instructions for deploying the SAVD App in both development and production environments. The application supports Docker-based deployment (recommended) as well as traditional deployment methods.

## Prerequisites

### For All Deployment Methods

- Node.js 18+ installed
- Wasabi account with an S3 bucket
- Wasabi access key and secret key

### For Docker Deployment

- Docker Engine 20.0+
- Docker Compose 2.0+
- 2GB+ RAM available for containers
- 10GB+ disk space

### For Production Deployment

- Domain name (for production)
- SSL certificate (recommended)
- Firewall access for ports 80/443

## Environment Configuration

### Required Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `WASABI_ACCESS_KEY_ID` | Wasabi access key ID | Yes | - |
| `WASABI_SECRET_ACCESS_KEY` | Wasabi secret access key | Yes | - |
| `WASABI_REGION` | Wasabi region | Yes | us-east-1 |
| `WASABI_BUCKET_NAME` | Wasabi bucket name | Yes | - |
| `WASABI_ENDPOINT` | Wasabi endpoint URL | Yes | https://s3.wasabisys.com |
| `NEXT_PUBLIC_APP_URL` | App URL for CORS | No | http://localhost:3000 |
| `NODE_ENV` | Environment (development/production) | No | development |

### Environment Files

The project uses different environment files depending on the deployment method:

- `.env.local` - Local development without Docker
- `.env.docker` - Docker development environment
- `.env.docker.prod` - Docker production environment

Example `.env.local`:
```
WASABI_ACCESS_KEY_ID=your_wasabi_access_key_here
WASABI_SECRET_ACCESS_KEY=your_wasabi_secret_key_here
WASABI_REGION=us-east-1
WASABI_BUCKET_NAME=your_bucket_name_here
WASABI_ENDPOINT=https://s3.wasabisys.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Docker Deployment

Docker is the recommended deployment method as it provides consistency across environments and includes production-ready configurations.

### Development Environment

#### Setup

1. **Create environment file**:
   ```bash
   cp .env.docker.example .env.docker
   ```

2. **Edit `.env.docker` with your Wasabi credentials**:
   ```
   WASABI_ACCESS_KEY_ID=your_wasabi_access_key_here
   WASABI_SECRET_ACCESS_KEY=your_wasabi_secret_key_here
   WASABI_REGION=us-east-1
   WASABI_BUCKET_NAME=your_bucket_name_here
   WASABI_ENDPOINT=https://s3.wasabisys.com
   APP_PORT=3000
   ```

#### Start Development Environment

```bash
npm run docker:dev
# or
./scripts/docker-dev.sh up
```

#### Development Commands

| Command | Description |
|---------|-------------|
| `npm run docker:dev` | Start development environment |
| `npm run docker:dev:down` | Stop development environment |
| `npm run docker:dev:logs` | View logs |
| `npm run docker:dev:shell` | Access container shell |
| `npm run docker:dev:rebuild` | Rebuild and restart |
| `npm run docker:dev:clean` | Clean up everything |

#### Development Features

- Hot reloading with volume mounts
- Source code synchronization
- Development-optimized container
- Automatic dependency installation

### Production Environment

#### Setup

1. **Create production environment file**:
   ```bash
   cp .env.docker.prod.example .env.docker.prod
   ```

2. **Edit `.env.docker.prod` with your production configuration**:
   ```
   WASABI_ACCESS_KEY_ID=your_wasabi_access_key_here
   WASABI_SECRET_ACCESS_KEY=your_wasabi_secret_key_here
   WASABI_REGION=us-east-1
   WASABI_BUCKET_NAME=your_bucket_name_here
   WASABI_ENDPOINT=https://s3.wasabisys.com
   APP_PORT=3000
   NGINX_PORT=80
   NGINX_HTTPS_PORT=443
   REDIS_PASSWORD=strong_password_here
   ```

#### Start Production Environment

```bash
npm run docker:prod
# or
./scripts/docker-prod.sh up
```

#### Production Commands

| Command | Description |
|---------|-------------|
| `npm run docker:prod` | Start production environment |
| `npm run docker:prod:down` | Stop production environment |
| `npm run docker:prod:logs` | View logs |
| `npm run docker:prod:shell` | Access container shell |
| `npm run docker:prod:rebuild` | Rebuild and restart |
| `npm run docker:prod:health` | Check service health |
| `npm run docker:prod:backup` | Backup data |

#### Production Architecture

The production Docker setup includes:

1. **SAVD App Container**:
   - Optimized Node.js application
   - Multi-stage build for minimal size
   - Non-root user for security
   - Health checks and monitoring

2. **Nginx Container**:
   - Reverse proxy and load balancer
   - Static file serving
   - SSL termination
   - Caching and compression
   - Rate limiting

3. **Redis Container** (optional):
   - Session storage
   - Caching
   - Password protection
   - Persistent volume

## Traditional Deployment

For environments where Docker is not available, you can deploy using traditional methods.

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your credentials
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Access the application**:
   - Open http://localhost:3000 in your browser

### Production Build

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build the application**:
   ```bash
   npm run build
   ```

3. **Start the production server**:
   ```bash
   npm start
   ```

### Vercel Deployment

As a Next.js application, SAVD App can be easily deployed to Vercel:

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel
   ```

3. **Set environment variables in Vercel dashboard**:
   - Add all required Wasabi credentials
   - Set `NODE_ENV` to `production`

## Wasabi Cloud Storage Setup

### Create a Wasabi Account

1. Sign up at [Wasabi](https://wasabi.com/)
2. Create a new bucket in your preferred region
3. Note the bucket name and region

### Generate Access Keys

1. Go to "Access Keys" in your Wasabi console
2. Create a new access key pair
3. Save the Access Key ID and Secret Access Key securely

### Configure CORS for Your Bucket

Add this CORS policy to your Wasabi bucket:

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

## Nginx Configuration

The Docker production setup includes Nginx as a reverse proxy. The configuration files are located in the `nginx/` directory.

### Main Nginx Configuration

The main configuration file (`nginx/nginx.conf`) includes:

- Worker process settings
- Event loop configuration
- HTTP server settings
- Logging configuration
- Include directives for site-specific configs

### Site Configuration

The site-specific configuration (`nginx/conf.d/default.conf`) includes:

- Server block for HTTP/HTTPS
- Proxy settings for Next.js
- Static file serving
- Caching rules
- Compression settings
- Security headers

### Customizing Nginx

To customize the Nginx configuration:

1. Edit the files in the `nginx/` directory
2. Rebuild the Docker containers:
   ```bash
   npm run docker:prod:rebuild
   ```

## SSL/HTTPS Setup

### Using Let's Encrypt (Recommended)

1. **Obtain certificates**:
   ```bash
   certbot certonly --webroot -w /var/www/html -d your-domain.com
   ```

2. **Copy certificates to the SSL directory**:
   ```bash
   mkdir -p ./ssl_certs
   cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl_certs/cert.pem
   cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl_certs/private.key
   ```

3. **Update Nginx configuration**:
   - Uncomment SSL sections in `nginx/conf.d/default.conf`
   - Update SSL certificate paths if necessary

4. **Restart the containers**:
   ```bash
   npm run docker:prod:restart
   ```

### Using Self-Signed Certificates (Development Only)

1. **Generate self-signed certificate**:
   ```bash
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ./ssl_certs/private.key -out ./ssl_certs/cert.pem
   ```

2. **Update Nginx configuration** as described above

## Monitoring and Maintenance

### Health Checks

The application includes a health check endpoint at `/api/health` that returns:

- Application status
- Uptime
- Environment
- Version information

You can monitor this endpoint using:

```bash
npm run docker:prod:health
```

### Container Logs

View logs from all containers:

```bash
npm run docker:prod:logs
```

### Resource Usage

Monitor container resource usage:

```bash
docker stats
```

### Updating the Application

To update the application:

1. Pull the latest code:
   ```bash
   git pull
   ```

2. Rebuild and restart containers:
   ```bash
   npm run docker:prod:rebuild
   ```

## Backup and Recovery

### Backup Data

The production environment includes a backup script:

```bash
npm run docker:prod:backup
```

This creates backups of:
- Redis data (if used)
- Any other persistent volumes

### Restore from Backup

To restore from a backup:

1. Stop the containers:
   ```bash
   npm run docker:prod:down
   ```

2. Replace the volume data with backup data
3. Restart the containers:
   ```bash
   npm run docker:prod
   ```

## Troubleshooting

### Common Issues

#### Docker Containers Won't Start

1. Check Docker and Docker Compose installation
2. Verify environment variables in `.env.docker` or `.env.docker.prod`
3. Check for port conflicts:
   ```bash
   netstat -tuln | grep 3000
   ```
4. Check container logs:
   ```bash
   docker-compose -f docker-compose.prod.yml logs
   ```

#### Upload Failures

1. Verify Wasabi credentials in environment variables
2. Check CORS configuration on Wasabi bucket
3. Ensure file size is under the limit (default 100MB)
4. Check browser console for JavaScript errors
5. Verify network connectivity to Wasabi

#### Nginx SSL Issues

1. Verify certificate paths in Nginx configuration
2. Check certificate validity:
   ```bash
   openssl x509 -in ./ssl_certs/cert.pem -text -noout
   ```
3. Check Nginx error logs:
   ```bash
   docker exec savd-nginx cat /var/log/nginx/error.log
   ```

#### Performance Issues

1. Check container resource limits in `docker-compose.prod.yml`
2. Monitor resource usage with `docker stats`
3. Consider scaling up container resources
4. Optimize Nginx caching configuration
