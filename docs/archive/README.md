# Archive Directory

**⚠️ Historical Documents**

This directory contains historical documentation from various phases of PixSim7 development. These documents are preserved for reference but may contain **outdated paths and package names**.

## Path/Package Name Changes

Since these documents were written, several architectural changes have occurred:

### Backend (Task 34 - 2025-11-21)
- **Old:** `pixsim7_backend/`
- **New:** `pixsim7/backend/main/`

### Frontend (VARIANT_B Migration)
- **Old:** `frontend/src/`
- **New:** `apps/main/src/`

### Game Packages (VARIANT_B)
- **Old:** `packages/game-core`, `@pixsim7/game-core`
- **New:** `packages/game/engine`, `@pixsim7/game.engine`
- **Old:** `packages/game-ui`
- **New:** `packages/game/components`

## What's in Here

- `actions/` - Action system development history
- `architecture/` - Superseded architecture documents
- `completed/` - Completed phase and feature implementation docs
- `completed-refactoring/` - Documentation of completed refactoring efforts
- `generation/` - Generation system evolution docs
- `launcher/` - Launcher architecture evolution docs
- `meta/` - Documentation about documentation
- `old-status/` - Status documents from various development phases
- `plugins/` - Plugin system development history
- `task-summaries/` - Completed task implementation summaries

## Recently Archived (2025-12-10)

| File | Location | Reason |
|------|----------|--------|
| MULTI_UI_LAUNCHER_COMPLETE.md | launcher/ | Historical achievement doc - launcher refactor completed |
| PHASE_6_LOG_INGESTION.md | completed/ | Implementation complete |
| LOG_FILTERING_APPLIED.md | completed/ | Implementation notes for completed feature |
| PHASE_3_INSPECTOR_TESTING.md | completed/ | Testing guide for completed phase |

## Using These Documents

When referencing code paths in these documents:
1. Replace `pixsim7_backend/` with `pixsim7/backend/main/`
2. Replace `frontend/src/` with `apps/main/src/`
3. Replace `packages/game-core` with `packages/game/engine`
4. Be aware that some features may have been superseded or reimplemented

## Current Documentation

For up-to-date architecture and development guides, see:
- `/ARCHITECTURE.md` - Current system architecture
- `/docs/APP_MAP.md` - Application structure map
- `/DEVELOPMENT_GUIDE.md` - Development setup and workflows
- `/docs/EXTENSION_ARCHITECTURE.md` - Plugin/extension system
