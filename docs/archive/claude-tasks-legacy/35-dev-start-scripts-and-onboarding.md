**Task: Dev Start Scripts & Onboarding Simplification**

> **For Agents (How to use this file)**
> - This task creates a **single, canonical way to start the stack** for local development.
> - Use it when you:
>   - Add or change backend/frontend entrypoints.
>   - Update docs about how to run the app.
> - Read these first:
>   - `DEVELOPMENT_GUIDE.md` – current setup and start commands
>   - `ARCHITECTURE.md` – backend/frontend services
>   - `docs/APP_MAP.md` – app map and routes
>   - `claude-tasks/34-backend-tree-unification-and-packaging.md` – backend unification context

---

## Context

After backend unification (Task 34), the canonical backend is:

- `pixsim7.backend.main.main:app` (code under `pixsim7/backend/main/`).
- `pixsim7_backend.main` is a legacy shim only (deprecated, for backward compatibility).

Frontend/apps live under:

- `apps/main` – main admin/control app.
- `apps/game` – game frontend.

Docs and scripts have multiple ways to start these components (different commands, paths, ports). For new contributors (and for future agents), it’s better to have:

- A **single “dev up” command** that does the right thing.
- One obvious set of commands documented in `DEVELOPMENT_GUIDE.md` and `README.md`.

---

## Phase Checklist

- [X] **Phase 35.1 – Inventory Existing Start Commands** ✅ Complete
- [X] **Phase 35.2 – Create Canonical Dev Start Scripts** ✅ Complete
- [X] **Phase 35.3 – Simplify Docs & Point to Scripts** ✅ Complete

---

## Phase 35.1 – Inventory Existing Start Commands

**Goal**  
Map out all current “start backend/frontend” commands and identify which ones are canonical vs legacy.

**Scope**

- Docs:
  - `DEVELOPMENT_GUIDE.md`
  - `README.md`
  - Any other “How to run” sections (e.g. `AI_README.md`, `LOGGING_STRUCTURE.md` if they show run commands).
- Scripts:
  - `scripts/start-dev.*`
  - `scripts/manage.*`
  - Launcher configs (`launcher/gui/services.py`, `launcher/launch.bat`, etc.).

**Key Steps**

1. List all backend start commands:
   - Legacy (deprecated): `uvicorn pixsim7_backend.main:app`, `python pixsim7_backend/main.py`
   - Canonical: `uvicorn pixsim7.backend.main.main:app` and any Docker/launcher equivalents.
2. List all frontend start commands:
   - `pnpm dev` / `pnpm dev:main` / `pnpm dev:game` (or similar).
3. Mark which commands:
   - Are **canonical** (desired long-term).
   - Are **legacy** (kept only for historical context or shims).

**Status:** `[X]` ✅ Complete

**Findings:**
- ✅ Canonical backend: `uvicorn pixsim7.backend.main.main:app` (all scripts updated)
- ✅ Canonical frontend: `cd apps/main && pnpm dev`
- ✅ Existing scripts: `start-dev.sh/bat` (DBs only), `start-all.sh/bat` (Docker)

---

## Phase 35.2 – Create Canonical Dev Start Scripts

**Goal**  
Provide simple, cross-platform scripts for starting dev environments, so users don’t have to remember module paths.

**Scope**

- `scripts/dev-up.sh` / `scripts/dev-up.bat` (or equivalent)
- Optional helper scripts for backend-only or frontend-only starts.

**Key Steps**

1. Add `scripts/dev-up.sh` (POSIX) that:
   - Ensures `PYTHONPATH` is set to the repo root.
   - Starts backend via canonical entrypoint:
     - `uvicorn pixsim7.backend.main.main:app --host 0.0.0.0 --port 8001 --reload`.
   - Starts `apps/main` dev server (e.g. `pnpm --filter @pixsim7/frontend.main dev` or whatever the repo uses).
   - Optionally starts `apps/game` dev server if that’s part of normal dev flow.
2. Add `scripts/dev-up.bat` (Windows) doing equivalent setup.
3. Add one-command variants:
   - `scripts/dev-backend.sh` / `.bat` (backend only).
   - `scripts/dev-main.sh` / `.bat` (main app only) if helpful.
4. Ensure scripts:
   - Log what they're doing.
   - Fail clearly if dependencies (pnpm, uvicorn) are missing.

**Status:** `[X]` ✅ Complete

**Implementation Details:**
- ✅ Created `scripts/dev-up.sh` (POSIX shell, 196 lines)
  - Starts databases (Docker), backend, worker, frontend
  - Auto-creates .env from template
  - Dependency checks for docker-compose, python, pnpm
  - Background processes with PID files
  - Cleanup handler for Ctrl+C
  - Logs to data/logs/dev/
- ✅ Created `scripts/dev-up.bat` (Windows batch, 123 lines)
  - Equivalent Windows implementation
  - Starts processes in separate minimized windows
  - Same dependency checks and logging
- 🎯 Single command replaces 4-5 terminal workflow

---

## Phase 35.3 – Simplify Docs & Point to Scripts

**Goal**  
Make the new scripts the primary way to start the app, and clean up older, redundant instructions.

**Scope**

- `DEVELOPMENT_GUIDE.md`
- `README.md`
- Any other “run the app” sections.

**Key Steps**

1. Update `DEVELOPMENT_GUIDE.md`:
   - “Quick Start” section:
     - `./scripts/dev-up.sh` (Linux/macOS)
     - `scripts\dev-up.bat` (Windows)
   - Backend section:
     - Show `uvicorn pixsim7.backend.main.main:app` as canonical.
   - Frontend section:
     - Show the canonical pnpm commands for main/game apps.
2. Update `README.md`:
   - Replace any remaining outdated examples that use `pixsim7_backend` with the new scripts or canonical commands.
   - Keep a short note that `pixsim7_backend.main` is deprecated and exists only as a backward-compatibility shim.
3. Optionally:
   - Add a small note in `ARCHITECTURE.md` or `APP_MAP.md` referring to `dev-up` scripts as the easiest way to see things in action.

**Status:** `[X]` ✅ Complete

**Implementation Details:**
- ✅ Updated DEVELOPMENT_GUIDE.md Quick Start section
  - New Option 1: Single Command Dev Mode (`./scripts/dev-up.sh`)
  - Renumbered existing options (Launcher → Option 2, Docker → Option 3, Manual → Option 4)
  - Clear documentation of what each option does
  - Shows access URLs and next steps
- ✅ All docs now reference canonical entrypoints
- 🎯 Simplified onboarding: 1 command vs 4-5 terminals

