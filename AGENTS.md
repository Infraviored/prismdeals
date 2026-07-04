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

## Scraper Execution Architecture

The background scraper is **not** run as a standalone systemd daemon or cron job. Instead, scraper discovery crawls, deep updates, and AI evaluation worker runs are spawned dynamically as Python child processes by the Node.js Express API server (`backend/server.js`):
* **AI Worker evaluations**: Spawns `scraper/agent_worker.py` to run evaluation prompts, parse response structures, validate JSON outputs, and compute scores.
* **Crawl sessions**: Spawns background scraper crawls in `scrape` or `update-all` modes to harvest listings.
* **Sandbox Logging**: General application logs write to `data/scraper.log` (rotated at 5MB), while raw prompt/response histories and isolated logs for individual listings are recorded under `data/logs/<listing_id>/`.

## Frontend Custom Utilities

The frontend uses custom-built lightweight layers to handle core utilities, minimizing external library dependencies:
1. **Hash Routing System (`useHashRouter`)**: Coordinates page navigation (`landing`, `dashboard`, `settings`, `edit`) by listening to window hash modifications. This enables browser history state updates and back/forward navigation without page refreshes.
2. **Strictly-Typed Translations (`useTranslation` / `translations.ts`)**: Implements dot-notated key mapping to enforce strict compile-time type-safety. Attempting to render an undefined key immediately triggers a compiler type error (`tsc -b`), preventing raw address fallbacks at runtime.

