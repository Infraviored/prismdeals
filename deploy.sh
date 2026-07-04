#!/bin/bash
# deploy.sh - Convenience script to build and deploy frontend assets

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
NGINX_ROOT="${NGINX_ROOT:-/home/flo/docker-projects/nginx}"
WEBROOT="$NGINX_ROOT/webroot/prismdeals"

echo "Building frontend..."
cd "$PROJECT_ROOT/frontend"
npm run build

echo "Syncing built assets to Nginx webroot at $WEBROOT..."
if [ -d "$WEBROOT" ]; then
    echo "Cleaning old assets in $WEBROOT..."
    rm -rf "$WEBROOT"/*
else
    echo "Creating directory $WEBROOT..."
    mkdir -p "$WEBROOT"
fi
cp -r dist/* "$WEBROOT/"

echo "Restarting Nginx Docker container..."
cd "$NGINX_ROOT"
docker compose restart nginx

echo "Verifying deployment status..."
# Allow services to settle
sleep 2

echo "Checking Nginx docker container ('box')..."
if [ "$(docker inspect -f '{{.State.Running}}' nginx-proxy 2>/dev/null)" = "true" ]; then
    echo "  ✓ Nginx container is running"
else
    echo "  ✗ Nginx container is not running"
    exit 1
fi

echo "Checking backend API systemd service ('box')..."
if systemctl is-active prismdeals-api &>/dev/null; then
    echo "  ✓ Backend API service (prismdeals-api) is active"
else
    echo "  ✗ Backend API service (prismdeals-api) is inactive"
    exit 1
fi

echo "Checking frontend web response ('front')..."
HTTP_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" https://prismdeals.net || echo "000")
if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 301 ] || [ "$HTTP_STATUS" -eq 302 ]; then
    echo "  ✓ Frontend is responsive (HTTP $HTTP_STATUS)"
else
    echo "  ✗ Frontend is not responsive (HTTP $HTTP_STATUS)"
    exit 1
fi

echo "Deployment completed and verified successfully!"

