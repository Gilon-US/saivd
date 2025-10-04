# SAVD App - Deployment & DevOps

## Overview

This document outlines the deployment architecture and DevOps practices for the SAVD App. It covers containerization with Docker, deployment configurations, CI/CD pipelines, monitoring, and operational considerations to ensure reliable and scalable operation of the application.

## Deployment Architecture

### Docker Containerization

The SAVD App is containerized using Docker to ensure consistent environments across development, testing, and production:

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

### Multi-Stage Dockerfile

The application uses a multi-stage Dockerfile for optimized builds:

```dockerfile
# ---- Base stage ----
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies with exact versions for production stability
RUN npm ci --only=production && npm cache clean --force

# Install dev dependencies for build stage
FROM base AS dev-deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Build stage ----
FROM base AS builder

# Copy dev dependencies
COPY --from=dev-deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create nextjs group and user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Copy built application
COPY --from=builder /app/public ./public

# Copy built Next.js files with correct ownership
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy package.json for reference
COPY --from=builder /app/package.json ./package.json

# Switch to nextjs user
USER nextjs

# Expose port
EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
```

### Docker Compose Configuration

#### Development Environment

```yaml
# docker-compose.yml
version: '3.8'

services:
  savd-app:
    build:
      context: .
      dockerfile: Dockerfile
      target: dev-deps
    image: savd-app:dev
    container_name: savd-app-dev
    restart: unless-stopped
    env_file:
      - .env.docker
    environment:
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true
      - WATCHPACK_POLLING=true
    ports:
      - "${APP_PORT:-3000}:3000"
    volumes:
      # Bind mount source code for hot reloading
      - type: bind
        source: .
        target: /app
        bind:
          propagation: cached
      # Use named volumes for node_modules and .next to avoid conflicts
      - node_modules:/app/node_modules
      - next_cache:/app/.next
    command: >
      sh -c "npm install && npm run dev"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - savd-network

volumes:
  node_modules:
  next_cache:

networks:
  savd-network:
    driver: bridge
```

#### Production Environment

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: savd-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf:/etc/nginx/conf.d
      - ./nginx/ssl:/etc/nginx/ssl
      - ./nginx/logs:/var/log/nginx
    depends_on:
      - savd-app
    networks:
      - savd-network

  savd-app:
    build:
      context: .
      dockerfile: Dockerfile
      target: runner
    image: savd-app:prod
    container_name: savd-app-prod
    restart: unless-stopped
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production
    expose:
      - "3000"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - savd-network

  redis:
    image: redis:7-alpine
    container_name: savd-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - savd-network

volumes:
  redis_data:

networks:
  savd-network:
    driver: bridge
