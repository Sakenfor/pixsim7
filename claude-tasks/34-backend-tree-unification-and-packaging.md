**Task: Backend Tree Unification & Packaging (`pixsim7_backend` → `pixsim7.backend.main`)**

> **For Agents (How to use this file)**
> - This task unifies the **two backend trees** so there is a single canonical backend package and no code duplication.
> - It is intentionally multi-phase and should be done carefully:
>   - Do **not** delete either tree until all references and packaging are updated and tested.
>   - Prefer moves/renames + clear deprecation notes over hard deletes.
> - Read these first:
>   - `ARCHITECTURE.md` – backend architecture overview
>   - `docs/APP_MAP.md` – where backend services live and how they’re started
>   - `docs/EXAMPLE_GENERATION_API_SPLIT.md` – target state for shared backend between main/generation services
>   - `docs/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md` – route/domain plugin system

---

## Context

Currently there are **two backend trees**:

- `pixsim7_backend/` – primary backend for dev/tests:
  - Docs and scripts use: `python pixsim7_backend/main.py` or `uvicorn pixsim7_backend.main:app`.
  - Launcher and tests import `pixsim7_backend.main`.
- `pixsim7/backend/main/` – packaged backend used by Docker and some examples:
  - `docker-compose.yml` uses `context: ./pixsim7/backend/main` and runs `uvicorn pixsim7.backend.main.main:app`.
  - `EXAMPLE_GENERATION_API_SPLIT.md` shows imports like `from pixsim7.backend.main.api.v1.generations import router`.

This duplication is fragile:

- Changes may be applied to one tree and not the other.
- Docs and tools have to choose which path to reference.
- It contradicts the target state described in `EXAMPLE_GENERATION_API_SPLIT.md` (“no file duplication”).

We want to converge to a **single backend package**, with:

- `pixsim7.backend.main` as the **canonical** backend module and package name.
- `pixsim7_backend` treated as **legacy**, used only as a short-lived shim during the transition and then removed.

The end state should be:

- Local dev, tests, launcher, Docker, and examples all use `pixsim7.backend.main`.
- No code lives under `pixsim7_backend/` (only, briefly, a shim module that forwards to `pixsim7.backend.main.main:app` while references are updated).

---

## Phase Checklist

- [ ] **Phase 34.1 – Inventory & Diff Backend Trees**
- [ ] **Phase 34.2 – Fix Canonical Package & Update Imports**
- [ ] **Phase 34.3 – Align Dev Scripts, Launcher & Docker**
- [ ] **Phase 34.4 – Remove Code Duplication (Single Source of Truth)**

---

## Phase 34.1 – Inventory & Diff Backend Trees

**Goal**  
Get a clear picture of how `pixsim7_backend` and `pixsim7/backend/main` differ and where they are referenced.

**Scope**

- Directories:
  - `pixsim7_backend/`
  - `pixsim7/backend/main/`
- References in:
  - Root docs, scripts, launcher configs, tests.

**Key Steps**

1. Compare directory structures:
   - Confirm both have similar subtrees: `api/`, `domain/`, `services/`, `routes/`, `workers/`, etc.
   - Note any files that exist only in one tree.
2. Run a diff for representative modules:
   - `api/v1/assets.py`, `main.py`, any other core files.
   - Document any meaningful divergence (bug fixes present only in one tree, etc.).
3. Inventory references:
   - Where `pixsim7_backend.main` is used (scripts, launcher, tests, docs).
   - Where `pixsim7.backend.main` is used (docker-compose, split service examples).
4. Append a short summary table to this file:
   - Module category, differences, who currently uses which tree.

**Status:** `[ ]` Not started

---

## Phase 34.2 – Fix Canonical Package & Update Imports

**Goal**  
Explicitly adopt `pixsim7.backend.main` as the canonical backend package and update imports/docs to use it consistently.

**Scope**

- Python imports and module paths referencing the backend app:
  - `pixsim7_backend.main:app` vs `pixsim7.backend.main.main:app`

**Key Steps**

1. Canonical namespace:
   - Treat `pixsim7.backend.main` as the canonical package name, consistent with `VARIANT_B`, Docker, and generation-split docs.
   - `pixsim7_backend` is considered legacy and should only be used as a shim until all references are updated.
2. Update imports in **code that you control** to use `pixsim7.backend.main`:
   - Tests (e.g. `tests/test_admin_database_endpoints.py`) to import `pixsim7.backend.main.main:app` (or similar, once the code lives there).
   - Launcher configs, service definitions that still import `pixsim7_backend.main`.
3. Update docs:
   - In `DEVELOPMENT_GUIDE.md`, `README.md`, `LOGGING_STRUCTURE.md`, etc., update “start backend” examples to use the canonical module path (`uvicorn pixsim7.backend.main.main:app` or equivalent).
   - Keep a brief “historical note” where `pixsim7_backend` is mentioned, but do not introduce new references to it.
4. At this stage, you can still have both trees on disk, but **all new/updated references** should use the canonical path.

**Status:** `[ ]` Not started

---

## Phase 34.3 – Align Dev Scripts, Launcher & Docker

**Goal**  
Ensure local dev scripts, launcher, and Docker all start the same backend code (via the canonical package path).

**Scope**

- Scripts:
  - `scripts/start-dev.sh`, `scripts/start-dev.bat`, `scripts/manage.*`
- Launcher:
  - `launcher/gui/services.py`, `launcher/launch.bat`, `launcher/start-backend.bat`
- Docker:
  - `docker-compose.yml`

**Key Steps**

1. Update scripts and launcher to use the canonical module path:
   - e.g. `uvicorn pixsim7.backend.main.main:app` or `python -m pixsim7.backend.main.main`.
2. Update Docker:
   - Confirm Docker uses `pixsim7/backend/main` as `context` and that imports resolve to the same code as local dev (i.e. `pixsim7.backend.main`).
3. Verify:
   - Start backend via script, launcher, and Docker and confirm:
     - `GET /health` (or equivalent) works identically.
     - Plugin discovery, services, and routes match expectations.

**Status:** `[ ]` Not started

---

## Phase 34.4 – Remove Code Duplication (Single Source of Truth)

**Goal**  
Eliminate `pixsim7_backend` as a code tree so there is only one physical copy of the backend code under `pixsim7/backend/main`.

**Scope**

- `pixsim7_backend/`
- `pixsim7/backend/main/`

**Key Steps**

1. Decide the on-disk layout (target):
   - Target: code lives under `pixsim7/backend/main`, with `pixsim7.backend.main.main:app` as the app entrypoint.
   - `pixsim7_backend` should not contain real code long-term; at most, it may contain a temporary shim that forwards imports.
2. Perform the move/refactor:
   - If any code exists only under `pixsim7_backend`, move it into the corresponding location under `pixsim7/backend/main` and update imports/tests accordingly.
   - Add a temporary shim module (e.g. `pixsim7_backend/main.py` re-exporting `pixsim7.backend.main.main:app`) to preserve backward compatibility while downstream references are cleaned up.
3. Remove the duplicated tree once:
   - All imports, docs, and scripts have been updated and tested against `pixsim7.backend.main`.
   - Any shim modules in `pixsim7_backend` have been in place long enough, and greps confirm `pixsim7_backend` is no longer used except in historical docs.
4. Update documentation:
   - Note in `DOCUMENTATION_CHANGELOG.md` that the backend has been unified under `pixsim7.backend.main`.
   - Update `EXAMPLE_GENERATION_API_SPLIT.md` to match the final layout (and drop “temporary duplication” caveats).

**Status:** `[ ]` Not started

