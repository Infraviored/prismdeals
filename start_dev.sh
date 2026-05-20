#!/bin/bash

# Simple development script to start both backend and frontend servers.
# It automatically handles clean termination of both servers on exit (Ctrl+C).

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# Determine which virtual environment to use
if [ -d "$PROJECT_ROOT/.venv" ]; then
    VENV_PATH="$PROJECT_ROOT/.venv"
elif [ -d "$PROJECT_ROOT/kleinanzeigenScraper" ]; then
    VENV_PATH="$PROJECT_ROOT/kleinanzeigenScraper"
fi

# Clean cleanup on exit/interruption
cleanup() {
    echo ""
    echo "Shutting down development servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 1. Start Backend Server
echo "Starting backend server..."
if [ -n "$VENV_PATH" ]; then
    echo "Activating virtual environment at $VENV_PATH"
    source "$VENV_PATH/bin/activate"
fi

cd "$PROJECT_ROOT/backend"
node server.js &
BACKEND_PID=$!

# 2. Start Frontend Server
echo "Starting frontend dev server..."
cd "$PROJECT_ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