```

### Nginx Configuration

```nginx
# nginx/conf/default.conf
server {
    listen 80;
    server_name example.com www.example.com;
    
    # Redirect HTTP to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name example.com www.example.com;
    
    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;
    
    # HSTS Configuration
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    
    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https://api.example.com; media-src 'self' blob: https:; object-src 'none'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'; upgrade-insecure-requests;" always;
    
    # Proxy Configuration
    location / {
        proxy_pass http://savd-app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Static Files Caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg)$ {
        proxy_pass http://savd-app:3000;
        proxy_cache_valid 200 7d;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    
    # Large Media Files
    location ~* \.(mp4|webm|mov)$ {
        proxy_pass http://savd-app:3000;
        proxy_buffering on;
        proxy_buffer_size 1m;
        proxy_buffers 16 1m;
        proxy_busy_buffers_size 2m;
        proxy_max_temp_file_size 0;
        client_max_body_size 0;
    }
    
    # Gzip Configuration
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_proxied any;
    gzip_vary on;
    gzip_types
        application/javascript
        application/json
        application/x-javascript
        application/xml
        application/xml+rss
        text/css
        text/javascript
        text/plain
        text/xml;
    
    # Error Pages
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
}
```

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Lint
        run: npm run lint
        
      - name: Type check
        run: npm run type-check
        
      - name: Run tests
        run: npm test
  
  build:
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
        
      - name: Login to DockerHub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
          
      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: |
            yourusername/savd-app:latest
            yourusername/savd-app:${{ github.sha }}
          cache-from: type=registry,ref=yourusername/savd-app:buildcache
          cache-to: type=registry,ref=yourusername/savd-app:buildcache,mode=max
  
  deploy:
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    
    steps:
      - name: Deploy to production
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USERNAME }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /path/to/savd-app
            docker-compose -f docker-compose.prod.yml pull
            docker-compose -f docker-compose.prod.yml up -d
```

### Deployment Scripts

```bash
# scripts/docker-dev.sh
#!/bin/bash

# Development environment script
case "$1" in
  up)
    docker-compose up -d
    ;;
  down)
    docker-compose down
    ;;
  logs)
    docker-compose logs -f
    ;;
  shell)
    docker-compose exec savd-app /bin/sh
    ;;
  rebuild)
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d
    ;;
  clean)
    docker-compose down -v
    ;;
  *)
    echo "Usage: $0 {up|down|logs|shell|rebuild|clean}"
    exit 1
    ;;
esac

exit 0
```

```bash
# scripts/docker-prod.sh
#!/bin/bash

# Production environment script
case "$1" in
  up)
    docker-compose -f docker-compose.prod.yml up -d
    ;;
  down)
    docker-compose -f docker-compose.prod.yml down
    ;;
  logs)
    docker-compose -f docker-compose.prod.yml logs -f
    ;;
  shell)
    docker-compose -f docker-compose.prod.yml exec savd-app /bin/sh
    ;;
  rebuild)
    docker-compose -f docker-compose.prod.yml down
    docker-compose -f docker-compose.prod.yml build --no-cache
    docker-compose -f docker-compose.prod.yml up -d
    ;;
  health)
    docker-compose -f docker-compose.prod.yml exec savd-app node healthcheck.js
    ;;
  backup)
    DATE=$(date +%Y%m%d_%H%M%S)
    docker-compose -f docker-compose.prod.yml exec -T redis redis-cli SAVE
    docker cp savd-redis:/data/dump.rdb ./backups/redis_dump_${DATE}.rdb
    echo "Backup created: ./backups/redis_dump_${DATE}.rdb"
    ;;
  *)
    echo "Usage: $0 {up|down|logs|shell|rebuild|health|backup}"
    exit 1
    ;;
esac

exit 0
```

## Environment Configuration

### Development Environment

```env
# .env.docker
# Application
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Wasabi
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.wasabisys.com
WASABI_ACCESS_KEY_ID=your-wasabi-access-key
WASABI_SECRET_ACCESS_KEY=your-wasabi-secret-key
WASABI_BUCKET_NAME=your-wasabi-bucket

# External Watermarking Service
WATERMARK_SERVICE_URL=https://api.watermarking-service.com
WATERMARK_SERVICE_API_KEY=your-watermarking-api-key
```

### Production Environment

```env
# .env.production
# Application
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://example.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Wasabi
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.wasabisys.com
WASABI_ACCESS_KEY_ID=your-wasabi-access-key
WASABI_SECRET_ACCESS_KEY=your-wasabi-secret-key
WASABI_BUCKET_NAME=your-wasabi-bucket

# External Watermarking Service
WATERMARK_SERVICE_URL=https://api.watermarking-service.com
WATERMARK_SERVICE_API_KEY=your-watermarking-api-key

# Redis
REDIS_URL=redis://redis:6379
```

## Monitoring & Logging

### Health Check Endpoint

```typescript
// src/app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Perform basic health checks
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
    };

    return NextResponse.json(healthData, { status: 200 });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json(
      { 
        status: 'unhealthy', 
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
```

### Logging Strategy

1. **Application Logs**:
   - Structured JSON logging for machine readability
   - Log levels (debug, info, warn, error)
   - Request/response logging for API endpoints
   - Error logging with stack traces

2. **Infrastructure Logs**:
   - Container logs collected via Docker logging driver
   - Nginx access and error logs
   - System metrics (CPU, memory, disk usage)

3. **Log Aggregation**:
   - Centralized log collection (e.g., ELK stack, Loki)
   - Log retention policies
   - Log search and analysis

### Monitoring Tools

1. **Application Monitoring**:
   - Health check endpoints
   - Performance metrics
   - Error rate tracking

2. **Infrastructure Monitoring**:
   - Container health and resource usage
   - Host metrics
   - Network traffic

3. **Alerting**:
   - Critical error alerts
   - Performance degradation alerts
   - Security incident alerts

## Backup & Recovery

### Database Backup

1. **Supabase Backups**:
   - Automated daily backups
   - Point-in-time recovery
   - Manual backup before major changes

2. **Redis Backup**:
   - RDB snapshots
   - AOF persistence
   - Regular backup script execution

### Application Recovery

1. **Rollback Strategy**:
   - Docker image versioning
   - Database migration rollback plans
   - Configuration version control

2. **Disaster Recovery**:
   - Regular recovery testing
   - Documentation of recovery procedures
   - Backup verification

## Security Practices

### Infrastructure Security

1. **Network Security**:
   - Firewall configuration
   - VPC/subnet isolation
   - HTTPS everywhere

2. **Container Security**:
   - Minimal base images
   - Non-root user execution
   - Regular security updates

3. **Secret Management**:
   - Environment variables for secrets
   - No hardcoded credentials
   - Rotation policies for API keys

### Application Security

1. **Authentication & Authorization**:
   - JWT token validation
   - Role-based access control
   - Session management

2. **Input Validation**:
   - Server-side validation
   - Parameterized queries
   - Content Security Policy

3. **Output Encoding**:
   - XSS prevention
   - CSRF protection
   - Secure headers

## Scaling Strategy

### Horizontal Scaling

1. **Container Orchestration**:
   - Docker Swarm or Kubernetes for production
   - Load balancing across instances
   - Auto-scaling based on metrics

2. **Database Scaling**:
   - Connection pooling
   - Read replicas for high-traffic scenarios
   - Sharding for future growth

### Performance Optimization

1. **Caching Strategy**:
   - Redis for session and data caching
   - Browser caching for static assets
   - CDN integration for media delivery

2. **Resource Optimization**:
   - Container resource limits
   - Database query optimization
   - Asynchronous processing for heavy tasks

## Implementation Guidelines

1. **Development Workflow**:
   - Use feature branches
   - Pull request reviews
   - Automated testing before merge

2. **Deployment Process**:
   - Blue-green deployments
   - Canary releases for critical changes
   - Rollback procedures

3. **Operational Procedures**:
   - Incident response plan
   - Change management process
   - Regular security audits

4. **Documentation**:
   - Architecture documentation
   - Operational runbooks
   - Troubleshooting guides
