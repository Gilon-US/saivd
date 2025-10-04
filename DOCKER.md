# Docker Quick Reference - SAVD App

## Quick Start

### Development
```bash
# Copy environment file and edit with your values
cp .env.docker.example .env.docker

# Start development environment
npm run docker:dev

# View logs
npm run docker:dev:logs

# Stop when done
npm run docker:dev:down
```

### Production
```bash
# Copy production environment file and edit
cp .env.docker.prod.example .env.docker.prod

# Start production environment
npm run docker:prod

# Check health
npm run docker:prod:health

# View logs
npm run docker:prod:logs
```

## NPM Scripts Reference

### Development Scripts
| Command | Description |
|---------|-------------|
| `npm run docker:dev` | Start development environment |
| `npm run docker:dev:down` | Stop development environment |
| `npm run docker:dev:logs` | View development logs |
| `npm run docker:dev:shell` | Access container shell |
| `npm run docker:dev:rebuild` | Rebuild and restart |
| `npm run docker:dev:clean` | Clean up everything |

### Production Scripts
| Command | Description |
|---------|-------------|
| `npm run docker:prod` | Start production environment |
| `npm run docker:prod:down` | Stop production environment |
| `npm run docker:prod:logs` | View production logs |
| `npm run docker:prod:shell` | Access app container shell |
| `npm run docker:prod:rebuild` | Rebuild and restart |
| `npm run docker:prod:health` | Check service health |
| `npm run docker:prod:backup` | Backup production data |

## Direct Script Usage

### Development
```bash
./scripts/docker-dev.sh {up|down|restart|rebuild|logs|shell|clean}
```

### Production
```bash
./scripts/docker-prod.sh {up|down|restart|rebuild|logs|shell|backup|health|update|clean}
```

## Environment Files

### Development (.env.docker)
- Copy from `.env.docker.example`
- Update Wasabi credentials
- Use development-friendly settings

### Production (.env.docker.prod)
- Copy from `.env.docker.prod.example`
- Use secure passwords and keys
- Configure domain and SSL settings

## Port Mapping

### Development
- App: http://localhost:3000
- Health: http://localhost:3000/api/health

### Production
- Web: http://localhost (via Nginx)
- HTTPS: https://localhost:443 (if SSL configured)
- Direct App: http://localhost:3000 (internal)

## Container Architecture

### Development
- **savd-app-dev**: Next.js with hot reloading
- **Volumes**: Source code, node_modules, .next cache

### Production
- **savd-app-prod**: Optimized Next.js app
- **savd-nginx**: Reverse proxy with caching
- **savd-redis-prod**: Session storage and caching
- **Volumes**: Data persistence, logs, SSL certs

## Troubleshooting

### Common Issues

1. **Port conflicts**: Stop other services on ports 3000/80/443
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

2. **Docker not running**: Start Docker Desktop
   ```bash
   docker info
   ```

3. **Permission errors**: Ensure scripts are executable
   ```bash
   chmod +x scripts/*.sh
   ```

4. **Environment file missing**: Copy from examples
   ```bash
   cp .env.docker.example .env.docker
   ```

### Debug Commands

```bash
# Check running containers
docker-compose ps

# View all logs
docker-compose logs

# Inspect specific service
docker-compose logs savd-app

# Access container
docker-compose exec savd-app /bin/sh

# Check resource usage
docker stats

# Clean everything
docker system prune -a
```

### Health Checks

```bash
# Development
curl http://localhost:3000/api/health

# Production
npm run docker:prod:health

# Manual health check
docker-compose -f docker-compose.prod.yml ps
```

## Production Deployment Checklist

- [ ] Update `.env.docker.prod` with production values
- [ ] Configure SSL certificates (if using HTTPS)
- [ ] Set secure passwords for Redis/Database
- [ ] Update domain in Nginx configuration
- [ ] Test health endpoints
- [ ] Set up monitoring/logging
- [ ] Configure backup schedule
- [ ] Review security settings

## Maintenance

### Regular Tasks

```bash
# Update images
docker-compose pull

# Backup data (production)
npm run docker:prod:backup

# View disk usage
docker system df

# Clean unused resources
docker system prune
```

### Monitoring

```bash
# Service status
docker-compose ps

# Resource usage
docker stats

# Logs
docker-compose logs -f --tail=100

# Health status
curl -s http://localhost:3000/api/health | jq
```