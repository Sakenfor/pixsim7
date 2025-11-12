#!/bin/bash
# Start PixSim7 - All services (databases + backend + worker)
# Uses full docker-compose.yml

set -e

echo "🚀 Starting PixSim7 (Full Docker)"
echo ""

# Change to project root
cd "$(dirname "$0")/.."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env created - please review settings"
fi

# Create data directories
echo "📁 Creating data directories..."
mkdir -p data/postgres data/redis data/storage data/logs data/cache
echo "✅ Data directories ready"

# Start all services
echo ""
echo "🐳 Starting all services with Docker Compose..."
docker-compose up -d

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 5

# Check status
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🎉 All services running!"
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
