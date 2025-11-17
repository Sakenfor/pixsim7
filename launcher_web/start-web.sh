#!/bin/bash
#
# Start PixSim7 Launcher Web UI
#

cd "$(dirname "$0")"

echo "========================================================================"
echo "Starting PixSim7 Launcher Web UI"
echo "========================================================================"
echo ""
echo "This will start the web interface on port 3100"
echo ""
echo "  Web UI:          http://localhost:3100"
echo "  API (required):  http://localhost:8100"
echo ""
echo "Make sure the API is running first!"
echo "  Run: ../start-api.sh"
echo ""
echo "Press Ctrl+C to stop"
echo ""
echo "========================================================================"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Start development server
npm run dev
