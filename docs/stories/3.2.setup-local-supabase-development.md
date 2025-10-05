# Story 3.2: Setup Local Supabase Development Environment

## Status

Ready for Review

## Story

**As a** developer,
**I want** to set up a local Supabase instance using Docker Compose,
**so that** I can develop and test authentication and database features without relying on the production Supabase instance.

## Acceptance Criteria

1. Local Supabase instance can be started with Docker Compose
2. SAVD app can connect to the local Supabase instance
3. Authentication flow works with the local Supabase instance
4. Database schema is properly initialized in the local instance
5. Development workflow documentation is updated with local setup instructions

## Tasks / Subtasks

- [ ] Set up local Supabase Docker configuration (AC: 1)
  - [ ] Clone Supabase repository and copy Docker configuration files
  - [ ] Configure environment variables for local Supabase
  - [ ] Create script to start local Supabase services
  - [ ] Test Supabase services startup and accessibility
- [ ] Create Docker Compose configuration for SAVD app with Supabase integration (AC: 2)
  - [ ] Create docker-compose.supabase.yml file for combined setup
  - [ ] Configure environment variables for local development
  - [ ] Set up Docker networking between app and Supabase
  - [ ] Create .env.docker file with appropriate configuration
- [ ] Implement database initialization for local development (AC: 4)
  - [ ] Create SQL initialization script for profiles table
  - [ ] Add initialization script to Supabase Docker setup
  - [ ] Verify schema creation on Supabase startup
  - [ ] Test database access and permissions
- [ ] Update application code for local Supabase compatibility (AC: 3)
  - [ ] Modify Supabase client configuration to support local URLs
  - [ ] Add conditional logic for development environment
  - [ ] Test authentication flow with local Supabase
  - [ ] Verify JWT token handling with local setup
- [ ] Create development workflow script (AC: 5)
  - [ ] Implement start-dev-with-supabase.sh script
  - [ ] Add health check and readiness detection
  - [ ] Include proper error handling and logging
  - [ ] Test the complete startup sequence
- [ ] Document local development workflow (AC: 5)
  - [ ] Update README.md with local Supabase setup instructions
  - [ ] Document environment variables and configuration options
  - [ ] Add troubleshooting section for common issues
  - [ ] Include testing instructions for local development

## Dev Notes

### Previous Story Insights

Story 3.1 implemented the watermarking API integration. This story focuses on improving the development workflow by enabling local Supabase development, which will make testing authentication and database features more efficient.

### Data Models

**Profiles Table** [Source: docs/architecture/03-database-design.md]

```sql
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);
```

### Local Supabase Architecture [Source: docs/architecture/04-authentication-security.md]

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Docker Environment                                   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                      Docker Network                                     │    │
│  │                                                                         │    │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐  │    │
│  │  │                 │    │                 │    │                     │  │    │
│  │  │  SAVD App       │    │  Supabase       │    │  Supabase Studio    │  │    │
│  │  │  Container      │◀───▶  Services       │◀───▶  (Admin UI)         │  │    │
│  │  │  (Port 3000)    │    │  (Port 8000)    │    │  (Port 8000)        │  │    │
│  │  │                 │    │                 │    │                     │  │    │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────────┘  │    │
│  │         │                       │                       │               │    │
│  │         ▼                       ▼                       ▼               │    │
│  │  ┌─────────────┐        ┌─────────────────┐     ┌─────────────────┐     │    │
│  │  │ next_cache  │        │ postgres_data   │     │ storage_data    │     │    │
│  │  │  Volume     │        │  Volume         │     │  Volume         │     │    │
│  │  └─────────────┘        └─────────────────┘     └─────────────────┘     │    │
│  │                                                                         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Docker Compose Configuration [Source: docs/architecture/04-authentication-security.md]

```yaml
version: "3.8"

services:
  # Import existing SAVD app service
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
      # Add Supabase environment variables
      - NEXT_PUBLIC_SUPABASE_URL=http://kong:8000
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
    ports:
      - "${APP_PORT:-3000}:3000"
    volumes:
      - type: bind
        source: .
        target: /app
        bind:
          propagation: cached
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
      - supabase-network # Connect to Supabase network

networks:
  savd-network:
    driver: bridge
  supabase-network:
    external: true
    name: supabase-local_default # Use the network created by Supabase Docker Compose

volumes:
  node_modules:
  next_cache:
```

