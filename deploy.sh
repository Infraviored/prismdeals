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

# Check if config.json exists
CONFIG_FILE="${INSTALL_DIR}/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Configuration file not found: ${CONFIG_FILE}${NC}"
    echo -e "${YELLOW}Please run the setup script first: ./install-python-backend.sh${NC}"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}jq is not installed. This is required for parsing JSON configuration.${NC}"
    echo -e "${YELLOW}On Debian/Ubuntu systems, run:${NC}"
    echo -e "${GREEN}sudo apt install jq${NC}"
    exit 1
fi

# Load configuration values
echo -e "${YELLOW}Loading configuration from ${CONFIG_FILE}...${NC}"
SERVICE_NAME=$(jq -r '.service.name' "$CONFIG_FILE")
SERVER_PORT=$(jq -r '.server.port' "$CONFIG_FILE")
WEBROOT_DIR=$(jq -r '.nginx.webroot // ""' "$CONFIG_FILE")
WEBROOT_PERMS=$(jq -r '.nginx.permissions // "755"' "$CONFIG_FILE")
WEBROOT_OWNER=$(jq -r '.nginx.owner // ""' "$CONFIG_FILE")

# Check if jq command succeeded
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to parse configuration file. Make sure it's valid JSON.${NC}"
    exit 1
fi

# Display loaded configuration
echo -e "${YELLOW}Using configuration:${NC}"
echo -e "  Service Name: ${SERVICE_NAME}"
echo -e "  Server Port: ${SERVER_PORT}"
if [ ! -z "$WEBROOT_DIR" ]; then
    echo -e "  Webroot Directory: ${WEBROOT_DIR}"
    echo -e "  Webroot Permissions: ${WEBROOT_PERMS}"
    if [ ! -z "$WEBROOT_OWNER" ]; then
        echo -e "  Webroot Owner: ${WEBROOT_OWNER}"
    fi
fi

# Define paths
BACKEND_DIR="${INSTALL_DIR}/backend"
FRONTEND_DIR="${INSTALL_DIR}/frontend"
DATA_DIR="${INSTALL_DIR}/data"

# Check if we have a complete configuration
CONFIG_COMPLETE=false
if [ ! -z "$WEBROOT_DIR" ] && [ ! -z "$WEBROOT_PERMS" ] && [ ! -z "$WEBROOT_OWNER" ]; then
    CONFIG_COMPLETE=true
    echo -e "\n${GREEN}Complete configuration detected.${NC}"
    echo -e "${YELLOW}Do you want to deploy directly using all configuration values? (y/n)${NC}"
    read -r deploy_directly
    
    if [[ "$deploy_directly" =~ ^[Yy]$ ]]; then
        DEPLOY_FRONTEND=true
        INTERACTIVE_MODE=false
        echo -e "${GREEN}Deploying directly with all configuration values.${NC}"
    else
        INTERACTIVE_MODE=true
        echo -e "${YELLOW}Switching to interactive mode.${NC}"
    fi
else
    INTERACTIVE_MODE=true
fi

# Frontend deployment
if [ "$INTERACTIVE_MODE" = true ]; then
    echo -e "\n${YELLOW}Do you want to deploy the frontend files? (y/n)${NC}"
    read -r deploy_frontend_response
    if [[ "$deploy_frontend_response" =~ ^[Yy]$ ]]; then
        DEPLOY_FRONTEND=true
    else
        DEPLOY_FRONTEND=false
    fi
fi

