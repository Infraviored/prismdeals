#!/bin/bash

# KleinanzeigenScraper Deployment Script
# This script deploys both the frontend and the API server

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}KleinanzeigenScraper Deployment Script${NC}"
echo -e "${BLUE}=====================================${NC}"

# Get the current directory
INSTALL_DIR=$(pwd)
echo -e "Installing from: ${INSTALL_DIR}"

# 1. Deploy the frontend
echo -e "\n${YELLOW}Step 1: Deploying frontend...${NC}"

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
cp kleinanzeigenScraper.infraviored.lol.conf "${NGINX_DIR}/sites-available/kleinanzeigenScraper.infraviored.lol"

# Create a symbolic link in sites-enabled if it doesn't exist
if [ ! -f "${NGINX_DIR}/sites-enabled/kleinanzeigenScraper.infraviored.lol" ]; then
    echo -e "${YELLOW}Creating symbolic link in sites-enabled...${NC}"
    ln -sf "../sites-available/kleinanzeigenScraper.infraviored.lol" "${NGINX_DIR}/sites-enabled/kleinanzeigenScraper.infraviored.lol"
fi

# 2. Set up the API server
echo -e "\n${YELLOW}Step 2: Setting up API server...${NC}"

# Copy the systemd service file
echo -e "${YELLOW}Copying systemd service file...${NC}"
cp kleinanzeigen-scraper-api.service /etc/systemd/system/

# Reload systemd
echo -e "${YELLOW}Reloading systemd...${NC}"
systemctl daemon-reload

# Enable the service
echo -e "${YELLOW}Enabling the service...${NC}"
systemctl enable kleinanzeigen-scraper-api.service

# 3. Test and reload configurations
echo -e "\n${YELLOW}Step 3: Testing and reloading configurations...${NC}"

# Test Nginx configuration
echo -e "${YELLOW}Testing Nginx configuration...${NC}"
cd "${NGINX_DIR}"
if ! docker compose exec nginx nginx -t; then
    echo -e "${RED}Nginx configuration test failed. Please check the configuration.${NC}"
    exit 1
fi

# Reload Nginx
echo -e "${YELLOW}Reloading Nginx...${NC}"
docker compose exec nginx nginx -s reload

# Restart the API server
echo -e "${YELLOW}Restarting the API server...${NC}"
systemctl restart kleinanzeigen-scraper-api.service

# 4. Verify deployment
echo -e "\n${YELLOW}Step 4: Verifying deployment...${NC}"

# Check if Nginx is serving the frontend
echo -e "${YELLOW}Checking if Nginx is serving the frontend...${NC}"
if curl -s -o /dev/null -w "%{http_code}" https://kleinanzeigenScraper.infraviored.lol > /dev/null 2>&1; then
    echo -e "${GREEN}Frontend is accessible at https://kleinanzeigenScraper.infraviored.lol${NC}"
else
    echo -e "${RED}Frontend is not accessible. Please check Nginx logs.${NC}"
fi

# Check if the API server is running
echo -e "${YELLOW}Checking if the API server is running...${NC}"
if systemctl is-active --quiet kleinanzeigen-scraper-api.service; then
    echo -e "${GREEN}API server is running${NC}"
else
    echo -e "${RED}API server is not running. Please check the logs.${NC}"
    systemctl status kleinanzeigen-scraper-api.service
fi

echo -e "\n${GREEN}Deployment completed!${NC}"
echo -e "${YELLOW}Frontend: https://kleinanzeigenScraper.infraviored.lol${NC}"
echo -e "${YELLOW}API: https://kleinanzeigenScraper.infraviored.lol/api/${NC}"
echo -e "${YELLOW}API Status: https://kleinanzeigenScraper.infraviored.lol/api/status${NC}"

echo -e "\n${BLUE}Useful commands:${NC}"
echo -e "  ${GREEN}View API server logs:${NC} sudo journalctl -u kleinanzeigen-scraper-api.service -f"
echo -e "  ${GREEN}Restart API server:${NC} sudo systemctl restart kleinanzeigen-scraper-api.service"
echo -e "  ${GREEN}Check API server status:${NC} sudo systemctl status kleinanzeigen-scraper-api.service"
echo -e "  ${GREEN}Reload Nginx:${NC} cd ${NGINX_DIR} && docker compose exec nginx nginx -s reload" 