#!/bin/bash

# Docker production utility script for SAVD App
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose > /dev/null 2>&1; then
    print_error "docker-compose is not installed. Please install docker-compose and try again."
    exit 1
fi

# Check if .env.docker.prod exists
if [ ! -f ".env.docker.prod" ]; then
    print_warning ".env.docker.prod not found. Creating from example..."
    cp .env.docker.prod.example .env.docker.prod
    print_warning "Please edit .env.docker.prod with your actual production configuration values before continuing."
    exit 1
fi

case "$1" in
    "up"|"start")
        print_status "Starting SAVD App production environment..."
        docker-compose -f docker-compose.prod.yml up -d
        print_status "Production environment started!"
        print_status "Application available at http://localhost (or your configured domain)"
        ;;
    "down"|"stop")
        print_status "Stopping SAVD App production environment..."
        docker-compose -f docker-compose.prod.yml down
        print_status "Production environment stopped."
        ;;
    "restart")
        print_status "Restarting SAVD App production environment..."
        docker-compose -f docker-compose.prod.yml down
        docker-compose -f docker-compose.prod.yml up -d
        print_status "Production environment restarted!"
        ;;
    "rebuild")
        print_status "Rebuilding SAVD App production environment..."
        docker-compose -f docker-compose.prod.yml down
        docker-compose -f docker-compose.prod.yml build --no-cache
        docker-compose -f docker-compose.prod.yml up -d
        print_status "Production environment rebuilt and started!"
        ;;
    "logs")
        print_status "Showing production environment logs..."
        docker-compose -f docker-compose.prod.yml logs -f
        ;;
    "shell")
        print_status "Opening shell in SAVD App production container..."
        docker-compose -f docker-compose.prod.yml exec savd-app /bin/sh
        ;;
    "backup")
        print_status "Creating backup of production data..."
        mkdir -p backups
        BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
        docker-compose -f docker-compose.prod.yml exec -T redis redis-cli --rdb /tmp/backup.rdb
        docker cp $(docker-compose -f docker-compose.prod.yml ps -q redis):/tmp/backup.rdb ./backups/redis_backup_$BACKUP_DATE.rdb
        print_status "Redis backup created: backups/redis_backup_$BACKUP_DATE.rdb"
        ;;
    "health")
        print_status "Checking health of production services..."
        docker-compose -f docker-compose.prod.yml ps
        echo ""
        print_status "Health check results:"
        curl -s http://localhost:3000/api/health | jq '.' || curl -s http://localhost:3000/api/health
        ;;
    "update")
        print_status "Updating SAVD App production environment..."
        print_warning "This will pull latest images and restart services."
        read -p "Continue? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose -f docker-compose.prod.yml pull
            docker-compose -f docker-compose.prod.yml up -d
            print_status "Production environment updated!"
        else
            print_status "Update cancelled."
        fi
        ;;
    "clean")
        print_status "Cleaning up production environment..."
        print_error "WARNING: This will remove all containers, volumes, and data!"
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose -f docker-compose.prod.yml down -v
            docker system prune -f
            print_status "Production environment cleaned!"
        else
            print_status "Clean cancelled."
        fi
        ;;
    *)
        echo "SAVD App Docker Production Utility"
        echo ""
        echo "Usage: $0 {up|down|restart|rebuild|logs|shell|backup|health|update|clean}"
        echo ""
        echo "Commands:"
        echo "  up/start   - Start the production environment"
        echo "  down/stop  - Stop the production environment"
        echo "  restart    - Restart the production environment"
        echo "  rebuild    - Rebuild and restart the production environment"
        echo "  logs       - View logs from all services"
        echo "  shell      - Open a shell in the app container"
        echo "  backup     - Create a backup of production data"
        echo "  health     - Check health status of all services"
        echo "  update     - Pull latest images and restart services"
        echo "  clean      - Stop and clean up all containers, volumes, and images"
        echo ""
        exit 1
        ;;
esac