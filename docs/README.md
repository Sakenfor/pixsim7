# PixSim7 Documentation

Start here:
- `docs/getting-started/README.md` (setup + launcher)
- `docs/repo-map.md` (repository structure)
- `docs/architecture/CURRENT.md` (current architecture snapshot)

## Key Areas
- Backend patterns: `docs/backend/SERVICES.md`
- Generation system: `docs/systems/generation/README.md`
- Game systems: `docs/game-systems/README.md`
- Plugins: `docs/plugins-and-extensibility/README.md`
- Frontend: `docs/frontend/README.md`
- Authentication: `docs/authentication/README.md` (storage abstraction, desktop support)
- Ops/runbook: `docs/infrastructure/README.md` and `docs/database-and-logging/README.md`

## Conventions
- Put new docs under the appropriate subfolder (avoid adding new top-level files in `docs/`).
- Prefer `README.md` as the entry point for a folder.
- Use `kebab-case.md` for new docs; avoid ALL_CAPS for new files.
- If a doc is temporary working notes, place it in `docs/implementation/` or `docs/archive/`.

## Searching
- Fast keyword search: `rg "<term>" docs`

