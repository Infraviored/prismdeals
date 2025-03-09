#!/bin/bash

# KleinanzeigenScraper Frontend Deployment Script
# This script copies the frontend files to the Nginx webroot in Docker

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting KleinanzeigenScraper Frontend deployment...${NC}"

# Get the current directory
INSTALL_DIR=$(pwd)
echo -e "Installing from: ${INSTALL_DIR}"

# Define the Nginx webroot directory (Docker setup)
NGINX_DIR="/home/flo/docker-projects/nginx"
WEBROOT_DIR="${NGINX_DIR}/webroot/kleinanzeigen"

# Create the webroot directory if it doesn't exist
if [ ! -d "$WEBROOT_DIR" ]; then
    echo -e "${YELLOW}Creating webroot directory: ${WEBROOT_DIR}${NC}"
    mkdir -p "$WEBROOT_DIR"
fi

# Copy the frontend files to the webroot
echo -e "${YELLOW}Copying frontend files to webroot...${NC}"
cp -r frontend/* "$WEBROOT_DIR/"

# Set proper permissions
echo -e "${YELLOW}Setting proper permissions...${NC}"
chmod -R 755 "$WEBROOT_DIR"

# Copy the Nginx configuration file
echo -e "${YELLOW}Copying Nginx configuration file...${NC}"
cp kleinanzeigenScraper.infraviored.lol "${NGINX_DIR}/sites-available/kleinanzeigenScraper.infraviored.lol"

# Create a symbolic link in sites-enabled if it doesn't exist
if [ ! -f "${NGINX_DIR}/sites-enabled/kleinanzeigenScraper.infraviored.lol" ]; then
    echo -e "${YELLOW}Creating symbolic link in sites-enabled...${NC}"
    cd "${NGINX_DIR}/sites-enabled"
    ln -sf ../sites-available/kleinanzeigenScraper.infraviored.lol .
    cd -
fi

# Test and reload Nginx configuration using Docker
echo -e "${YELLOW}Testing Nginx configuration...${NC}"
cd "${NGINX_DIR}"
docker compose exec nginx nginx -t

if [ $? -eq 0 ]; then
    echo -e "${YELLOW}Reloading Nginx...${NC}"
    docker compose exec nginx nginx -s reload
    echo -e "${GREEN}Frontend deployment completed!${NC}"
    echo -e "${YELLOW}The frontend is now available at https://kleinanzeigenScraper.infraviored.lol${NC}"
else
    echo -e "${RED}Nginx configuration test failed. Please check the configuration.${NC}"
    exit 1
fi 