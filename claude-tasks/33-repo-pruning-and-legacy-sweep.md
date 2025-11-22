**Task: Repo Pruning & Legacy Path Normalization**

> **For Agents (How to use this file)**
> - This is a **mechanical, multi-pass cleanup task** aimed at reducing drift and confusion, not changing core behavior.
> - Use it when you have time/tokens to:
>   - Remove or quarantine legacy copies of modules.
>   - Normalize path/name references in docs and task files.
>   - Trim obviously dead scripts/components.
> - Always verify behavior via existing entrypoints and tests; when in doubt, **move to a legacy archive** instead of deleting.
> - Read these first:
>   - `ARCHITECTURE.md` – canonical architecture
>   - `docs/APP_MAP.md` – app map and entrypoints
>   - `DOCUMENTATION_CHANGELOG.md` – doc reorg history
>   - `docs/EXTENSION_ARCHITECTURE.md` – extension/plugin surfaces

---

## Context

Over time, PixSim7 has accumulated:

- **Duplicated backend trees** (e.g. `pixsim7_backend/...` and `pixsim7/backend/...` copies).
- **Legacy PixSim6 artifacts** and handoff/migration scaffolding.
- Documentation and task files that still reference:
  - Old package names (`@pixsim7/game-core`, `packages/game-core`) instead of `@pixsim7/game.engine` / `packages/game/engine`.
  - Old frontend paths (`frontend/`, `packages/game-ui`) instead of `apps/main/`, `packages/game/components`.
- Old scripts, examples, and components that are no longer used but still look “live” to new contributors.

This increases cognitive load and makes it easy for agents to:

- Fix or extend the **wrong copy** of a file.
- Follow stale paths or package names from older docs.
- Re-implement behavior that already exists under a new, canonical path.

This task is about **pruning and normalizing** without changing the actual running architecture.

---

## Phase Checklist

- [X] **Phase 33.1 – Backend Tree Duplication Audit** ✅ Complete
- [X] **Phase 33.2 – PixSim6 & Legacy Integration Artifacts** ✅ Complete
- [X] **Phase 33.3 – Path/Name Consistency in Docs & Task Files** ✅ Complete
- [X] **Phase 33.4 – Dead Script & Sample Data Triage** ✅ Complete
- [ ] **Phase 33.5 – Optional: Unused Frontend Component & Hook Sweep** (Deferred)

**Overall Status:** ~98% Complete (4 of 4 required phases done, optional phase deferred)

---

## Phase 33.1 – Backend Tree Duplication Audit

**Goal**  
Identify and clearly separate live backend modules from legacy copies (especially between `pixsim7_backend` and `pixsim7/backend` trees).

**Scope**

- Backend directories:
  - `pixsim7_backend/...`
  - `pixsim7/backend/...` (and any other duplicate namespaces)

**Key Steps**

1. Inventory duplicated modules:
   - For each `pixsim7_backend/api/v1/*.py`, check if there is a sibling copy under `pixsim7/backend/main/api/v1` or similar.
   - Repeat for key domains/services if duplicated.
2. For each pair, determine the **live** copy:
   - Check which one is imported from `pixsim7_backend/main.py` and plugin manifests.
   - Confirm via `APP_MAP.md` and `ARCHITECTURE.md` references.
3. For confirmed legacy copies:
   - Prefer moving them into a clearly labeled archive folder (e.g. `pixsim7_backend/legacy/` or `docs/archive/legacy-backend/`) instead of leaving them alongside live modules.
   - Add a short header comment at the top: `# LEGACY COPY - see <live path>`.
4. Do **not** change imports or behavior unless the live path is already canonical and tests/logs confirm usage.

**Status:** `[X]` ✅ Complete

**Results:**
- Backend duplication eliminated by Task 34
- `pixsim7_backend/` contains only 2 shim files (down from 435 Python files)
- `pixsim7/backend/main/` is the canonical backend (435 Python files)
- No other backend duplication found

**See:** Task 34 completion summary for full details

---

## Phase 33.2 – PixSim6 & Legacy Integration Artifacts

**Goal**  
Quarantine PixSim6-era code and migration scaffolding so it doesn’t look like part of the active PixSim7 architecture.

**Scope**

- Top-level directories and docs:
  - `pixsim6/` symlink or directory
  - Any PixSim6-specific migration or integration docs/scripts

**Key Steps**

1. Identify PixSim6 artifacts:
   - Directory `pixsim6/` and any scripts that explicitly reference PixSim6.
   - Old integration docs that are superseded by `ARCHITECTURE.md` / `DEVELOPMENT_GUIDE.md`.
2. For code:
   - If any module is still referenced by live code, leave it in place but add a clear comment and doc reference.
   - If not referenced anywhere:
     - Move to a `legacy/` or `docs/archive/legacy-pixsim6/` folder (with a README describing its purpose and historical context).
3. For docs:
   - Move clearly outdated/duplicated PixSim6 integration docs into `docs/archive/` if they are not already there.
   - Ensure `ARCHITECTURE.md` remains the canonical ref for current integration behavior.

**Status:** `[X]` ✅ Complete

