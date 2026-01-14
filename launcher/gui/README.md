# PixSim7 Launcher GUI

PySide6 desktop app for starting and monitoring local PixSim7 services.

## Module Layout

- launcher.py: UI assembly and wiring
- services.py: Loads service manifests and converts to ServiceDef
- processes.py: ServiceProcess lifecycle (start/stop, output capture)
- health_worker.py: Background health checks (HTTP or compose status)
- config.py: Ports, env, UI state
- dialogs/: Ports and env editors
- widgets/: Service cards and log views

## Service Manifests

Services are defined in manifests:

- `package.json` -> `pixsim.service`
- `pixsim.service.json` (standalone)

Example:

```json
{
  "pixsim": {
    "service": {
      "id": "devtools",
      "type": "frontend",
      "name": "DevTools",
      "directory": "apps/devtools",
      "command": "pnpm",
      "args": ["dev", "--port"],
      "port_env": "DEVTOOLS_PORT",
      "default_port": 5176,
      "base_url_env": "DEVTOOLS_BASE_URL",
      "enabled": true
    }
  }
}
```

## Health Checks

- Backend services: `GET {base_url}{health_endpoint}` (default `/health`)
- Frontend services: `GET {base_url}/`
- Docker compose services: status via compose ps

## Ports and Env

Ports are resolved from `.env` or manifest defaults:

```env
BACKEND_PORT=8001
FRONTEND_PORT=5173
GAME_FRONTEND_PORT=5174
DEVTOOLS_PORT=5176
GENERATION_API_PORT=8003
```

The launcher supports env substitution in `env_overrides` using placeholders like `$BACKEND_BASE_URL` and `$PORT`.

## Development

Install dependencies:

```bash
pip install -r scripts/launcher_gui/requirements.txt
```

Run:

```bash
python scripts/launcher.py
```
