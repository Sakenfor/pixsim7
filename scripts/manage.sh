#!/bin/bash
# PixSim7 Process Manager - Prevents zombie processes

BACKEND_PID_FILE="/tmp/pixsim7_backend_main.pid"
WORKER_PID_FILE="/tmp/pixsim7_worker.pid"
SIM_WORKER_PID_FILE="/tmp/pixsim7_simulation_worker.pid"

start_backend() {
    if [ -f "$BACKEND_PID_FILE" ]; then
        PID=$(cat "$BACKEND_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Backend already running (PID: $PID)"
            return
        fi
    fi

    cd /g/code/pixsim7
    PYTHONPATH=/g/code/pixsim7 python -m pixsim7.backend.main.main &
    echo $! > "$BACKEND_PID_FILE"
    echo "Backend started (PID: $(cat $BACKEND_PID_FILE))"
}

start_worker() {
    if [ -f "$WORKER_PID_FILE" ]; then
        PID=$(cat "$WORKER_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Worker already running (PID: $PID)"
            return
        fi
    fi

    cd /g/code/pixsim7
    PYTHONPATH=/g/code/pixsim7 arq pixsim7.backend.main.workers.arq_worker.WorkerSettings &
    echo $! > "$WORKER_PID_FILE"
    echo "Worker started (PID: $(cat $WORKER_PID_FILE))"
}

start_sim_worker() {
    if [ -f "$SIM_WORKER_PID_FILE" ]; then
        PID=$(cat "$SIM_WORKER_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Simulation worker already running (PID: $PID)"
            return
        fi
    fi

    cd /g/code/pixsim7
    PYTHONPATH=/g/code/pixsim7 arq pixsim7.backend.main.workers.arq_worker.SimulationWorkerSettings &
    echo $! > "$SIM_WORKER_PID_FILE"
    echo "Simulation worker started (PID: $(cat $SIM_WORKER_PID_FILE))"
}

stop_backend() {
    if [ -f "$BACKEND_PID_FILE" ]; then
        PID=$(cat "$BACKEND_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            kill "$PID"
            echo "Backend stopped (PID: $PID)"
        fi
        rm "$BACKEND_PID_FILE"
    else
        echo "Backend not running"
    fi
}

stop_worker() {
    if [ -f "$WORKER_PID_FILE" ]; then
        PID=$(cat "$WORKER_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            kill "$PID"
            echo "Worker stopped (PID: $PID)"
        fi
        rm "$WORKER_PID_FILE"
    else
        echo "Worker not running"
    fi
}

stop_sim_worker() {
    if [ -f "$SIM_WORKER_PID_FILE" ]; then
        PID=$(cat "$SIM_WORKER_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            kill "$PID"
            echo "Simulation worker stopped (PID: $PID)"
        fi
        rm "$SIM_WORKER_PID_FILE"
    else
        echo "Simulation worker not running"
    fi
}

status() {
    echo "=== PixSim7 Status ==="

    if [ -f "$BACKEND_PID_FILE" ]; then
        PID=$(cat "$BACKEND_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Backend: Running (PID: $PID)"
        else
            echo "Backend: Dead (stale PID file)"
        fi
    else
        echo "Backend: Stopped"
    fi

    if [ -f "$WORKER_PID_FILE" ]; then
        PID=$(cat "$WORKER_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Worker: Running (PID: $PID)"
        else
            echo "Worker: Dead (stale PID file)"
        fi
    else
        echo "Worker: Stopped"
    fi

    if [ -f "$SIM_WORKER_PID_FILE" ]; then
        PID=$(cat "$SIM_WORKER_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Simulation Worker: Running (PID: $PID)"
        else
            echo "Simulation Worker: Dead (stale PID file)"
        fi
    else
        echo "Simulation Worker: Stopped"
    fi
}

cleanup() {
    # Kill any zombie pixsim7 processes
    pkill -f "pixsim7.backend.main.main" 2>/dev/null
    pkill -f "pixsim7.backend.main.workers.arq_worker" 2>/dev/null
    rm -f "$BACKEND_PID_FILE" "$WORKER_PID_FILE" "$SIM_WORKER_PID_FILE"
    echo "Cleaned up all processes and PID files"
}

case "$1" in
    start)
        start_backend
        start_worker
        start_sim_worker
        ;;
    stop)
        stop_backend
        stop_worker
        stop_sim_worker
        ;;
    restart)
        stop_backend
        stop_worker
        stop_sim_worker
        sleep 2
        start_backend
        start_worker
        start_sim_worker
        ;;
    status)
        status
        ;;
    cleanup)
        cleanup
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|cleanup}"
        exit 1
        ;;
esac