**Results:**
- **Identified:**
  - `pixsim6` symlink (broken, pointing to ../pixsim6 which doesn't exist)
  - `scripts/import_accounts_from_pixsim6.py` (active migration tool)
  - `scripts/IMPORT_ACCOUNTS_GUIDE.md` (active documentation)
  - Various docs mentioning PixSim6 as historical context

- **Actions Taken:**
  - Removed broken `pixsim6` symlink
  - Confirmed migration script is actively used by launcher GUI
  - No code quarantine needed - migration tools are intentionally active

- **Status:** Migration tools remain active as they serve ongoing purpose

---

## Phase 33.3 – Path/Name Consistency in Docs & Task Files

**Goal**  
Normalize references to package names and paths so there is a single canonical name for each subsystem.

**Scope**

- Root docs and guides:
  - `ARCHITECTURE.md`, `APP_MAP.md`, `GAMEPLAY_SYSTEMS.md`, `AI_README.md`, etc.
- Task files:
  - `claude-tasks/*.md`

**Key Steps**

1. Identify common stale references:
   - Old game packages:
     - `@pixsim7/game-core`, `packages/game-core` → `@pixsim7/game.engine`, `packages/game/engine`.
   - Old frontend paths:
     - `frontend/`, `packages/game-ui` → `apps/main/`, `packages/game/components`.
2. For each doc/task file:
   - Update references to use the canonical names/paths, **adding a short note** where historical context matters (e.g. “formerly `packages/game-core`”).
3. Ensure links remain valid:
   - Where possible, keep relative paths accurate (adjust when files have moved).
   - Avoid changing examples that intentionally show old names for historical reasons; add “historical note” lines instead.
4. Record the sweep in `DOCUMENTATION_CHANGELOG.md` if it is substantial.

**Status:** `[X]` ✅ Complete

**Results:**
- **Created:** `docs/PATH_NORMALIZATION_STATUS.md` - comprehensive tracking document
- **Updated (2025-11-21 - Initial sweep):** Critical files:
  - claude-tasks/28-37 (all backend references fixed)
  - ARCHITECTURE.md (frontend/src → apps/main/src)
  - Removed broken pixsim6 symlink

- **Updated (2025-11-21 - Mass normalization):** 93 additional files
  - All claude-tasks/01-27*.md (31 files)
  - All root documentation (GAMEPLAY_SYSTEMS.md, AI_README.md, README.md)
  - All docs/*.md files (root level)
  - All packages/*/README.md and apps/*/README.md
  - Component documentation in apps/main/src/

- **Remaining (intentionally preserved):**
  - docs/archive/* - Historical files with contextual README added
  - A few subdocs in docs/decisions/, docs/generated/ (low priority)

- **Completion:** Path normalization comprehensive and systematic
  - 100+ files updated across two sweeps
  - Batch replacements with manual verification of critical files
  - Historical context preserved with docs/archive/README.md

**See:** `docs/PATH_NORMALIZATION_STATUS.md` for full inventory and verification commands

---

## Phase 33.4 – Dead Script & Sample Data Triage

**Goal**  
Reduce clutter from one-off scripts and sample files that are no longer part of normal workflows.

**Scope**

- Root and utility directories:
  - `scripts/`, `examples/`, `tests/` (for obviously unused helpers)
  - Root-level `.py` helpers (e.g. one-off checks or diagnostic scripts)

**Key Steps**

1. Inventory scripts and small utilities:
   - For each script, look for:
     - References in docs (`DEVELOPMENT_GUIDE.md`, `README.md`, `AI_README.md`).
     - Usage in CI configs or npm/pnpm scripts.
2. Categorize:
   - **Active:** used in docs or workflows → keep, possibly add a short header comment.
   - **Legacy but potentially useful:** move under `scripts/legacy/` or `docs/archive/old-scripts/` with a README.
   - **Truly dead:** no references, superseded by newer scripts → candidates for removal, with an entry in a small cleanup note.
3. Prefer moving to `legacy/` over deletion to avoid surprises, unless you are absolutely sure the script is unused.

**Status:** `[X]` ✅ Complete

**Results:**
- **Created:** `docs/SCRIPT_INVENTORY.md` - comprehensive script documentation

- **Scripts Audited:** All scripts in `scripts/` directory
  - ✅ `manage.sh/bat` - active (service management)
  - ✅ `start-dev.sh/bat` - active (dev startup)
  - ✅ `start-all.sh/bat` - active (full stack)
  - ✅ `run_scenarios.sh/bat` - active (testing)
  - ✅ `launcher.py` - active (GUI entry point)
  - ✅ `import_accounts_from_pixsim6.py` - active (migration tool)
  - ✅ `view_account_passwords.py` - active (admin utility)
  - ✅ `check_missing_imports.py` - active (dev tool)
  - ✅ `check_orphan_routers.py` - active (dev tool, created for Task 31)
  - ✅ `device_agent.py` - active (device automation infrastructure)

- **Dead Code Found:** None - all scripts serve active purposes

- **Decision:** No reorganization needed, current structure is appropriate

**See:** `docs/SCRIPT_INVENTORY.md` for detailed inventory and purposes

---

## Phase 33.5 – Optional: Unused Frontend Component & Hook Sweep

**Goal**  
Identify obviously unused components/hooks and either archive or remove them to keep the frontend surface tight.

**Scope**

- Frontend app:
  - `apps/main/src/components/**/*`
  - `apps/main/src/hooks/**/*`

**Key Steps**

1. Use static search to find candidates:
   - For each component/hook file, search for its import in `apps/main/src/**/*`.
2. For each candidate with no imports:
   - Double-check:
     - No dynamic imports/registry-based references (e.g. via name strings).
     - Not referenced from plugin registries or configuration files.
3. For confirmed unused items:
   - Move into a `components/legacy/` or `components/experimental/` folder if they might be useful as reference.
   - Otherwise, remove them and update any docs that still mention them.
4. Be conservative:
   - If there’s any doubt about usage, prefer moving + documenting over deletion.

**Status:** `[ ]` Not started

