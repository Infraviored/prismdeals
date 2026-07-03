#!/bin/bash
# deploy.sh - Convenience script to build and deploy frontend assets

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
NGINX_ROOT="/home/flo/docker-projects/nginx"
WEBROOT="$NGINX_ROOT/webroot/prismdeals"

echo "Building frontend..."
cd "$PROJECT_ROOT/frontend"
npm run build

echo "Syncing built assets to Nginx webroot at $WEBROOT..."
if [ ! -d "$WEBROOT" ]; then
    echo "Creating directory $WEBROOT..."
    mkdir -p "$WEBROOT"
fi
cp -r dist/* "$WEBROOT/"

echo "Restarting Nginx Docker container..."
cd "$NGINX_ROOT"
docker compose restart nginx

echo "Deployment completed successfully!"
