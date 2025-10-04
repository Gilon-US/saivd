#!/bin/bash

# Docker development utility script for SAVD App
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

# Check if .env.docker exists
if [ ! -f ".env.docker" ]; then
    print_warning ".env.docker not found. Creating from example..."
    cp .env.docker.example .env.docker
    print_warning "Please edit .env.docker with your actual configuration values before continuing."
    exit 1
fi

case "$1" in
    "up"|"start")
        print_status "Starting SAVD App development environment..."
        docker-compose up -d
        print_status "Development environment started! Visit http://localhost:3000"
        print_status "Run 'npm run docker:logs' to view logs"
        ;;
    "down"|"stop")
        print_status "Stopping SAVD App development environment..."
        docker-compose down
        print_status "Development environment stopped."
        ;;
    "restart")
        print_status "Restarting SAVD App development environment..."
        docker-compose down
        docker-compose up -d
        print_status "Development environment restarted!"
        ;;
    "rebuild")
        print_status "Rebuilding SAVD App development environment..."
        docker-compose down
        docker-compose build --no-cache
        docker-compose up -d
        print_status "Development environment rebuilt and started!"
        ;;
    "logs")
        print_status "Showing development environment logs..."
        docker-compose logs -f
        ;;
    "shell")
        print_status "Opening shell in SAVD App container..."
        docker-compose exec savd-app /bin/sh
        ;;
    "clean")
        print_status "Cleaning up development environment..."
        docker-compose down -v
        docker system prune -f
        print_status "Development environment cleaned!"
        ;;
    *)
        echo "SAVD App Docker Development Utility"
        echo ""
        echo "Usage: $0 {up|down|restart|rebuild|logs|shell|clean}"
        echo ""
        echo "Commands:"
        echo "  up/start   - Start the development environment"
        echo "  down/stop  - Stop the development environment"
        echo "  restart    - Restart the development environment"
        echo "  rebuild    - Rebuild and restart the development environment"
        echo "  logs       - View logs from all services"
        echo "  shell      - Open a shell in the app container"
        echo "  clean      - Stop and clean up all containers, volumes, and images"
        echo ""
        exit 1
        ;;
esac