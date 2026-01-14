# PixSim7 Launcher Guide

The launcher is a desktop app that starts and monitors local services. It reads service manifests and builds the UI dynamically.

## Quick Start

```bash
launch.bat
```

## What the Launcher Does

- Loads service manifests (`pixsim.service` / `pixsim.service.json`)
- Starts/stops services with proper dependencies
- Tracks health and process state
- Opens service URLs when available

## Common Actions

- Start databases (Postgres/Redis)
- Start backend and worker
- Start frontends (main/game/devtools)
- Open service URLs from the service cards

## Adding a New Service

1) Add a manifest in `package.json` under `pixsim.service` or create `pixsim.service.json`.
2) Restart the launcher.
3) The service card appears automatically.

## Troubleshooting

- Missing tools: install Docker, Node, or pnpm as needed.
- Port already in use: update `.env` or the launcher ports dialog.
- Service unhealthy: open the logs tab and check startup errors.
