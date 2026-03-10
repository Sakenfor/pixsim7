#!/bin/bash
# Start PixSim7 in development mode
# Docker for databases only, manual backend/worker

set -e

echo "Starting PixSim7 Development Environment"
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

# Start databases with Docker
echo ""
echo "Starting PostgreSQL and Redis..."
docker-compose -f docker-compose.db-only.yml up -d

# Wait for databases to be ready
echo "Waiting for databases..."
sleep 3

# Check if databases are healthy
echo "Checking database health..."
docker-compose -f docker-compose.db-only.yml ps

# Check if database exists
echo ""
echo "Checking database..."
DB_EXISTS=$(docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -lqt | cut -d \| -f 1 | grep -w pixsim7 | wc -l)

if [ "$DB_EXISTS" -eq "0" ]; then
    echo "Database 'pixsim7' does not exist"
    echo "Creating database..."
    docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -c "CREATE DATABASE pixsim7;"
    echo "Database created"
else
    echo "Database 'pixsim7' exists"
fi

echo ""
echo "Databases ready"
echo ""
echo "Next steps:"
echo "  1. Start backend:  PYTHONPATH=/g/code/pixsim7 python -m pixsim7.backend.main.main"
echo "  2. Start worker:   PYTHONPATH=/g/code/pixsim7 arq pixsim7.backend.main.workers.arq_worker.WorkerSettings"
echo "  3. Start sim worker: PYTHONPATH=/g/code/pixsim7 arq pixsim7.backend.main.workers.arq_worker.SimulationWorkerSettings"
echo "  4. Start admin:    cd admin && npm run dev"
echo ""
echo "Or use the process manager:"
echo "  ./scripts/manage.sh start"
echo ""
echo "Database services:"
echo "  PostgreSQL: localhost:5434"
echo "  Redis:      localhost:6380"
echo ""
echo "Stop databases:"
echo "  docker-compose -f docker-compose.db-only.yml down"
