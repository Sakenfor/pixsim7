# ADR: Gizmo Component Organization

**Status:** Accepted
**Date:** 2025-11-18
**Decision Makers:** Development Team

## Context

The SceneGizmoMiniGame component and GizmoLab route were temporarily disabled during a build fix because they had architectural issues with cross-package dependencies. Specifically:

1. **Broken Package Boundaries**: `packages/game-ui/src/components/gizmos/renderers.ts` was importing from `frontend`, violating package encapsulation
2. **Unclear Responsibilities**: It was unclear which package should own gizmo components, renderers, and related code
3. **Missing Exports**: The `sceneCallStack` module was exported but didn't exist

## Decision

We have chosen **Option 1: Keep Gizmo Components in Frontend**.

### Package Responsibilities

| Package | Responsibility |
|---------|----------------|
| `@pixsim7/scene-gizmos` | Type definitions, registry, core logic (UI-agnostic) |
| `@pixsim7/game-ui` | Generic, reusable UI components (ScenePlayer, ReflexMiniGame) |
| `frontend` | Application-specific components (gizmo implementations, renderers, SceneGizmoMiniGame) |

### Dependency Flow

```
@pixsim7/scene-gizmos (types + registry)
       ↓
@pixsim7/game-ui (generic UI)
       ↓
frontend (app-specific implementations)
```

## Rationale

### Why Option 1 (Frontend) Over Option 2 (game-ui)?

1. **Gizmo implementations are application-specific**
   - OrbGizmo, ConstellationGizmo, RingsGizmo have custom CSS and behaviors
   - They are tightly coupled to the frontend's design system
   - Not intended for reuse in other applications

2. **Maintains clean package boundaries**
   - Packages should never import from consuming applications
   - Moving renderers to game-ui would require moving all gizmo implementations
   - Frontend already owns these implementations

3. **Less refactoring required**
   - Gizmo components already exist in `apps/main/src/components/gizmos/`
   - Only needed to move renderer registry and SceneGizmoMiniGame
   - Minimal disruption to existing code

4. **Clear separation of concerns**
   - `scene-gizmos`: Pure logic and types
   - `game-ui`: Generic, reusable components
   - `frontend`: Application-specific implementations

## Implementation

### Changes Made

1. **Created gizmo renderer in frontend**
   - `apps/main/src/lib/gizmos/renderers.ts` - Centralized gizmo renderer mapping
   - Uses relative imports to gizmo components in frontend

2. **Moved SceneGizmoMiniGame to frontend**
   - `apps/main/src/components/minigames/SceneGizmoMiniGame.tsx`
   - Updated imports to use frontend's gizmo renderer

3. **Removed broken files from game-ui**
   - Deleted `packages/game-ui/src/components/gizmos/`
   - Removed `sceneCallStack` export (didn't exist, wasn't used)
   - Cleaned up TypeScript excludes

4. **Re-enabled GizmoLab**
   - Renamed `GizmoLab.tsx.disabled` → `GizmoLab.tsx`
   - Updated imports in `App.tsx` and `FloatingPanelsManager.tsx`
   - Re-enabled route at `/gizmo-lab`

5. **Updated documentation**
   - Added README for `@pixsim7/game-ui`
   - Added README for `@pixsim7/scene-gizmos`
   - Created this ADR

### Files Created/Modified

**Created:**
- `apps/main/src/lib/gizmos/renderers.ts`
- `apps/main/src/components/minigames/SceneGizmoMiniGame.tsx`
- `packages/game-ui/README.md`
- `packages/scene-gizmos/README.md`
- `docs/ADR-GIZMO-ARCHITECTURE.md`

**Modified:**
- `apps/main/src/routes/GizmoLab.tsx` (re-enabled, updated imports)
- `apps/main/src/App.tsx` (uncommented GizmoLab imports)
- `apps/main/src/components/layout/FloatingPanelsManager.tsx` (uncommented GizmoLab)
- `packages/game-ui/src/index.ts` (removed sceneCallStack export, added docs)
- `packages/game-ui/tsconfig.json` (removed gizmo excludes)

**Deleted:**
- `packages/game-ui/src/components/gizmos/` (entire directory)
- `packages/game-ui/src/components/minigames/SceneGizmoMiniGame.tsx`

## Consequences

### Positive

✅ **Clean package boundaries** - No packages import from frontend
✅ **Clear responsibilities** - Each package has a well-defined purpose
✅ **Proper layering** - Dependencies flow in one direction (no cycles)
✅ **GizmoLab re-enabled** - Full functionality restored
✅ **Explicit architecture** - Documented in READMEs and this ADR
✅ **Type safety maintained** - All types properly exported from scene-gizmos

### Negative

⚠️ **Gizmo components not reusable** - They remain in frontend, not a shared package
⚠️ **Potential duplication** - If another app needs gizmos, they'd need to re-implement

### Neutral

ℹ️ **Future considerations**: If gizmo components need to be shared across multiple applications, we can:
1. Extract them to a new `@pixsim7/gizmo-components` package
2. Move them to `game-ui` if they become generic enough
3. Keep them in frontend if they remain app-specific

## Validation

### Build Checks

```bash
# Clean package boundaries
✓ No frontend imports found in game-ui

# Package builds
✓ @pixsim7/scene-gizmos build successful
✓ @pixsim7/game-ui build successful
```

### Architecture Checks

- ✅ game-ui does not import from frontend
- ✅ Proper dependency chain (scene-gizmos → game-ui → frontend)
- ✅ All exports intentional and documented
- ✅ Types properly exported from scene-gizmos
- ✅ GizmoLab accessible at `/gizmo-lab` route

## References

- [packages/game-ui/README.md](../packages/game-ui/README.md)
- [packages/scene-gizmos/README.md](../packages/scene-gizmos/README.md)
- [Monorepo Package Boundaries Best Practices](https://monorepo.tools/)
- [Dependency Inversion Principle](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
