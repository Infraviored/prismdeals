# KleinanzeigenScraper

A web application for scraping, analyzing, and contacting vendors on Kleinanzeigen (German classified ads platform).

## Features

- Scrape laptop listings from Kleinanzeigen
- Analyze listings using AI to extract technical specifications
- Filter and sort listings based on RAM size, screen size, and resolution
- Generate personalized vendor contact messages for missing information
- Customize message templates and prompts
- Schedule automatic scraping

## Requirements

- Python 3.8+
- OpenAI API key
- Nginx (optional, for web frontend)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/KleinanzeigenScraper.git
cd KleinanzeigenScraper
```

### 2. Run the initial setup script

This script will:
- Create a Python virtual environment
- Install dependencies
- Set up basic configuration
- Create a systemd service file

```bash
chmod +x install-python-backend.sh
./install-python-backend.sh
```

During setup, you'll be prompted to provide:
- API server port
- Service configuration
- OpenAI API key

### 3. (Optional) Configure web server

If you want to serve the frontend through a web server, run:

```bash
chmod +x configure-web.sh
./configure-web.sh
```

This script will:
- Ask for domain information
- Ask for Nginx configuration
- Create and install Nginx configuration files
- Set up the webroot directory

### 4. Deploy the application

After the initial setup, deploy the application:

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
- Deploy the backend files
- Optionally deploy the frontend files
- Restart the API server
- Verify the deployment

## Configuration

The application uses a configuration file (`config.json`) to store settings. This file is created during the initial setup, but you can modify it manually if needed.

Example configuration:

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 3030
  },
  "service": {
    "name": "kleinanzeigen-scraper-api",
    "user": "username",
    "working_directory": "/path/to/KleinanzeigenScraper"
  },
  "openai": {
    "api_key": "",
    "model": "gpt-4o-mini"
  }
}
```

## Authentication System

The Kleinanzeigen Scraper includes an authentication system to protect sensitive features. By default, the system requires authentication for all features, but administrators can enable public access mode.

### User Roles

- **Admin**: Can access and modify all features, including configuration, vendor contact templates, and user management.
- **User**: Can view all features but cannot modify configuration or vendor contact templates.

### Initial Setup

An admin user must be created before using the authentication system. Use the provided script:

```bash
python3 create_admin_user.py
```

This will prompt you to enter a username and password for the admin user. Alternatively, you can provide these via command line:

```bash
python3 create_admin_user.py --username admin --password yourpassword
```

### Public Access Mode

Administrators can enable "Public Access Mode" which allows anyone to view all features without logging in. This is useful for demonstration purposes or when authentication is not needed. Even in public access mode, only admin users can modify configuration and vendor contact templates.

To enable public access mode:
1. Log in as an admin user
2. Click the "Settings" button in the top right
3. Toggle "Allow public access to all features"
4. Click "Save Settings"

### Security Notes

- User passwords are hashed with SHA-256 and a unique salt for each user
- Session cookies are used for authentication
- CORS is configured to support credentials
- The API enforces authentication for protected endpoints

## Usage

After deployment, access the API at `http://localhost:3030/api/` or through your configured domain.

The interface has several tabs:
- **Listings**: View, filter, and sort scraped listings
- **Configure**: Set up search configurations and scraping schedules
- **Vendor Contact**: Customize and generate vendor contact messages

## Troubleshooting

### API Server Issues

Check the API server status:

```bash
sudo systemctl status kleinanzeigen-scraper-api.service
```

View API server logs:

```bash
sudo journalctl -u kleinanzeigen-scraper-api.service -f
```

Restart the API server:

```bash
sudo systemctl restart kleinanzeigen-scraper-api.service
```

## License

[MIT License](LICENSE)