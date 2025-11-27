Launcher GUI module layout

- launcher.py: Assembles the UI, connects controls, and wires modules.
- status.py: HealthStatus enum and status text/color maps.
- logger.py: Initializes the structured logger for the launcher.
- services.py: Declarative service definitions and ports/env wiring.
- processes.py: ServiceProcess lifecycle (start/stop, output capture, DB compose control).
- health_worker.py: Background health checks (HTTP for apps, compose ps for DBs).
- docker_utils.py: Helpers wrapping docker compose / docker-compose commands.
- dialogs/
  - git_tools_dialog.py: Commit groups helper dialog.
  - migrations_dialog.py: Alembic migrations dialog.
- widgets/
  - service_card.py: UI card for each service with status and Start/Stop/Open.

Notes
- DB Start/Stop uses Docker Compose directly; the card reflects real container status.
- Compose v1 and v2 are supported (tries `docker compose`, then `docker-compose`).
- Logs tab reads centralized logs via the backend and `pixsim_logging` DB; file logs are deprecated.
- Environment is merged from `.env` for child processes via `config.service_env()`.
# PixSim7 Launcher GUI

A PySide6 desktop application for managing local development services for the PixSim7 project.

## Features

### Service Management
- **7 Services**: Databases (Docker), Backend API, Worker (ARQ), Admin (SvelteKit), Frontend (React), Game Frontend (React), and Game Service
- **Start/Stop Controls**: Individual service control or start/stop all at once
- **Health Monitoring**: Real-time health checks with colored status badges
  - Green: Healthy (HTTP 200 response)
  - Orange: Starting (service launched but not ready)
  - Red: Unhealthy (service running but failing health checks)
  - Gray: Stopped
- **Tool Availability Checks**: Detects missing tools (docker-compose, npm, pnpm) before attempting to start services

### Configuration
- **Ports Editor**: Edit backend, admin, frontend, and game frontend ports via dialog
  - Saves to `.env` file
  - Optional restart of affected services
  - Updates take effect on next service start
- **UI State Persistence**: Window size, position, and selected service are saved to `launcher.json`

### Logging
- **Real-time Log Tailing**: View last ~20KB of each service's log
- **Auto-scroll**: Toggle auto-scroll to bottom (enabled by default)
- **Filter**: Substring filter for log content
- **Clear Display**: Clear the log view without deleting log files
- **Open in Explorer**: Reveal the log file in Windows Explorer / file manager

### Process Management
- **Graceful Shutdown**: Backend services get 5-second timeout for graceful shutdown before force-kill
- **Exit Code Logging**: All process exits are logged with exit codes
- **Database Down**: Dedicated button to stop databases using `docker-compose down`

## Installation

From the repo root:

```bash
pip install -r scripts/launcher_gui/requirements.txt
```

## Usage

### From the repo venv:

```bash
python scripts/launcher.py
```

### From launch.bat:

```
launch.bat
# Then select option [8]
```

## File Structure

```
scripts/launcher_gui/
├── launcher.py           # Main PySide6 application
├── services.py          # Service definitions
├── config.py            # Configuration (ports, env, UI state)
├── logging_utils.py     # Log rotation and appending
├── requirements.txt     # Python dependencies
├── launcher.json        # UI state (created at runtime)
└── README.md           # This file
```

## Logs

All logs are written to `data/logs/launcher/`:
- `launcher.log` - Main launcher events (start, stop, health checks)
- `<service>.log` - Per-service stdout/stderr output

Logs auto-rotate when they exceed 5MB (keeps 3 backups).

## Health Checks

- **Backend**: `GET http://localhost:{backend_port}/health`
- **Admin/Frontends**: `GET http://localhost:{port}/`
- **DB**: Parses `docker-compose ps` output for "Up" status
- **Worker/Game**: No HTTP health check (assumed healthy if running)

Health checks run every 3 seconds and update the UI status badges.

## Port Configuration

The launcher reads from and writes to the `.env` file in the repo root:

```env
BACKEND_PORT=8001
ADMIN_PORT=8002
FRONTEND_PORT=5173
GAME_FRONTEND_PORT=5174
```

Use the **Ports** button to edit these values via a dialog.

## Services Defined

1. **Databases (Docker)** - `docker-compose -f docker-compose.db-only.yml up -d`
2. **Backend API** - Python FastAPI app (port configurable)
3. **Worker (ARQ)** - Python ARQ background worker
4. **Admin (SvelteKit)** - `npm run dev` (port configurable)
5. **Frontend (React)** - `pnpm dev` (port configurable)
6. **Game Frontend (React)** - `pnpm dev` (port configurable)
7. **Game Service** - Python game backend (main.py)

## Keyboard Shortcuts

- **Select service** → Click in the list
- **Double-click service** → Opens the service URL in browser (if available)

## Troubleshooting

### Service won't start
- Check the service's log for errors
- Verify required tools are in PATH (docker-compose, npm, pnpm)
- Check if ports are already in use

### Missing tool warning
If a service shows `[Missing tool: xyz]`, ensure the tool is installed and in your PATH:
- Docker Compose: `docker-compose --version`
- npm: `npm --version`
- pnpm: `pnpm --version`

### Health check always unhealthy
- Service may not have fully started yet (wait ~10 seconds)
- Check if the health endpoint exists (backend) or if the service is serving HTTP (frontends)
- View the service log for startup errors

## Recent Fixes

### Worker (ARQ) Process Management (2025-11-27)

**Problem**: Worker showed as running (green icon) when actually crashed, couldn't stop or restart.

**Root Causes**:
1. Missing explicit `REDIS_URL` in worker env configuration
2. Health check only verified Redis accessibility, not if worker process was alive

**Fixes Applied**:
- `services.py`: Added explicit `REDIS_URL` to worker's `env_overrides`
- `health_worker.py`: Health check now verifies process PID is alive BEFORE checking Redis
- Changed worker dependency from `backend` to `db` (correct dependency)

**Result**: Worker status now accurately reflects process state, stop/restart buttons work correctly.

## Development

To modify service definitions, edit `services.py` and add/update `ServiceDef` entries.

Key fields:
- `key`: Unique identifier
- `title`: Display name
- `program`: Executable (python, npm, docker-compose, etc.)
- `args`: Command arguments
- `cwd`: Working directory
- `env_overrides`: Environment variables to set
- `url`: URL to open in browser
- `health_url`: URL for health checks (optional)
- `required_tool`: Tool that must be in PATH (optional)

## Future Enhancements (Stretch Goals)

- System tray icon with minimize-to-tray
- PyInstaller spec for single-EXE distribution
- Detailed error dialogs with stderr tail and "Copy details" button
- Auto-restart on crash
