#!/bin/bash

# KleinanzeigenScraper Web Configuration Script
# This script configures the web server for the KleinanzeigenScraper application
# Supports both traditional NGINX and Docker-based NGINX setups

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}KleinanzeigenScraper Web Configuration Script${NC}"
echo -e "${BLUE}=============================================${NC}"

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

# Load server port from configuration
SERVER_PORT=$(jq -r '.server.port' "$CONFIG_FILE")

# Try to load existing NGINX configuration from config.json
EXISTING_WEBROOT=$(jq -r '.nginx.webroot // ""' "$CONFIG_FILE")
EXISTING_DOMAIN_MAIN=$(jq -r '.domain.main // ""' "$CONFIG_FILE")
EXISTING_DOMAIN_APP=$(jq -r '.domain.app // ""' "$CONFIG_FILE")

# Determine NGINX setup type
echo -e "\n${YELLOW}NGINX Setup Type${NC}"
echo -e "1) System-installed NGINX"
echo -e "2) Docker-based NGINX"
read -p "Select your NGINX setup type (1/2): " nginx_type

if [ "$nginx_type" == "2" ]; then
    DOCKER_NGINX=true
    echo -e "${GREEN}Using Docker-based NGINX configuration.${NC}"
else
    DOCKER_NGINX=false
    echo -e "${GREEN}Using system-installed NGINX configuration.${NC}"
    
    # Check if NGINX is installed for system setup
    if ! command -v nginx &> /dev/null; then
        echo -e "${YELLOW}NGINX does not appear to be installed on this system.${NC}"
        read -p "Do you want to continue anyway? (y/n): " continue_without_nginx
        if [[ ! "$continue_without_nginx" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Exiting. Please install NGINX before running this script.${NC}"
            exit 0
        fi
    fi
fi

# Function to list existing NGINX sites (for system NGINX)
list_system_nginx_sites() {
    echo -e "\n${BLUE}=== Existing NGINX Sites ===${NC}"
    
    # Check sites-available directory
    if [ -d "/etc/nginx/sites-available" ]; then
        echo -e "${YELLOW}Sites in /etc/nginx/sites-available:${NC}"
        ls -1 /etc/nginx/sites-available/ | grep -v "default" | while read site; do
            if [ -L "/etc/nginx/sites-enabled/$site" ]; then
                echo -e "  - ${GREEN}$site${NC} (enabled)"
            else
                echo -e "  - $site (disabled)"
            fi
        done
    elif [ -d "/etc/nginx/conf.d" ]; then
        echo -e "${YELLOW}Sites in /etc/nginx/conf.d:${NC}"
        ls -1 /etc/nginx/conf.d/ | grep -v "default" | while read site; do
            echo -e "  - $site"
        done
    else
        echo -e "${YELLOW}No standard NGINX configuration directories found.${NC}"
    fi
    
    echo ""
}

# Function to list existing Docker NGINX sites
list_docker_nginx_sites() {
    echo -e "\n${BLUE}=== Docker NGINX Configuration ===${NC}"
    read -p "Enter the path to your Docker NGINX main directory: " DOCKER_NGINX_DIR
    
    if [ -z "$DOCKER_NGINX_DIR" ]; then
        echo -e "${YELLOW}No directory provided. Skipping site listing.${NC}"
        return
    fi
    
    if [ ! -d "$DOCKER_NGINX_DIR" ]; then
        echo -e "${YELLOW}Directory not found: ${DOCKER_NGINX_DIR}${NC}"
        return
    fi
    
    # Check if we have read access to the directory
    if [ ! -r "$DOCKER_NGINX_DIR" ]; then
        echo -e "${YELLOW}No read access to ${DOCKER_NGINX_DIR}. Trying with sudo...${NC}"
        if sudo test -r "$DOCKER_NGINX_DIR"; then
            echo -e "${GREEN}Access granted with sudo.${NC}"
            USE_SUDO=true
        else
            echo -e "${RED}Cannot access ${DOCKER_NGINX_DIR} even with sudo. Please check permissions.${NC}"
            return
        fi
    else
        USE_SUDO=false
    fi
    
    # Check for sites-available directory in Docker NGINX
    if [ -d "${DOCKER_NGINX_DIR}/sites-available" ]; then
        echo -e "${YELLOW}Sites in ${DOCKER_NGINX_DIR}/sites-available:${NC}"
        if [ "$USE_SUDO" = true ]; then
            sudo ls -1 "${DOCKER_NGINX_DIR}/sites-available" | grep -v "default" | grep ".conf$" | while read site; do
                if sudo test -L "${DOCKER_NGINX_DIR}/sites-enabled/$site"; then
                    echo -e "  - ${GREEN}$site${NC} (enabled)"
                else
                    echo -e "  - $site (disabled)"
                fi
            done
        else
            ls -1 "${DOCKER_NGINX_DIR}/sites-available" | grep -v "default" | grep ".conf$" | while read site; do
                if [ -L "${DOCKER_NGINX_DIR}/sites-enabled/$site" ]; then
                    echo -e "  - ${GREEN}$site${NC} (enabled)"
                else
                    echo -e "  - $site (disabled)"
                fi
            done
        fi
    elif [ -d "${DOCKER_NGINX_DIR}/conf.d" ]; then
        echo -e "${YELLOW}Sites in ${DOCKER_NGINX_DIR}/conf.d:${NC}"
        if [ "$USE_SUDO" = true ]; then
            sudo ls -1 "${DOCKER_NGINX_DIR}/conf.d" | grep -v "default" | grep ".conf$" | while read site; do
                echo -e "  - $site"
            done
        else
            ls -1 "${DOCKER_NGINX_DIR}/conf.d" | grep -v "default" | grep ".conf$" | while read site; do
                echo -e "  - $site"
            done
        fi
    else
        echo -e "${YELLOW}No standard NGINX configuration directories found in Docker NGINX.${NC}"
        echo -e "${YELLOW}Looking for .conf files directly in ${DOCKER_NGINX_DIR}:${NC}"
        if [ "$USE_SUDO" = true ]; then
            sudo ls -1 "${DOCKER_NGINX_DIR}" | grep ".conf$" | while read site; do
                echo -e "  - $site"
            done
        else
            ls -1 "${DOCKER_NGINX_DIR}" | grep ".conf$" | while read site; do
                echo -e "  - $site"
            done
        fi
    fi
    
    echo ""
    DOCKER_NGINX_MAIN_DIR="$DOCKER_NGINX_DIR"
    export USE_SUDO
}

# List existing NGINX sites based on setup type
if [ "$DOCKER_NGINX" = true ]; then
    list_docker_nginx_sites
    DOCKER_NGINX_DIR="$DOCKER_NGINX_MAIN_DIR"  # Preserve the value from the function
elif command -v nginx &> /dev/null; then
    list_system_nginx_sites
fi

# Ask if user wants to continue with configuration
read -p "Do you want to configure NGINX for KleinanzeigenScraper? (y/n): " configure_nginx
if [[ ! "$configure_nginx" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Exiting without configuring NGINX.${NC}"
    exit 0
fi

# Ask for domain information
echo -e "\n${YELLOW}Please provide domain information:${NC}"
read -p "Main domain (e.g., example.com) [${EXISTING_DOMAIN_MAIN}]: " DOMAIN_MAIN
DOMAIN_MAIN=${DOMAIN_MAIN:-$EXISTING_DOMAIN_MAIN}

read -p "Application subdomain (e.g., kleinanzeigenscraper.example.com) [${EXISTING_DOMAIN_APP}]: " DOMAIN_APP
DOMAIN_APP=${DOMAIN_APP:-$EXISTING_DOMAIN_APP}

if [ -z "$DOMAIN_MAIN" ] || [ -z "$DOMAIN_APP" ]; then
    echo -e "${RED}Domain information is required.${NC}"
    exit 1
fi

# Set up NGINX configuration directory based on setup type
if [ "$DOCKER_NGINX" = true ]; then
    if [ -z "$DOCKER_NGINX_DIR" ] || [ ! -d "$DOCKER_NGINX_DIR" ]; then
        read -p "Enter the path to your Docker NGINX main directory: " DOCKER_NGINX_DIR
        if [ -z "$DOCKER_NGINX_DIR" ] || [ ! -d "$DOCKER_NGINX_DIR" ]; then
            echo -e "${RED}Valid Docker NGINX main directory is required.${NC}"
            exit 1
        fi
        
        # Check if we have read access to the directory
        if [ ! -r "$DOCKER_NGINX_DIR" ]; then
            echo -e "${YELLOW}No read access to ${DOCKER_NGINX_DIR}. Trying with sudo...${NC}"
            if sudo test -r "$DOCKER_NGINX_DIR"; then
                echo -e "${GREEN}Access granted with sudo.${NC}"
                USE_SUDO=true
            else
                echo -e "${RED}Cannot access ${DOCKER_NGINX_DIR} even with sudo. Please check permissions.${NC}"
                exit 1
            fi
        else
            USE_SUDO=false
        fi
    fi
    
    # Determine the configuration directory within Docker NGINX
    if [ -d "${DOCKER_NGINX_DIR}/sites-available" ]; then
        NGINX_CONF_DIR="${DOCKER_NGINX_DIR}/sites-available"
        NGINX_ENABLED_DIR="${DOCKER_NGINX_DIR}/sites-enabled"
        USING_SITES_AVAILABLE=true
    elif [ -d "${DOCKER_NGINX_DIR}/conf.d" ]; then
        NGINX_CONF_DIR="${DOCKER_NGINX_DIR}/conf.d"
        USING_SITES_AVAILABLE=false
    else
        echo -e "${YELLOW}No standard NGINX configuration directories found in Docker NGINX.${NC}"
        echo -e "${YELLOW}Using main directory for configuration.${NC}"
        NGINX_CONF_DIR="${DOCKER_NGINX_DIR}"
        USING_SITES_AVAILABLE=false
    fi
    
    # Check if configuration for this domain already exists in Docker setup
    if [ "$USE_SUDO" = true ]; then
        CONFIG_EXISTS=$(sudo test -f "${NGINX_CONF_DIR}/${DOMAIN_APP}.conf" && echo "true" || echo "false")
    else
        CONFIG_EXISTS=$(test -f "${NGINX_CONF_DIR}/${DOMAIN_APP}.conf" && echo "true" || echo "false")
    fi
    
    if [ "$CONFIG_EXISTS" = "true" ]; then
        echo -e "${YELLOW}A configuration for ${DOMAIN_APP} already exists in ${NGINX_CONF_DIR}.${NC}"
        read -p "Do you want to overwrite it? (y/n): " overwrite_config
        if [[ ! "$overwrite_config" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Skipping NGINX configuration creation.${NC}"
            SKIP_CONFIG_CREATION=true
        fi
    fi
else
    # For system NGINX, check both sites-available and conf.d
    read -p "Nginx configuration directory (e.g., /etc/nginx) [/etc/nginx]: " NGINX_DIR
    NGINX_DIR=${NGINX_DIR:-/etc/nginx}
    
    if [ -f "${NGINX_DIR}/sites-available/${DOMAIN_APP}.conf" ]; then
        echo -e "${YELLOW}A configuration for ${DOMAIN_APP} already exists.${NC}"
        read -p "Do you want to overwrite it? (y/n): " overwrite_config
        if [[ ! "$overwrite_config" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Skipping NGINX configuration creation.${NC}"
            SKIP_CONFIG_CREATION=true
        fi
    elif [ -f "${NGINX_DIR}/conf.d/${DOMAIN_APP}.conf" ]; then
        echo -e "${YELLOW}A configuration for ${DOMAIN_APP} already exists in conf.d directory.${NC}"
        read -p "Do you want to overwrite it? (y/n): " overwrite_config
        if [[ ! "$overwrite_config" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Skipping NGINX configuration creation.${NC}"
            SKIP_CONFIG_CREATION=true
        fi
    fi
fi

# Ask for webroot directory
echo -e "\n${YELLOW}Please provide webroot information:${NC}"
read -p "Webroot directory (e.g., /path/to/nginx/webroot/kleinanzeigenScraper) [${EXISTING_WEBROOT}]: " WEBROOT_DIR
WEBROOT_DIR=${WEBROOT_DIR:-$EXISTING_WEBROOT}

if [ -z "$WEBROOT_DIR" ]; then
    echo -e "${RED}Webroot directory is required.${NC}"
    exit 1
fi

# Check if webroot already exists
if [ -d "$WEBROOT_DIR" ]; then
    echo -e "${YELLOW}Webroot directory ${WEBROOT_DIR} already exists.${NC}"
    read -p "Do you want to use this existing directory? (y/n): " use_existing_webroot
    if [[ ! "$use_existing_webroot" =~ ^[Yy]$ ]]; then
        read -p "Please provide a different webroot directory: " WEBROOT_DIR
        if [ -z "$WEBROOT_DIR" ]; then
            echo -e "${RED}Webroot directory is required.${NC}"
            exit 1
        fi
    fi
fi

# For Docker setup, ask for the host IP address
if [ "$DOCKER_NGINX" = true ]; then
    read -p "Enter the host IP address for API access from Docker (e.g., 172.17.0.1): " HOST_IP
    if [ -z "$HOST_IP" ]; then
        echo -e "${YELLOW}Using default Docker host IP: 172.17.0.1${NC}"
        HOST_IP="172.17.0.1"
    fi
    API_PROXY_PASS="http://${HOST_IP}:${SERVER_PORT}/api/"
else
    API_PROXY_PASS="http://localhost:${SERVER_PORT}/api/"
fi

# Create Nginx configuration file if not skipped
if [ -z "$SKIP_CONFIG_CREATION" ]; then
    echo -e "\n${YELLOW}Creating Nginx configuration file...${NC}"
    
    NGINX_CONFIG="${DOMAIN_APP}.conf"
    cat > "$NGINX_CONFIG" << EOL
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_APP};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN_APP};
    
    ssl_certificate /etc/letsencrypt/live/${DOMAIN_MAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_MAIN}/privkey.pem;

    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # API requests - proxy to Python backend on the host machine
    location /api/ {
        proxy_pass ${API_PROXY_PASS};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Serve static frontend files
    root ${WEBROOT_DIR};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html =404;
        
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }

    location /static/ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }
}
EOL

    echo -e "${GREEN}Nginx configuration file created: ${NGINX_CONFIG}${NC}"
    
    # Show the configuration and ask for confirmation
    echo -e "\n${YELLOW}Generated NGINX configuration:${NC}"
    echo -e "${BLUE}----------------------------------------${NC}"
    cat "$NGINX_CONFIG"
    echo -e "${BLUE}----------------------------------------${NC}"
    
    read -p "Does this configuration look correct? (y/n): " config_looks_good
    if [[ ! "$config_looks_good" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Please edit the configuration file manually: ${NGINX_CONFIG}${NC}"
        read -p "Continue with installation after you've edited the file? (y/n): " continue_after_edit
        if [[ ! "$continue_after_edit" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Exiting. You can continue the installation manually.${NC}"
            exit 0
        fi
    fi
fi

# Ask to install the configuration
echo -e "\n${YELLOW}Do you want to install the Nginx configuration? (y/n)${NC}"
read -r install_config

if [[ "$install_config" =~ ^[Yy]$ ]]; then
    if [ "$DOCKER_NGINX" = true ]; then
        # For Docker NGINX, use the determined configuration directory
        echo -e "${YELLOW}Copying configuration to ${NGINX_CONF_DIR}...${NC}"
        if [ "$USE_SUDO" = true ]; then
            sudo cp "$NGINX_CONFIG" "${NGINX_CONF_DIR}/"
            # Set appropriate permissions for Docker NGINX
            echo -e "${YELLOW}Setting appropriate permissions...${NC}"
            sudo chown root:root "${NGINX_CONF_DIR}/${NGINX_CONFIG}"
            sudo chmod 644 "${NGINX_CONF_DIR}/${NGINX_CONFIG}"
        else
            cp "$NGINX_CONFIG" "${NGINX_CONF_DIR}/"
        fi
        
        # If using sites-available/sites-enabled, create symbolic link
        if [ "$USING_SITES_AVAILABLE" = true ]; then
            echo -e "${YELLOW}Creating symbolic link in ${NGINX_ENABLED_DIR}...${NC}"
            if [ "$USE_SUDO" = true ]; then
                if sudo test -L "${NGINX_ENABLED_DIR}/${NGINX_CONFIG}"; then
                    echo -e "${YELLOW}Removing existing symbolic link...${NC}"
                    sudo rm "${NGINX_ENABLED_DIR}/${NGINX_CONFIG}"
                fi
                sudo ln -sf "${NGINX_CONF_DIR}/${NGINX_CONFIG}" "${NGINX_ENABLED_DIR}/"
            else
                if [ -L "${NGINX_ENABLED_DIR}/${NGINX_CONFIG}" ]; then
                    echo -e "${YELLOW}Removing existing symbolic link...${NC}"
                    rm "${NGINX_ENABLED_DIR}/${NGINX_CONFIG}"
                fi
                ln -sf "${NGINX_CONF_DIR}/${NGINX_CONFIG}" "${NGINX_ENABLED_DIR}/"
            fi
        fi
        
        echo -e "${GREEN}Configuration installed to Docker NGINX directory.${NC}"
        echo -e "${YELLOW}You may need to restart your Docker NGINX container for changes to take effect.${NC}"
        echo -e "${YELLOW}Example command: docker-compose restart nginx${NC}"
    else
        # For system NGINX, use sites-available/sites-enabled if they exist
        SITES_AVAILABLE="${NGINX_DIR}/sites-available"
        SITES_ENABLED="${NGINX_DIR}/sites-enabled"
        
        if [ ! -d "$SITES_AVAILABLE" ] || [ ! -d "$SITES_ENABLED" ]; then
            echo -e "${YELLOW}Nginx sites-available or sites-enabled directory not found.${NC}"
            echo -e "${YELLOW}Using conf.d directory instead.${NC}"
            
            read -p "Install to ${NGINX_DIR}/conf.d/ directory? (y/n): " use_confd
            if [[ "$use_confd" =~ ^[Yy]$ ]]; then
                # Create conf.d directory if it doesn't exist
                if [ ! -d "${NGINX_DIR}/conf.d" ]; then
                    echo -e "${YELLOW}Creating ${NGINX_DIR}/conf.d directory...${NC}"
                    sudo mkdir -p "${NGINX_DIR}/conf.d"
                fi
                
                # Copy the configuration to conf.d
                echo -e "${YELLOW}Copying configuration to ${NGINX_DIR}/conf.d...${NC}"
                sudo cp "$NGINX_CONFIG" "${NGINX_DIR}/conf.d/"
            else
                echo -e "${YELLOW}Skipping Nginx configuration installation.${NC}"
                echo -e "${YELLOW}You can install it manually later.${NC}"
            fi
        else
            # Copy the configuration to sites-available
            echo -e "${YELLOW}Copying configuration to ${SITES_AVAILABLE}...${NC}"
            sudo cp "$NGINX_CONFIG" "${SITES_AVAILABLE}/"
            
            # Create a symbolic link in sites-enabled
            echo -e "${YELLOW}Creating symbolic link in ${SITES_ENABLED}...${NC}"
            if [ -L "${SITES_ENABLED}/${NGINX_CONFIG}" ]; then
                echo -e "${YELLOW}Removing existing symbolic link...${NC}"
                sudo rm "${SITES_ENABLED}/${NGINX_CONFIG}"
            fi
            sudo ln -sf "${SITES_AVAILABLE}/${NGINX_CONFIG}" "${SITES_ENABLED}/"
        fi
        
        # Test Nginx configuration for system NGINX
        echo -e "${YELLOW}Testing Nginx configuration...${NC}"
        if sudo nginx -t; then
            echo -e "${GREEN}Nginx configuration test successful.${NC}"
            
            # Ask to reload Nginx
            read -p "Reload Nginx to apply changes? (y/n): " reload_nginx
            if [[ "$reload_nginx" =~ ^[Yy]$ ]]; then
                echo -e "${YELLOW}Reloading Nginx...${NC}"
                sudo systemctl reload nginx
                echo -e "${GREEN}Nginx reloaded successfully.${NC}"
            else
                echo -e "${YELLOW}Skipping Nginx reload. Changes will not take effect until Nginx is reloaded.${NC}"
                echo -e "${YELLOW}You can reload Nginx manually with: sudo systemctl reload nginx${NC}"
            fi
        else
            echo -e "${RED}Nginx configuration test failed. Please check the configuration.${NC}"
            read -p "Do you want to continue anyway? (y/n): " continue_after_fail
            if [[ ! "$continue_after_fail" =~ ^[Yy]$ ]]; then
                echo -e "${YELLOW}Exiting. Please fix the configuration and try again.${NC}"
                exit 1
            fi
        fi
    fi
else
    echo -e "${YELLOW}Skipping Nginx configuration installation.${NC}"
    if [ "$DOCKER_NGINX" = true ]; then
        echo -e "${YELLOW}You can install it manually later:${NC}"
        if [ "$USING_SITES_AVAILABLE" = true ]; then
            echo -e "${GREEN}cp ${NGINX_CONFIG} ${NGINX_CONF_DIR}/${NC}"
            echo -e "${GREEN}ln -sf ${NGINX_CONF_DIR}/${NGINX_CONFIG} ${NGINX_ENABLED_DIR}/${NC}"
        else
            echo -e "${GREEN}cp ${NGINX_CONFIG} ${NGINX_CONF_DIR}/${NC}"
        fi
        echo -e "${GREEN}docker-compose restart nginx${NC}"
    else
        echo -e "${YELLOW}You can install it manually later:${NC}"
        echo -e "${GREEN}sudo cp ${NGINX_CONFIG} ${NGINX_DIR}/sites-available/${NC}"
        echo -e "${GREEN}sudo ln -sf ${NGINX_DIR}/sites-available/${NGINX_CONFIG} ${NGINX_DIR}/sites-enabled/${NC}"
        echo -e "${GREEN}sudo nginx -t${NC}"
        echo -e "${GREEN}sudo systemctl reload nginx${NC}"
    fi
fi

# Create webroot directory
echo -e "\n${YELLOW}Do you want to create/setup the webroot directory? (y/n)${NC}"
read -r create_webroot

if [[ "$create_webroot" =~ ^[Yy]$ ]]; then
    if [ -d "$WEBROOT_DIR" ]; then
        echo -e "${YELLOW}Webroot directory ${WEBROOT_DIR} already exists.${NC}"
        read -p "Do you want to use this existing directory? (y/n): " use_existing_dir
        if [[ ! "$use_existing_dir" =~ ^[Yy]$ ]]; then
            read -p "Please provide a different webroot directory: " WEBROOT_DIR
            if [ -z "$WEBROOT_DIR" ]; then
                echo -e "${RED}Webroot directory is required.${NC}"
                exit 1
            }
            echo -e "${YELLOW}Creating webroot directory: ${WEBROOT_DIR}${NC}"
            if [ "$DOCKER_NGINX" = true ] && [ "$USE_SUDO" = true ]; then
                sudo mkdir -p "$WEBROOT_DIR"
            else
                mkdir -p "$WEBROOT_DIR"
            fi
        fi
    else
        echo -e "${YELLOW}Creating webroot directory: ${WEBROOT_DIR}${NC}"
        if [ "$DOCKER_NGINX" = true ] && [ "$USE_SUDO" = true ]; then
            sudo mkdir -p "$WEBROOT_DIR"
        else
            mkdir -p "$WEBROOT_DIR"
        fi
    fi
    
    # Ask for permissions
    read -p "Set permissions for webroot directory (e.g., 755) [755]: " WEBROOT_PERMS
    WEBROOT_PERMS=${WEBROOT_PERMS:-755}
    
    # Set permissions
    echo -e "${YELLOW}Setting permissions to ${WEBROOT_PERMS}...${NC}"
    if [ "$DOCKER_NGINX" = true ] && [ "$USE_SUDO" = true ]; then
        sudo chmod ${WEBROOT_PERMS} "$WEBROOT_DIR"
    else
        chmod ${WEBROOT_PERMS} "$WEBROOT_DIR"
    fi
    
    # Ask for ownership
    read -p "Set owner for webroot directory (e.g., www-data:www-data) [current owner]: " WEBROOT_OWNER
    if [ ! -z "$WEBROOT_OWNER" ]; then
        echo -e "${YELLOW}Setting owner to ${WEBROOT_OWNER}...${NC}"
        if [ "$DOCKER_NGINX" = true ] && [ "$USE_SUDO" = true ]; then
            sudo chown ${WEBROOT_OWNER} "$WEBROOT_DIR"
        else
            chown ${WEBROOT_OWNER} "$WEBROOT_DIR"
        fi
    fi
    
    echo -e "${GREEN}Webroot directory setup completed.${NC}"
else
    echo -e "${YELLOW}Skipping webroot directory creation.${NC}"
    echo -e "${YELLOW}You can create it manually later:${NC}"
    echo -e "${GREEN}mkdir -p ${WEBROOT_DIR}${NC}"
    echo -e "${GREEN}chmod 755 ${WEBROOT_DIR}${NC}"
fi

# Save configuration to config.json
echo -e "\n${YELLOW}Do you want to save these settings to config.json? (y/n)${NC}"
read -r save_config

if [[ "$save_config" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Updating config.json with web configuration...${NC}"
    
    # Create a temporary file
    TMP_CONFIG=$(mktemp)
    
    # Check if domain and nginx sections exist
    if jq -e '.domain' "$CONFIG_FILE" > /dev/null 2>&1; then
        # Domain section exists, update it
        DOMAIN_EXISTS=true
    else
        # Domain section doesn't exist, need to create it
        DOMAIN_EXISTS=false
    fi
    
    if jq -e '.nginx' "$CONFIG_FILE" > /dev/null 2>&1; then
        # Nginx section exists, update it
        NGINX_EXISTS=true
    else
        # Nginx section doesn't exist, need to create it
        NGINX_EXISTS=false
    fi
    
    if jq -e '.api' "$CONFIG_FILE" > /dev/null 2>&1; then
        # API section exists, update it
        API_EXISTS=true
    else
        # API section doesn't exist, need to create it
        API_EXISTS=false
    fi
    
    # Build the jq filter based on what sections exist
    JQ_FILTER=""
    
    if [ "$DOMAIN_EXISTS" = true ]; then
        JQ_FILTER+="(.domain.main = \"$DOMAIN_MAIN\") | (.domain.app = \"$DOMAIN_APP\") | "
    else
        JQ_FILTER+="(.domain = {\"main\": \"$DOMAIN_MAIN\", \"app\": \"$DOMAIN_APP\"}) | "
    fi
    
    if [ "$API_EXISTS" = true ]; then
        JQ_FILTER+="(.api.external_url = \"https://$DOMAIN_APP/api\") | "
    else
        JQ_FILTER+="(.api = {\"url\": \"http://localhost:$SERVER_PORT/api\", \"external_url\": \"https://$DOMAIN_APP/api\"}) | "
    fi
    
    if [ "$NGINX_EXISTS" = true ]; then
        JQ_FILTER+="(.nginx.webroot = \"$WEBROOT_DIR\")"
        if [ "$DOCKER_NGINX" = true ]; then
            JQ_FILTER+=" | (.nginx.main = \"$DOCKER_NGINX_DIR\")"
        fi
    else
        if [ "$DOCKER_NGINX" = true ]; then
            JQ_FILTER+="(.nginx = {\"webroot\": \"$WEBROOT_DIR\", \"main\": \"$DOCKER_NGINX_DIR\"})"
        else
            JQ_FILTER+="(.nginx = {\"webroot\": \"$WEBROOT_DIR\"})"
        fi
    fi
    
    # Update the configuration
    jq "$JQ_FILTER" "$CONFIG_FILE" > "$TMP_CONFIG"
    
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

echo -e "\n${GREEN}Web configuration completed!${NC}"
echo -e "${YELLOW}Summary of actions:${NC}"
echo -e "  - NGINX configuration: ${NGINX_CONFIG}"
echo -e "  - Webroot directory: ${WEBROOT_DIR}"
if [ "$DOCKER_NGINX" = true ]; then
    echo -e "  - Docker NGINX main directory: ${DOCKER_NGINX_DIR}"
    if [ "$USING_SITES_AVAILABLE" = true ]; then
        echo -e "  - Docker NGINX config directory: ${NGINX_CONF_DIR}"
        echo -e "  - Docker NGINX enabled directory: ${NGINX_ENABLED_DIR}"
    else
        echo -e "  - Docker NGINX config directory: ${NGINX_CONF_DIR}"
    fi
    echo -e "  - Host IP for API access: ${HOST_IP}"
fi
echo -e "\n${YELLOW}You can now deploy the application using:${NC}"
echo -e "${GREEN}./deploy.sh${NC}"

# Remind about Docker container restart if using Docker
if [ "$DOCKER_NGINX" = true ]; then
    echo -e "\n${YELLOW}Remember to restart your Docker NGINX container:${NC}"
    echo -e "${GREEN}docker-compose restart nginx${NC}"
fi