#!/bin/bash
# dev-up.sh - Start PixSim7 in local development mode
# Starts: databases (Docker) + backend + worker + frontend (all local with hot-reload)

set -e

echo "🚀 Starting PixSim7 Development Environment"
echo ""

# Change to project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env created - please review settings"
    echo ""
fi

# Create data directories
echo "📁 Creating data directories..."
mkdir -p data/postgres data/redis data/storage data/logs data/cache
echo "✅ Data directories ready"
echo ""

# Check dependencies
echo "🔍 Checking dependencies..."
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install Docker and docker-compose."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ python3 not found. Please install Python 3.11+."
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm not found. Frontend will not start. Install with: npm install -g pnpm"
    SKIP_FRONTEND=true
else
    SKIP_FRONTEND=false
fi
echo "✅ Dependencies checked"
echo ""

# Start databases with Docker
echo "🐳 Starting databases (PostgreSQL + Redis)..."
docker-compose -f docker-compose.db-only.yml up -d

# Wait for databases to be ready
echo "⏳ Waiting for databases to initialize..."
sleep 3

# Check if database exists
echo "🗄️  Checking database..."
DB_EXISTS=$(docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -lqt 2>/dev/null | cut -d \| -f 1 | grep -w pixsim7 | wc -l || echo "0")

if [ "$DB_EXISTS" -eq "0" ]; then
    echo "📝 Creating database 'pixsim7'..."
    docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -c "CREATE DATABASE pixsim7;" 2>/dev/null || echo "Database may already exist"
fi
echo "✅ Database ready"
echo ""

# Create log directory for tmux sessions
mkdir -p data/logs/dev

echo "=========================================="
echo "🎉 Starting Development Services"
echo "=========================================="
echo ""
echo "This will start 3-4 processes in the background:"
echo "  1. Backend API (with hot-reload)"
echo "  2. Background Worker"
echo "  3. Main Frontend (admin panel)"
echo "  4. Game Frontend (optional)"
echo ""
echo "All output will be logged to: data/logs/dev/"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Set PYTHONPATH
export PYTHONPATH="$PROJECT_ROOT"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."

    # Kill backend
    if [ -f data/logs/dev/backend.pid ]; then
        kill $(cat data/logs/dev/backend.pid) 2>/dev/null || true
        rm -f data/logs/dev/backend.pid
    fi

    # Kill worker
    if [ -f data/logs/dev/worker.pid ]; then
        kill $(cat data/logs/dev/worker.pid) 2>/dev/null || true
        rm -f data/logs/dev/worker.pid
    fi

    # Kill frontend(s)
    if [ -f data/logs/dev/frontend-main.pid ]; then
        kill $(cat data/logs/dev/frontend-main.pid) 2>/dev/null || true
        rm -f data/logs/dev/frontend-main.pid
    fi

    if [ -f data/logs/dev/frontend-game.pid ]; then
        kill $(cat data/logs/dev/frontend-game.pid) 2>/dev/null || true
        rm -f data/logs/dev/frontend-game.pid
    fi

    echo "✅ All services stopped"
    echo ""
    echo "To stop databases:"
    echo "  docker-compose -f docker-compose.db-only.yml down"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "▶️  Starting backend API (http://localhost:8001)..."
nohup uvicorn pixsim7.backend.main.main:app \
    --host 0.0.0.0 \
    --port 8001 \
    --reload \
    > data/logs/dev/backend.log 2>&1 &
echo $! > data/logs/dev/backend.pid
echo "   📝 Logs: data/logs/dev/backend.log"

# Start worker
echo "▶️  Starting background worker..."
nohup arq pixsim7.backend.main.workers.arq_worker.WorkerSettings \
    > data/logs/dev/worker.log 2>&1 &
echo $! > data/logs/dev/worker.pid
echo "   📝 Logs: data/logs/dev/worker.log"

# Start main frontend
if [ "$SKIP_FRONTEND" = false ]; then
    echo "▶️  Starting main frontend (http://localhost:5173)..."
    cd apps/main
    nohup pnpm dev > "$PROJECT_ROOT/data/logs/dev/frontend-main.log" 2>&1 &
    echo $! > "$PROJECT_ROOT/data/logs/dev/frontend-main.pid"
    cd "$PROJECT_ROOT"
    echo "   📝 Logs: data/logs/dev/frontend-main.log"
else
    echo "⏭️  Skipping frontend (pnpm not installed)"
fi

# Wait a bit for services to start
sleep 2

echo ""
echo "=========================================="
echo "✅ All Services Running!"
echo "=========================================="
echo ""
echo "Access points:"
echo "  📡 Backend API:    http://localhost:8001/docs"
echo "  🎨 Admin Panel:    http://localhost:5173"
echo "  📊 Health Check:   http://localhost:8001/health"
echo ""
echo "View logs:"
echo "  tail -f data/logs/dev/backend.log"
echo "  tail -f data/logs/dev/worker.log"
echo "  tail -f data/logs/dev/frontend-main.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait indefinitely (until Ctrl+C)
wait
