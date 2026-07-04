# Developer & Agent Guide

This repository contains the **prismdeals** application, which scrapes laptop listings and provides a dashboard to view them.

## Application Architecture

The system is split into two components:
1. **Backend**: Express/Node.js API server (`backend/server.js`) running on port `3030`.
2. **Frontend**: React/TypeScript SPA (`frontend/`) built with Vite.

## Deployment Architecture

* **Web Server**: Nginx runs in a Docker container (located in `/home/flo/docker-projects/nginx`).
* **Frontend Webroot**: Nginx serves the frontend statically from `/home/flo/docker-projects/nginx/webroot/prismdeals`.
* **Database / Backend service**: Backend API runs as a systemd service (`prismdeals-api`).

## Build & Deployment Process

Whenever you modify frontend files, you must build and deploy them using the convenience script.

### Convenience Script

To automate building the frontend, copying the static assets to the Nginx webroot, and restarting Nginx:

Run the `deploy.sh` script in the root of the repository:
```bash
./deploy.sh
```

### Manual Deployment Steps

1. Build the production build in the `frontend/` directory:
   ```bash
   cd frontend
   npm run build
   ```
2. Copy the contents of `frontend/dist/` to the Nginx webroot:
   ```bash
   cp -r frontend/dist/* /home/flo/docker-projects/nginx/webroot/prismdeals/
   ```
3. Restart Nginx to apply changes:
   ```bash
   cd /home/flo/docker-projects/nginx
   docker compose restart nginx
   ```
