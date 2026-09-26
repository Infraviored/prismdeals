# Developer & Agent Guide

This repository contains **prismdeals**: used-goods hunts on Kleinanzeigen over a shared product graph. Architecture: `ARCHITECTURE.md`.

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

Crawls are spawned by the API (`backend/server.js`) as `scraper/main.py --mode both`: fetch the
searches in demand order, harvest details, then resolve and read the new listings into the graph
and refine every hunt. Graph writes from the API go through `python -m graph.cli` (`backend/python.js`).
Logs: `data/scraper.log` (rotated at 5 MB).

## Frontend Custom Utilities

The frontend uses custom-built lightweight layers to handle core utilities, minimizing external library dependencies:
1. **Hash Routing System (`useHashRouter`)**: Coordinates page navigation (`landing`, `dashboard`, `settings`, `edit`) by listening to window hash modifications. This enables browser history state updates and back/forward navigation without page refreshes.
2. **Strictly-Typed Translations (`useTranslation` / `translations.ts`)**: Implements dot-notated key mapping to enforce strict compile-time type-safety. Attempting to render an undefined key immediately triggers a compiler type error (`tsc -b`), preventing raw address fallbacks at runtime.

