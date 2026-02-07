# Dynamic Service Management in Launcher

The launcher discovers services from manifest files and builds the UI/process graph from those manifests. There is no central `services.json` anymore.

## Manifest Locations

A service can be defined in either location:

1) `package.json` under `pixsim.service`
2) A standalone `pixsim.service.json` file (anywhere in the repo)

Both formats accept the same fields. Standalone manifests can be either:

```json
{
  "service": {
    "id": "generation-api",
    "type": "backend",
    "name": "Generation API"
  }
}
```

or the bare form:

```json
{
  "id": "generation-api",
  "type": "backend",
  "name": "Generation API"
}
```

## Minimal Examples

Frontend (package.json):

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
      "subdomain": "dev",
      "env_overrides": {
        "VITE_BACKEND_URL": "$BACKEND_BASE_URL"
      },
      "auto_start": false,
      "enabled": true
    }
  }
}
```

Backend (pixsim.service.json):

```json
{
  "service": {
    "id": "generation-api",
    "type": "backend",
    "name": "Generation API",
    "module": "pixsim7.backend.main.main:app",
    "port_env": "GENERATION_API_PORT",
    "default_port": 8001,
    "base_url_env": "GENERATION_BASE_URL",
    "subdomain": "gen",
    "health_endpoint": "/health",
    "docs_endpoint": "/docs",
    "openapi_endpoint": "/openapi.json",
    "openapi_types_path": "apps/main/src/shared/api/generation.ts",
    "depends_on": ["db"],
    "enabled": true
  }
}
```

## Discovery Flow

- `launcher/gui/services.py` walks the repo and reads manifests.
- Each manifest is converted into a `ServiceDef` (frontend/backend/worker/docker).
- The GUI builds cards, start/stop controls, and health checks from those defs.
- `launcher/gui/multi_service_discovery.py` uses the same manifests to query `/dev/info` and `/dev/architecture/map` for the Architecture panel.

## Port and URL Resolution

Resolution order for ports and URLs:

1) `port_env` and `base_url_env` (from `.env` or process env)
2) `default_port` and `base_url` values from the manifest
3) Fallback to `http://localhost:{port}`

Supported substitutions in `env_overrides`:

- `$PORT`
- `$BACKEND_PORT`, `$FRONTEND_PORT`, `$GAME_FRONTEND_PORT`, `$DEVTOOLS_PORT`
- `$BACKEND_BASE_URL`, `$FRONTEND_BASE_URL`, `$GAME_FRONTEND_BASE_URL`, `$DEVTOOLS_BASE_URL`
- `$GENERATION_BASE_URL`, `$GENERATION_API_PORT`
- `$LAUNCHER_BASE_URL`

## Profile Defaults

The launcher UI reads `launcher/profiles.json`. Manifest fields can opt into auto-defaults:

- `profile_key`: which profile bucket to use (defaults to `id`)
- `subdomain`: used for `https_local` profile defaults
- `default_port`: used for local profile defaults

## Splitting the Generation API

To split a new service out of the backend:

1) Add a manifest (as above) for the new API.
2) Implement the FastAPI app in the target module.
3) Start it from the launcher. It will appear automatically.

## OpenAPI Type Generation

The OpenAPI scripts read manifests for `openapi_endpoint` and `openapi_types_path`:

- `tools/codegen/generate-openapi-types.ts`
- `scripts/gen_openapi_docs.py`

No central registry file is required.