if [ "$DEPLOY_FRONTEND" = true ]; then
    # Use webroot directory from config or ask if not available
    if [ "$INTERACTIVE_MODE" = true ]; then
        if [ -z "$WEBROOT_DIR" ]; then
            read -p "Enter the webroot directory: " WEBROOT_DIR
            
            if [ -z "$WEBROOT_DIR" ]; then
                echo -e "${RED}No webroot directory provided. Skipping frontend deployment.${NC}"
                DEPLOY_FRONTEND=false
            fi
        else
            echo -e "${YELLOW}Using webroot directory from config: ${WEBROOT_DIR}${NC}"
            # Confirm the directory
            read -p "Do you want to use this directory? (y/n) [y]: " use_config_webroot
            use_config_webroot=${use_config_webroot:-y}
            
            if [[ ! "$use_config_webroot" =~ ^[Yy]$ ]]; then
                read -p "Enter the webroot directory: " WEBROOT_DIR
                if [ -z "$WEBROOT_DIR" ]; then
                    echo -e "${RED}No webroot directory provided. Skipping frontend deployment.${NC}"
                    DEPLOY_FRONTEND=false
                fi
            fi
        fi
    fi
    
    if [ "$DEPLOY_FRONTEND" = true ] && [ ! -z "$WEBROOT_DIR" ]; then
        echo -e "\n${YELLOW}Step 1: Deploying frontend...${NC}"
        
        # Check if we need sudo for this directory
        if [ ! -w "$(dirname "$WEBROOT_DIR")" ]; then
            echo -e "${YELLOW}No write access to parent directory. Will use sudo for operations.${NC}"
            USE_SUDO=true
        else
            USE_SUDO=false
        fi
        
        # Create the webroot directory if it doesn't exist
        if [ ! -d "$WEBROOT_DIR" ]; then
            echo -e "${YELLOW}Creating webroot directory: ${WEBROOT_DIR}${NC}"
            if [ "$USE_SUDO" = true ]; then
                sudo mkdir -p "$WEBROOT_DIR"
            else
                mkdir -p "$WEBROOT_DIR"
            fi
        fi
        
        # Copy the frontend files to the webroot
        echo -e "${YELLOW}Copying frontend files to webroot...${NC}"
        if [ "$USE_SUDO" = true ]; then
            sudo cp -r ${FRONTEND_DIR}/* "$WEBROOT_DIR/"
        else
            cp -r ${FRONTEND_DIR}/* "$WEBROOT_DIR/"
        fi
        
        # Set permissions from config
        echo -e "${YELLOW}Setting permissions to ${WEBROOT_PERMS}...${NC}"
        if [ "$USE_SUDO" = true ]; then
            sudo chmod -R ${WEBROOT_PERMS} "$WEBROOT_DIR"
        else
            chmod -R ${WEBROOT_PERMS} "$WEBROOT_DIR"
        fi
        
        # Set ownership from config if available
        if [ ! -z "$WEBROOT_OWNER" ]; then
            echo -e "${YELLOW}Setting owner to ${WEBROOT_OWNER}...${NC}"
            if [ "$USE_SUDO" = true ]; then
                sudo chown -R ${WEBROOT_OWNER} "$WEBROOT_DIR"
            else
                chown -R ${WEBROOT_OWNER} "$WEBROOT_DIR"
            fi
        fi
        
        # Ask if user wants to update the config with new values (only in interactive mode)
        if [ "$INTERACTIVE_MODE" = true ]; then
            echo -e "\n${YELLOW}Do you want to update the configuration with these settings? (y/n) [n]:${NC}"
            read -r update_config
            update_config=${update_config:-n}
            
            if [[ "$update_config" =~ ^[Yy]$ ]]; then
                # Create a temporary file
                TMP_CONFIG=$(mktemp)
                
                # Update the nginx section with permissions and owner
                jq ".nginx.permissions = \"$WEBROOT_PERMS\" | .nginx.owner = \"$WEBROOT_OWNER\"" "$CONFIG_FILE" > "$TMP_CONFIG"
                
                # Check if jq command succeeded
                if [ $? -eq 0 ]; then
                    # Replace the original file
                    mv "$TMP_CONFIG" "$CONFIG_FILE"
                    echo -e "${GREEN}Configuration updated successfully.${NC}"
                else
                    echo -e "${RED}Failed to update configuration. Please check the JSON structure.${NC}"
                    rm "$TMP_CONFIG"
                fi
            fi
        fi
    fi
fi

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

# Check if the service is installed
if [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
    # Check if service is active
    if systemctl is-active --quiet ${SERVICE_NAME}.service; then
        echo -e "${YELLOW}Restarting API server...${NC}"
        sudo systemctl restart ${SERVICE_NAME}.service
        
        # Wait a moment for the service to restart
        sleep 3
        
        # Check if service restarted successfully
        if systemctl is-active --quiet ${SERVICE_NAME}.service; then
            echo -e "${GREEN}API server restarted successfully.${NC}"
        else
            echo -e "${RED}API server failed to restart. Checking status...${NC}"
            sudo systemctl status ${SERVICE_NAME}.service
        fi
    else
        echo -e "${YELLOW}API server is not running. Starting...${NC}"
        sudo systemctl start ${SERVICE_NAME}.service
        
        # Wait a moment for the service to start
        sleep 3
        
        # Check if service started successfully
        if systemctl is-active --quiet ${SERVICE_NAME}.service; then
            echo -e "${GREEN}API server started successfully.${NC}"
        else
            echo -e "${RED}API server failed to start. Checking status...${NC}"
            sudo systemctl status ${SERVICE_NAME}.service
        fi
    fi
else
    echo -e "${YELLOW}API server service not found. You may need to set it up manually.${NC}"
    echo -e "${YELLOW}Run the install script first:${NC} ./install-python-backend.sh"
    echo -e "${YELLOW}Or create a systemd service file manually:${NC}"
    
    # Get absolute paths
    ABSOLUTE_INSTALL_DIR=$(realpath "${INSTALL_DIR}")
    ABSOLUTE_VENV_DIR=$(realpath "${INSTALL_DIR}/venv")
    ABSOLUTE_BACKEND_DIR=$(realpath "${INSTALL_DIR}/backend")
    
    echo -e "${BLUE}[Unit]
Description=Kleinanzeigen Scraper API
After=network.target

[Service]
User=$(whoami)
Group=$(id -gn)
WorkingDirectory=${ABSOLUTE_INSTALL_DIR}
Environment="PATH=${ABSOLUTE_VENV_DIR}/bin:${PATH}"
ExecStart=${ABSOLUTE_VENV_DIR}/bin/python ${ABSOLUTE_BACKEND_DIR}/api_server.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target${NC}"
    
    echo -e "${YELLOW}Save this to /etc/systemd/system/${SERVICE_NAME}.service${NC}"
    echo -e "${YELLOW}Then run: sudo systemctl daemon-reload && sudo systemctl enable --now ${SERVICE_NAME}.service${NC}"
fi

# 4. Verify deployment
echo -e "\n${YELLOW}Step 4: Verifying deployment...${NC}"

# Check if the API server is running
if systemctl is-active --quiet ${SERVICE_NAME}.service; then
    echo -e "${GREEN}API server is running.${NC}"
    
    # Wait a moment to ensure the API is fully started
    sleep 2
    
    # Check if the API is accessible
    if curl -s http://localhost:${SERVER_PORT}/api/status > /dev/null; then
        echo -e "${GREEN}API is accessible at http://localhost:${SERVER_PORT}/api/status${NC}"
        API_STATUS=$(curl -s http://localhost:${SERVER_PORT}/api/status)
        echo -e "${GREEN}API status: ${API_STATUS}${NC}"
    else
        echo -e "${RED}API server is running but not accessible at http://localhost:${SERVER_PORT}/api/status${NC}"
        echo -e "${YELLOW}Checking service logs...${NC}"
        sudo journalctl -u ${SERVICE_NAME}.service -n 20 --no-pager
        
        echo -e "${YELLOW}Checking firewall status...${NC}"
        if command -v ufw &> /dev/null; then
            sudo ufw status | grep ${SERVER_PORT}
        fi
        echo -e "${YELLOW}You may need to open port ${SERVER_PORT} in your firewall.${NC}"
    fi
else
    echo -e "${RED}API server is not running.${NC}"
    echo -e "${YELLOW}Checking service status...${NC}"
    sudo systemctl status ${SERVICE_NAME}.service
    
    echo -e "${YELLOW}Checking service logs...${NC}"
    sudo journalctl -u ${SERVICE_NAME}.service -n 20 --no-pager
fi

echo -e "\n${GREEN}Deployment completed!${NC}"
echo -e "${YELLOW}API: http://localhost:${SERVER_PORT}/api/${NC}"

echo -e "\n${BLUE}Useful commands:${NC}"
echo -e "  ${GREEN}View API server logs:${NC} sudo journalctl -u ${SERVICE_NAME}.service -f"
echo -e "  ${GREEN}Restart API server:${NC} sudo systemctl restart ${SERVICE_NAME}.service"
echo -e "  ${GREEN}Check API server status:${NC} sudo systemctl status ${SERVICE_NAME}.service"