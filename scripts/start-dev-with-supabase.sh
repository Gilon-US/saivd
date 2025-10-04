#!/bin/bash

# SAVD App - Local Development with Supabase
# This script starts both the local Supabase instance and the SAVD app

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print header
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}  SAVD App - Local Development with Supabase${NC}"
echo -e "${GREEN}==================================================${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
  exit 1
fi

# Function to check if a container is running
container_is_running() {
  docker ps --format '{{.Names}}' | grep -q "^$1$"
}

# Function to wait for a service to be ready
wait_for_service() {
  local service_name=$1
  local url=$2
  local max_attempts=$3
  local attempt=1

  echo -e "${YELLOW}Waiting for $service_name to be ready...${NC}"
  
  while [ $attempt -le $max_attempts ]; do
    if curl --output /dev/null --silent --head --fail "$url"; then
      echo -e "${GREEN}$service_name is ready!${NC}"
      return 0
    fi
    
    echo -e "${YELLOW}Attempt $attempt/$max_attempts: $service_name is not ready yet. Waiting...${NC}"
    sleep 5
    attempt=$((attempt+1))
  done
  
  echo -e "${RED}$service_name did not become ready in time.${NC}"
  return 1
}

# Start Supabase services if not already running
echo -e "${YELLOW}Starting Supabase services...${NC}"
cd supabase-local

# Check if supabase containers are already running
if container_is_running "supabase-local_db_1" && container_is_running "supabase-local_kong_1"; then
  echo -e "${GREEN}Supabase services are already running.${NC}"
else
  # Start Supabase services
  docker compose up -d
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to start Supabase services. Check the error message above.${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}Supabase services started successfully.${NC}"
fi

cd ..

# Wait for Supabase to be ready
wait_for_service "Supabase API" "http://localhost:8000/rest/v1/" 12
if [ $? -ne 0 ]; then
  echo -e "${RED}Supabase API did not become available. Check the Supabase logs for errors:${NC}"
  echo -e "${YELLOW}docker logs supabase-local_kong_1${NC}"
  exit 1
fi

# Start SAVD app with Supabase integration
echo -e "${YELLOW}Starting SAVD app with Supabase integration...${NC}"

# Check if SAVD app container is already running
if container_is_running "savd-app-dev"; then
  echo -e "${YELLOW}SAVD app container is already running. Stopping it first...${NC}"
  docker stop savd-app-dev
  docker rm savd-app-dev
fi

# Start SAVD app
docker compose -f docker-compose.supabase.yml up -d

if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to start SAVD app. Check the error message above.${NC}"
  exit 1
fi

echo -e "${GREEN}SAVD app started successfully.${NC}"

# Wait for SAVD app to be ready
wait_for_service "SAVD app" "http://localhost:3000/api/health" 12
if [ $? -ne 0 ]; then
  echo -e "${RED}SAVD app did not become available. Check the app logs for errors:${NC}"
  echo -e "${YELLOW}docker logs savd-app-dev${NC}"
  exit 1
fi

# Print success message
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}  Development environment is ready!${NC}"
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}SAVD app: ${NC}http://localhost:3000"
echo -e "${GREEN}Supabase Studio: ${NC}http://localhost:8000"
echo -e "${GREEN}Supabase API: ${NC}http://localhost:8000/rest/v1/"
echo -e "${GREEN}==================================================${NC}"
echo -e "${YELLOW}To view logs:${NC}"
echo -e "  SAVD app: ${NC}docker logs -f savd-app-dev"
echo -e "  Supabase: ${NC}docker logs -f supabase-local_studio_1"
echo -e "${GREEN}==================================================${NC}"

# Make the script executable
chmod +x scripts/start-dev-with-supabase.sh
