#!/bin/bash
# Start PixSim7 - All services (databases + backend + worker)
# Uses full docker-compose.yml

set -e

echo "Starting PixSim7 (Full Docker)"
echo ""

# Change to project root
cd "$(dirname "$0")/.."

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ".env created - please review settings"
fi

# Create database and runtime directories
echo "Creating data directories..."
mkdir -p data/postgres data/redis data/timescaledb

# Resolve PIXSIM_HOME runtime root
if [ -n "${PIXSIM_HOME:-}" ]; then
    PIXSIM_HOME_DIR="$PIXSIM_HOME"
elif [ "$(uname -s)" = "Darwin" ]; then
    PIXSIM_HOME_DIR="$HOME/Library/Application Support/PixSim7"
else
    PIXSIM_HOME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/pixsim7"
fi

mkdir -p \
  "$PIXSIM_HOME_DIR/media" \
  "$PIXSIM_HOME_DIR/logs" \
  "$PIXSIM_HOME_DIR/exports" \
  "$PIXSIM_HOME_DIR/cache" \
  "$PIXSIM_HOME_DIR/temp" \
  "$PIXSIM_HOME_DIR/settings" \
  "$PIXSIM_HOME_DIR/models" \
  "$PIXSIM_HOME_DIR/automation/screenshots"

echo "Data directories ready"
echo "Runtime data root: $PIXSIM_HOME_DIR"

# Start all services
echo ""
echo "Starting all services with Docker Compose..."
docker-compose up -d

# Wait for services
echo "Waiting for services to start..."
sleep 5

# Check status
echo ""
echo "Service Status:"
docker-compose ps

echo ""
echo "All services running"
echo ""
echo "Access points:"
echo "  API:          http://localhost:8001/docs"
echo "  Admin Panel:  http://localhost:8002"
echo "  Logs:         http://localhost:8002/logs"
echo ""
echo "Via ZeroTier:"
echo "  API:          http://10.243.48.125:8001/docs"
echo "  Admin Panel:  http://10.243.48.125:8002"
echo ""
echo "View logs:"
echo "  docker-compose logs -f backend"
echo "  docker-compose logs -f worker"
echo ""
echo "Stop all:"
echo "  docker-compose down"
