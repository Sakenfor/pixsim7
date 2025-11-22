# Path Normalization Status

**Date:** 2025-11-21
**Related Task:** Task 33 - Repo Pruning & Legacy Path Normalization

## Context

After the backend unification (Task 34) and VARIANT_B frontend migration, many documentation files still reference old package names and paths.

## Old → New Path Mappings

### Backend
- ❌ `pixsim7_backend/` → ✅ `pixsim7/backend/main/`
- ❌ `pixsim7_backend.*` imports → ✅ `pixsim7.backend.main.*`

### Frontend/Game Packages
- ❌ `frontend/src/` → ✅ `apps/main/src/`
- ❌ `packages/game-core` → ✅ `packages/game/engine`
- ❌ `@pixsim7/game-core` → ✅ `@pixsim7/game.engine`
- ❌ `packages/game-ui` → ✅ `packages/game/components`

## Files Status

### ✅ Updated (Task 28-37 fixes + backend references)
- claude-tasks/28-extensible-scoring-and-simulation-config.md
- claude-tasks/29-extension-and-plugin-architecture-doc-unification.md
- claude-tasks/31-critical-surface-guardrails-and-ci-checks.md
- claude-tasks/32-gallery-provider-status-and-flags.md
- claude-tasks/34-backend-tree-unification-and-packaging.md
- claude-tasks/35-dev-start-scripts-and-onboarding.md
- claude-tasks/37-chrome-extension-end-to-end-validation.md

### ✅ Updated (2025-11-21 - Full normalization sweep)
- ✅ ARCHITECTURE.md
- ✅ GAMEPLAY_SYSTEMS.md (all 20+ references)
- ✅ AI_README.md
- ✅ README.md
- ✅ claude-tasks/01-27*.md (31 files batch updated)
- ✅ docs/*.md (root level docs)
- ✅ packages/*/README.md
- ✅ apps/*/README.md and component docs

### ⚠️ Remaining (Lower Priority)
- docs/archive/* - Historical files (need notes, not replacements)
- Some subdocs in docs/decisions/, docs/generated/

### 📦 Historical/Archive Docs
Files in `docs/archive/` - should keep historical references but add notes

### 🔧 PixSim6 Artifacts Status

#### Keep (Still Used)
- `scripts/import_accounts_from_pixsim6.py` - Active migration script referenced by launcher
- `scripts/IMPORT_ACCOUNTS_GUIDE.md` - Documentation for migration

#### Quarantine (Broken/Legacy)
- `pixsim6` symlink - Broken symlink to `../pixsim6` (doesn't exist)
  - **Action:** Remove or document as historical

## Recommendations

### Immediate (High Priority)
1. Fix critical root docs: ARCHITECTURE.md, GAMEPLAY_SYSTEMS.md, AI_README.md, README.md
2. Remove broken `pixsim6` symlink or add README explaining it's historical

### Near-term (Medium Priority)
1. Update remaining claude-tasks/ files (Tasks 01-27)
2. Update main docs/ files
3. Add historical notes to docs/archive/ files

### Long-term (Low Priority)
1. Comprehensive sweep of all .md files
2. Update code comments that reference old paths
3. Consider creating path alias redirects for documentation systems

## Progress Tracking

- [X] Phase 33.1: Backend Tree Duplication Audit (Complete - Task 34)
- [X] Phase 33.2: PixSim6 & Legacy Integration Artifacts (Complete)
- [X] Phase 33.3: Path/Name Consistency (Complete - 2025-11-21 mass normalization)
- [X] Phase 33.4: Dead Script & Sample Data Triage (Complete - all scripts active)
- [ ] Phase 33.5: Unused Frontend Component Sweep (Optional - deferred)

## 2025-11-21 Mass Normalization Summary

**Files Updated:** 100+ files
**Scope:**
- All claude-tasks/01-27*.md files (31 files)
- All root documentation (ARCHITECTURE.md, GAMEPLAY_SYSTEMS.md, AI_README.md, README.md)
- All docs/*.md files (root level)
- All package and app README files
- Component documentation in apps/main/src/

**Method:**
- Batch sed replacements across directories
- Manual verification of critical files
- Historical context preserved in docs/archive/README.md

**Verification:**
```bash
# Check for remaining old references (should be minimal)
grep -r "pixsim7_backend/" --include="*.md" . | grep -v archive | grep -v PATH_NORMALIZATION
grep -r "frontend/src/" --include="*.md" . | grep -v archive | grep -v PATH_NORMALIZATION
```

## Notes

- Some references are intentionally historical (e.g., in migration plans, architecture evolution docs)
- Task files before #28 haven't been updated yet - they contain old path references
- Consider adding a linter rule to catch new references to old paths
