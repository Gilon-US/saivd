# Supabase Local Development Setup

This directory contains the configuration for running Supabase locally using Docker.

## Setup Instructions

### 1. Create Environment File

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

### 2. Configure Kong Gateway

The Kong gateway configuration requires JWT tokens. Create the kong.yml file:

```bash
mkdir -p volumes/kong
cp volumes/kong/kong.yml.example volumes/kong/kong.yml
```

The `kong.yml` file will use environment variables from your `.env` file:
- `${ANON_KEY}` - Supabase anonymous key
- `${SERVICE_ROLE_KEY}` - Supabase service role key

### 3. Generate JWT Tokens (Optional)

If you need to generate new JWT tokens, you can use the default Supabase demo keys:

**Anon Key:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

**Service Role Key:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```

Add these to your `.env` file as `ANON_KEY` and `SERVICE_ROLE_KEY`.

### 4. Start Supabase

```bash
docker-compose up -d
```

### 5. Access Services

- **Supabase Studio**: http://localhost:8000
- **API Gateway**: http://localhost:8000

## Security Notes

⚠️ **Important**: The `volumes/` directory is gitignored to prevent committing sensitive configuration files with secrets. Never commit files containing actual JWT tokens or passwords to version control.

## Troubleshooting

If you encounter issues:

1. Ensure all environment variables are set in `.env`
2. Check that `volumes/kong/kong.yml` exists and has the correct environment variable references
3. Restart the services: `docker-compose down && docker-compose up -d`
