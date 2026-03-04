# Launcher Settings Precedence

This document describes where launcher settings live and how they are resolved.

## Sources

- Service manifests: `pixsim.service` in `package.json` or `pixsim.service.json`
- Launcher profiles (UI presets): `launcher/profiles.json`
- Explicit overrides: `.env`
- Launcher settings contract (runtime flags): `launcher/core/paths.py -> LAUNCHER_STATE_DIR/settings.json`
- GUI-only state (window/layout): `launcher/gui/launcher.json`

## Canonical Runtime Paths

Launcher runtime storage paths are centralized in `launcher/core/paths.py`:

- `CACHE_DIR` -> `data/cache`
- `CONSOLE_LOG_DIR` -> `data/logs/console`
- `LAUNCHER_LOG_DIR` -> `data/logs/launcher`
- `LAUNCHER_STATE_DIR` -> `data/launcher` (includes `settings.json` and launcher PID)

Notes:
- Launcher services should import these constants/helpers instead of rebuilding `data/...` paths locally.
- These runtime directories are currently repo-root based, not configured via env variables.

## Resolution Order

The launcher resolves settings in this order (later wins):

1) Service manifest defaults (ports, base URLs, env overrides)
2) Profile preset (ports/base URLs) applied via GUI
3) `.env` overrides (ports, base URLs, credentials, secrets)
4) Process environment variables (manual exports)

Launcher settings are resolved separately and applied at runtime:
- SQL logging, worker debug flags, backend log level
- Local datastore toggle

## Behavior Notes

- Leaving a base URL blank means "use http://localhost:<port>" at runtime.
- Saving the GUI with an empty field removes the key from `.env` (no override).
- `.env` should only contain values you want to override outside manifests/profiles.

## When Not Using the Launcher

If you run services manually (scripts, docker-compose, IDE):
- Make sure `.env` contains the overrides you need, or
- Export the environment variables before starting services.
