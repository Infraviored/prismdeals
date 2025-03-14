#!/bin/bash

# KleinanzeigenScraper Initial Setup Script
# This script performs the initial setup of the application

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}KleinanzeigenScraper Initial Setup Script${NC}"
echo -e "${BLUE}=======================================${NC}"

# Get the current directory
INSTALL_DIR=$(pwd)
echo -e "Installing in: ${INSTALL_DIR}"

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is not installed. Please install Python 3 and try again.${NC}"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}jq is not installed. This is required for parsing JSON configuration.${NC}"
    echo -e "${YELLOW}On Debian/Ubuntu systems, run:${NC}"
    echo -e "${GREEN}sudo apt install jq${NC}"
    exit 1
fi

# Get Python version
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo -e "Found Python version: ${PYTHON_VERSION}"

# 1. Create Python virtual environment
echo -e "\n${YELLOW}Step 1: Creating Python virtual environment...${NC}"

# Check if python3-venv is installed
if ! python3 -m venv --help &> /dev/null; then
    echo -e "${RED}The 'venv' module is not available. You need to install the python3-venv package.${NC}"
    echo -e "${YELLOW}On Debian/Ubuntu systems, run:${NC}"
    echo -e "${GREEN}sudo apt install python3-venv${NC}"
    exit 1
fi

# Create the virtual environment
if [ ! -d "${INSTALL_DIR}/venv" ]; then
    python3 -m venv "${INSTALL_DIR}/venv"
else
    echo -e "${YELLOW}Virtual environment already exists.${NC}"
fi

# Activate the virtual environment
source "${INSTALL_DIR}/venv/bin/activate"

# 2. Install Python requirements
echo -e "\n${YELLOW}Step 2: Installing Python requirements...${NC}"
pip install --upgrade pip
pip install -r requirements.txt

# 3. Create data directory
echo -e "\n${YELLOW}Step 3: Creating data directory...${NC}"
mkdir -p "${INSTALL_DIR}/data"

# 4. Check for configuration file
echo -e "\n${YELLOW}Step 4: Checking configuration...${NC}"
CONFIG_FILE="${INSTALL_DIR}/config.json"
EXAMPLE_CONFIG="${INSTALL_DIR}/config.example.json"

if [ ! -f "$CONFIG_FILE" ]; then
    if [ -f "$EXAMPLE_CONFIG" ]; then
        echo -e "${YELLOW}Configuration file not found. Creating from example...${NC}"
        
        # Interactive configuration setup
        echo -e "\n${BLUE}=== KleinanzeigenScraper Configuration Setup ===${NC}"
        echo -e "${YELLOW}Please provide the following information to configure the application.${NC}"
        echo -e "${YELLOW}Press Enter to accept the default value shown in brackets.${NC}\n"
        
        # Create a temporary file for the new configuration
        TMP_CONFIG=$(mktemp)
        
        # Load example configuration
        cp "$EXAMPLE_CONFIG" "$TMP_CONFIG"
        
        # Server configuration
        DEFAULT_PORT=$(jq -r '.server.port' "$TMP_CONFIG")
        read -p "API server port [$DEFAULT_PORT]: " SERVER_PORT
        SERVER_PORT=${SERVER_PORT:-$DEFAULT_PORT}
        jq ".server.port = $SERVER_PORT" "$TMP_CONFIG" > "$TMP_CONFIG.tmp" && mv "$TMP_CONFIG.tmp" "$TMP_CONFIG"
        
        # Service configuration
        DEFAULT_SERVICE_NAME=$(jq -r '.service.name' "$TMP_CONFIG")
        read -p "Service name [$DEFAULT_SERVICE_NAME]: " SERVICE_NAME
        SERVICE_NAME=${SERVICE_NAME:-$DEFAULT_SERVICE_NAME}
        jq ".service.name = \"$SERVICE_NAME\"" "$TMP_CONFIG" > "$TMP_CONFIG.tmp" && mv "$TMP_CONFIG.tmp" "$TMP_CONFIG"
        
        DEFAULT_SERVICE_USER=$(jq -r '.service.user' "$TMP_CONFIG")
        read -p "Service user [$(whoami)]: " SERVICE_USER
        SERVICE_USER=${SERVICE_USER:-$(whoami)}
        jq ".service.user = \"$SERVICE_USER\"" "$TMP_CONFIG" > "$TMP_CONFIG.tmp" && mv "$TMP_CONFIG.tmp" "$TMP_CONFIG"
        
        DEFAULT_WORKING_DIR=$(jq -r '.service.working_directory' "$TMP_CONFIG")
        read -p "Working directory [$INSTALL_DIR]: " WORKING_DIR
        WORKING_DIR=${WORKING_DIR:-$INSTALL_DIR}
        jq ".service.working_directory = \"$WORKING_DIR\"" "$TMP_CONFIG" > "$TMP_CONFIG.tmp" && mv "$TMP_CONFIG.tmp" "$TMP_CONFIG"
        
        # OpenAI configuration
        read -p "OpenAI API key (leave empty if using environment variable): " OPENAI_API_KEY
        jq ".openai.api_key = \"$OPENAI_API_KEY\"" "$TMP_CONFIG" > "$TMP_CONFIG.tmp" && mv "$TMP_CONFIG.tmp" "$TMP_CONFIG"
        
        DEFAULT_MODEL=$(jq -r '.openai.model' "$TMP_CONFIG")
        read -p "OpenAI model [$DEFAULT_MODEL]: " OPENAI_MODEL
        OPENAI_MODEL=${OPENAI_MODEL:-$DEFAULT_MODEL}
        jq ".openai.model = \"$OPENAI_MODEL\"" "$TMP_CONFIG" > "$TMP_CONFIG.tmp" && mv "$TMP_CONFIG.tmp" "$TMP_CONFIG"
        
        # Save the configuration
        mv "$TMP_CONFIG" "$CONFIG_FILE"
        echo -e "${GREEN}Configuration saved to ${CONFIG_FILE}${NC}"
    else
        echo -e "${RED}Neither configuration file ${CONFIG_FILE} nor example ${EXAMPLE_CONFIG} found.${NC}"
        echo -e "${YELLOW}Please create a configuration file manually.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Configuration file already exists: ${CONFIG_FILE}${NC}"
