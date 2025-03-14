#!/bin/bash

# KleinanzeigenScraper Deployment Script
# This script deploys both the frontend and backend components

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

# Define paths
NGINX_DIR="/home/flo/docker-projects/nginx"
WEBROOT_DIR="${NGINX_DIR}/webroot/kleinanzeigenScraper"
BACKEND_DIR="${INSTALL_DIR}/backend"
FRONTEND_DIR="${INSTALL_DIR}/frontend"
DATA_DIR="${INSTALL_DIR}/data"

# 1. Deploy the frontend
echo -e "\n${YELLOW}Step 1: Deploying frontend...${NC}"

# Create the webroot directory if it doesn't exist
if [ ! -d "$WEBROOT_DIR" ]; then
    echo -e "${YELLOW}Creating webroot directory: ${WEBROOT_DIR}${NC}"
    sudo mkdir -p "$WEBROOT_DIR"
fi

# Copy the frontend files to the webroot
echo -e "${YELLOW}Copying frontend files to webroot...${NC}"
sudo cp -r ${FRONTEND_DIR}/* "$WEBROOT_DIR/"

# Set proper permissions
echo -e "${YELLOW}Setting proper permissions...${NC}"
sudo chmod -R 755 "$WEBROOT_DIR"

# 2. Deploy the backend
echo -e "\n${YELLOW}Step 2: Deploying backend...${NC}"

# Create data directory if it doesn't exist
if [ ! -d "$DATA_DIR" ]; then
    echo -e "${YELLOW}Creating data directory...${NC}"
    mkdir -p "$DATA_DIR"
fi

# Check if Python virtual environment exists, create if not
if [ ! -d "${INSTALL_DIR}/venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    python3 -m venv "${INSTALL_DIR}/venv"
fi

# Activate virtual environment and install dependencies
echo -e "${YELLOW}Installing Python dependencies...${NC}"
source "${INSTALL_DIR}/venv/bin/activate"
pip install --upgrade pip
pip install -r "${INSTALL_DIR}/requirements.txt"

# 3. Restart the API server
echo -e "\n${YELLOW}Step 3: Restarting the API server...${NC}"

# Check if the service is already installed
if systemctl is-active --quiet kleinanzeigen-scraper-api.service; then
    echo -e "${YELLOW}Restarting API server...${NC}"
    sudo systemctl restart kleinanzeigen-scraper-api.service
    echo -e "${GREEN}API server restarted successfully.${NC}"
else
    echo -e "${YELLOW}API server service not found. You may need to set it up manually.${NC}"
    echo -e "${YELLOW}Example systemd service file:${NC}"
    echo -e "${BLUE}[Unit]
Description=Kleinanzeigen Scraper API
After=network.target

[Service]
User=$(whoami)
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/venv/bin/python ${BACKEND_DIR}/api.py
Restart=on-failure

[Install]
WantedBy=multi-user.target${NC}"
    
    echo -e "${YELLOW}Save this to /etc/systemd/system/kleinanzeigen-scraper-api.service${NC}"
    echo -e "${YELLOW}Then run: sudo systemctl enable --now kleinanzeigen-scraper-api.service${NC}"
fi

# 4. Verify deployment
echo -e "\n${YELLOW}Step 4: Verifying deployment...${NC}"

# Check if the API server is running
if systemctl is-active --quiet kleinanzeigen-scraper-api.service; then
    echo -e "${GREEN}API server is running.${NC}"
    
    # Check if the API is accessible
    if curl -s http://localhost:3030/api/status > /dev/null; then
        echo -e "${GREEN}API is accessible at http://localhost:3030/api/status${NC}"
        API_STATUS=$(curl -s http://localhost:3030/api/status)
        echo -e "${GREEN}API status: ${API_STATUS}${NC}"
    else
        echo -e "${RED}API server is running but not accessible at http://localhost:3030/api/status${NC}"
    fi
else
    echo -e "${RED}API server is not running.${NC}"
fi

echo -e "\n${GREEN}Deployment completed!${NC}"
echo -e "${YELLOW}Frontend: https://kleinanzeigenScraper.infraviored.lol${NC}"
echo -e "${YELLOW}API: http://localhost:3030/api/${NC}"

echo -e "\n${BLUE}Useful commands:${NC}"
echo -e "  ${GREEN}View API server logs:${NC} sudo journalctl -u kleinanzeigen-scraper-api.service -f"
echo -e "  ${GREEN}Restart API server:${NC} sudo systemctl restart kleinanzeigen-scraper-api.service"
echo -e "  ${GREEN}Check API server status:${NC} sudo systemctl status kleinanzeigen-scraper-api.service" 