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

# 4. Create systemd service file
echo -e "\n${YELLOW}Step 4: Creating systemd service file...${NC}"

cat > kleinanzeigen-scraper-api.service << EOL
[Unit]
Description=Kleinanzeigen Scraper API
After=network.target

[Service]
User=$(whoami)
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/venv/bin/python ${INSTALL_DIR}/backend/api.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOL

echo -e "${GREEN}Service file created: kleinanzeigen-scraper-api.service${NC}"

# 5. Ask to install the service
echo -e "\n${YELLOW}Do you want to install and start the service now? (y/n)${NC}"
read -r install_service

if [[ "$install_service" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Installing service...${NC}"
    sudo cp kleinanzeigen-scraper-api.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable kleinanzeigen-scraper-api.service
    sudo systemctl start kleinanzeigen-scraper-api.service
    
    echo -e "${GREEN}Service installed and started.${NC}"
    echo -e "${YELLOW}You can check the status with:${NC} sudo systemctl status kleinanzeigen-scraper-api.service"
else
    echo -e "${YELLOW}To install the service later, run:${NC}"
    echo -e "${GREEN}sudo cp kleinanzeigen-scraper-api.service /etc/systemd/system/${NC}"
    echo -e "${GREEN}sudo systemctl daemon-reload${NC}"
    echo -e "${GREEN}sudo systemctl enable kleinanzeigen-scraper-api.service${NC}"
    echo -e "${GREEN}sudo systemctl start kleinanzeigen-scraper-api.service${NC}"
fi

# 6. Final instructions
echo -e "\n${GREEN}Initial setup completed!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Make sure your OpenAI API key is set in backend/config.py"
echo -e "2. Run the deployment script to deploy the application:"
echo -e "   ${GREEN}./deploy.sh${NC}"
echo -e "3. Access the application at https://kleinanzeigenScraper.infraviored.lol"

# Deactivate virtual environment
deactivate 