### Environment Variables [Source: docs/architecture/04-authentication-security.md]

```
# SAVD App Configuration
APP_PORT=3000

# Supabase Configuration - these should match your Supabase local setup
NEXT_PUBLIC_SUPABASE_URL=http://kong:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Supabase Environment Configuration [Source: docs/architecture/04-authentication-security.md]

```bash
# General
COMPOSE_PROJECT_NAME=supabase

# API URL
SUPABASE_PUBLIC_URL=http://localhost:8000

# Database
POSTGRES_PASSWORD=your-secure-postgres-password
POSTGRES_DB=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432

# JWT
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
ANON_KEY=
SERVICE_ROLE_KEY=

# Dashboard
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=secure-dashboard-password

# Pooler
POOLER_TENANT_ID=your-tenant-id
POOLER_PROXY_PORT_TRANSACTION=6543

# SMTP for auth emails
SMTP_HOST=mail
SMTP_PORT=2500
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=Supabase
```

### Development Workflow Script [Source: docs/architecture/04-authentication-security.md]

```bash
#!/bin/bash

# Start Supabase services if not already running
echo "Starting Supabase services..."
cd supabase-local
docker compose up -d
cd ..

# Wait for Supabase to be ready
echo "Waiting for Supabase services to be ready..."
until $(curl --output /dev/null --silent --head --fail http://localhost:8000/rest/v1/); do
  printf '.'
  sleep 5
done
echo "Supabase is ready!"

# Start SAVD app with Supabase integration
echo "Starting SAVD app with Supabase integration..."
docker compose -f docker-compose.supabase.yml up -d

echo "Development environment is ready!"
echo "- SAVD app: http://localhost:3000"
echo "- Supabase Studio: http://localhost:8000"
echo "  Username: admin"
echo "  Password: secure-dashboard-password"
```

### File Locations

- **Supabase Local Setup**: `supabase-local/` directory
- **Docker Compose Config**: `docker-compose.supabase.yml`
- **Environment Variables**: `.env.docker`
- **Development Script**: `scripts/start-dev-with-supabase.sh`
- **Database Init Script**: `supabase-local/volumes/db/init/01-profiles-schema.sql`
- **Documentation**: `README.md`

### Technical Constraints

- Use Docker Compose for container orchestration
- Ensure proper networking between SAVD app and Supabase services
- Configure JWT tokens correctly for local development
- Implement proper volume mounting for data persistence
- Follow security best practices for local development
- Ensure compatibility with existing authentication flow

## Testing

- Test Supabase services startup and accessibility
- Verify database schema initialization
- Test authentication flow with local Supabase
- Verify database operations (CRUD) with local setup
- Test development workflow script
- Verify proper error handling and logging

## File List

- supabase-local/.env (new)
- supabase-local/docker-compose.yml (new)
- supabase-local/volumes/kong/kong.yml (new)
- supabase-local/volumes/db/init/01-profiles-schema.sql (new)
- docker-compose.supabase.yml (new)
- .env.docker (modified)
- scripts/start-dev-with-supabase.sh (new)
- README.md (modified)
- src/lib/supabase.ts (modified)

## Dev Agent Record

### Debug Log

1. Docker commands like `mkdir -p` and `chmod +x` may not work directly through the run_command tool. These operations were handled by creating files directly.
2. The local Supabase setup requires proper Docker network configuration to allow communication between the SAVD app container and Supabase services.
3. The database initialization script includes all tables from the database design document to ensure a complete local development environment.

### Completion Notes

1. Created a complete local Supabase development environment using Docker Compose
2. Implemented database initialization with all necessary tables, indexes, and policies
3. Updated the Supabase client configuration to support local URLs (http instead of https)
4. Created a development workflow script with proper error handling and service readiness checks
5. Added comprehensive documentation for local Supabase development in README.md
6. Modified environment variables to support both local and production Supabase instances

### Change Log

| Date       | Version | Description    | Author |
| ---------- | ------- | -------------- | ------ |
| 2025-09-21 | 1.0     | Initial draft  | SM     |
| 2025-09-21 | 1.1     | Implementation | Dev    |
