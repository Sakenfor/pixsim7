# Port Configuration

The launcher and services read ports from `.env`. Each service manifest defines a `port_env` and `default_port`. The launcher resolves ports in this order:

1) Environment variable from `.env`
2) `default_port` from the manifest
3) Fallback to `http://localhost:{port}` for base URLs

## Common Ports

| Service | Default Port | Env Var | Notes |
| --- | --- | --- | --- |
| Backend API | 8001 | `BACKEND_PORT` | FastAPI app |
| Generation API | 8003 | `GENERATION_API_PORT` | Optional split service |
| Frontend | 5173 | `FRONTEND_PORT` | Main UI |
| Game Frontend | 5174 | `GAME_FRONTEND_PORT` | Game UI |
| DevTools | 5176 | `DEVTOOLS_PORT` | Dev workspace |
| Launcher | 8100 | `LAUNCHER_PORT` | Launcher UI API |

## Base URL Overrides

You can override service URLs with base URL env vars:

```env
BACKEND_BASE_URL=http://localhost:8001
FRONTEND_BASE_URL=http://localhost:5173
GAME_FRONTEND_BASE_URL=http://localhost:5174
DEVTOOLS_BASE_URL=http://localhost:5176
GENERATION_BASE_URL=http://localhost:8003
```

## Updating Ports

1) Edit `.env` directly, or
2) Use the launcher settings panel to edit ports

Services pick up the new values on the next start.