fi

# Load configuration values
echo -e "${YELLOW}Loading configuration from ${CONFIG_FILE}...${NC}"
SERVICE_NAME=$(jq -r '.service.name' "$CONFIG_FILE")
WORKING_DIR=$(jq -r '.service.working_directory' "$CONFIG_FILE")
SERVICE_USER=$(jq -r '.service.user' "$CONFIG_FILE")

# Function to reinstall the service
reinstall_service() {
    local service_name=$1
    
    echo -e "\n${YELLOW}Reinstalling service: ${service_name}${NC}"
    
    # Ensure we have absolute paths
    ABSOLUTE_INSTALL_DIR=$(realpath "${INSTALL_DIR}")
    ABSOLUTE_VENV_DIR=$(realpath "${INSTALL_DIR}/venv")
    ABSOLUTE_BACKEND_DIR=$(realpath "${INSTALL_DIR}/backend")
    
    # Create the service file
    cat > ${service_name}.service << EOL
[Unit]
Description=Kleinanzeigen Scraper API
After=network.target

[Service]
User=${SERVICE_USER:-$(whoami)}
Group=$(id -gn ${SERVICE_USER:-$(whoami)})
WorkingDirectory=${WORKING_DIR:-$ABSOLUTE_INSTALL_DIR}
Environment="PATH=${ABSOLUTE_VENV_DIR}/bin:${PATH}"
ExecStart=${ABSOLUTE_VENV_DIR}/bin/python ${ABSOLUTE_BACKEND_DIR}/api_server.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOL

    echo -e "${GREEN}Service file created: ${service_name}.service${NC}"
    echo -e "${YELLOW}Service configuration:${NC}"
    echo -e "  User: ${SERVICE_USER:-$(whoami)}"
    echo -e "  Working Directory: ${WORKING_DIR:-$ABSOLUTE_INSTALL_DIR}"
    echo -e "  Python Path: ${ABSOLUTE_VENV_DIR}/bin/python"
    echo -e "  API Server Path: ${ABSOLUTE_BACKEND_DIR}/api_server.py"
    
    # Stop the service if it's running
    if systemctl is-active --quiet ${service_name}.service; then
        echo -e "${YELLOW}Stopping existing service...${NC}"
        sudo systemctl stop ${service_name}.service
    fi
    
    # Install the service
    echo -e "${YELLOW}Installing service...${NC}"
    sudo cp ${service_name}.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable ${service_name}.service
    
    # Start the service
    echo -e "${YELLOW}Starting service...${NC}"
    sudo systemctl start ${service_name}.service
    
    # Check if service started successfully
    sleep 3
    if systemctl is-active --quiet ${service_name}.service; then
        echo -e "${GREEN}Service installed and started successfully.${NC}"
    else
        echo -e "${RED}Service failed to start. Checking status...${NC}"
        sudo systemctl status ${service_name}.service
        echo -e "${YELLOW}Checking logs...${NC}"
        sudo journalctl -u ${service_name}.service -n 20 --no-pager
    fi
}

# Check for command line arguments
if [ "$1" = "--reinstall-service" ]; then
    # Reinstall the service
    reinstall_service "$SERVICE_NAME"
    exit 0
fi

# 5. Create systemd service file
echo -e "\n${YELLOW}Step 5: Creating systemd service file...${NC}"

# Use the reinstall_service function
reinstall_service "$SERVICE_NAME"

# 7. Final instructions
echo -e "\n${GREEN}Initial setup completed!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Make sure your OpenAI API key is set in the configuration"
echo -e "2. Run the deployment script to deploy the application:"
echo -e "   ${GREEN}./deploy.sh${NC}"

# Deactivate virtual environment
deactivate 