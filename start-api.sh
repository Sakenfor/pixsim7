#!/bin/bash
#
# Start PixSim7 Launcher API
#
# Runs the FastAPI server on port 8100
#

cd "$(dirname "$0")"

echo "========================================================================"
echo "Starting PixSim7 Launcher API"
echo "========================================================================"
echo ""
echo "This will start the REST API server on port 8100"
echo ""
echo "  API Base:        http://localhost:8100"
echo "  Documentation:   http://localhost:8100/docs"
echo "  WebSocket:       ws://localhost:8100/events/ws"
echo ""
echo "Press Ctrl+C to stop"
echo ""
echo "========================================================================"
echo ""

# Activate conda environment if it exists
if [ -d "G:/code/conda_envs/pixsim7" ]; then
    source "G:/code/conda_envs/pixsim7/bin/activate" 2>/dev/null || \
    source "G:/code/conda_envs/pixsim7/Scripts/activate" 2>/dev/null || true
fi

# Run the API
python -m uvicorn launcher_api.main:app \
    --host 0.0.0.0 \
    --port 8100 \
    --reload \
    --log-level info
