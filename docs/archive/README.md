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

- `old-status/` - Status documents from various development phases
- `completed-refactoring/` - Documentation of completed refactoring efforts
- `launcher/` - Launcher architecture evolution docs
- `plugins/` - Plugin system development history

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
