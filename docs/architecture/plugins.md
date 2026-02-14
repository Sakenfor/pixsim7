# ADR: Gizmo Component Organization

**Status:** Accepted
**Date:** 2025-11-18
**Decision Makers:** Development Team

## Context

The SceneGizmoMiniGame component and GizmoLab route were temporarily disabled during a build fix because they had architectural issues with cross-package dependencies. Specifically:

1. **Broken Package Boundaries**: `packages/game/components/src/components/gizmos/renderers.ts` was importing from `frontend`, violating package encapsulation
2. **Unclear Responsibilities**: It was unclear which package should own gizmo components, renderers, and related code
3. **Missing Exports**: The `sceneCallStack` module was exported but didn't exist

## Decision

We have chosen **Option 1: Keep Gizmo Components in Frontend**.

### Package Responsibilities

| Package | Responsibility |
|---------|----------------|
| `@pixsim7/interaction.gizmos` | Type definitions, registry, core logic (UI-agnostic) |
| `@pixsim7/game.components` | Generic, reusable UI components (ScenePlayer, ReflexMiniGame) |
| `frontend` | Application-specific components (gizmo implementations, renderers, SceneGizmoMiniGame) |

### Dependency Flow

```
@pixsim7/interaction.gizmos (types + registry)
       ↓
@pixsim7/game.components (generic UI)
       ↓
frontend (app-specific implementations)
```

## Rationale

### Why Option 1 (Frontend) Over Option 2 (game components)?

1. **Gizmo implementations are application-specific**
   - OrbGizmo, ConstellationGizmo, RingsGizmo have custom CSS and behaviors
   - They are tightly coupled to the frontend's design system
   - Not intended for reuse in other applications

2. **Maintains clean package boundaries**
   - Packages should never import from consuming applications
   - Moving renderers to game components would require moving all gizmo implementations
   - Frontend already owns these implementations

3. **Less refactoring required**
   - Gizmo components already exist in `apps/main/src/components/gizmos/`
   - Only needed to move renderer registry and SceneGizmoMiniGame
   - Minimal disruption to existing code

4. **Clear separation of concerns**
   - `scene.gizmos`: Pure logic and types
   - `game components`: Generic, reusable components
   - `frontend`: Application-specific implementations

## Implementation

### Changes Made

1. **Created gizmo renderer in frontend**
   - `apps/main/src/lib/gizmos/renderers.ts` - Centralized gizmo renderer mapping
   - Uses relative imports to gizmo components in frontend

2. **Moved SceneGizmoMiniGame to frontend**
   - `apps/main/src/components/minigames/SceneGizmoMiniGame.tsx`
   - Updated imports to use frontend's gizmo renderer

3. **Removed broken files from game components**
   - Deleted `packages/game/components/src/components/gizmos/`
   - Removed `sceneCallStack` export (didn't exist, wasn't used)
   - Cleaned up TypeScript excludes

4. **Re-enabled GizmoLab**
   - Renamed `GizmoLab.tsx.disabled` → `GizmoLab.tsx`
   - Updated imports in `App.tsx` and `FloatingPanelsManager.tsx`
   - Re-enabled route at `/gizmo-lab`

5. **Updated documentation**
   - Added README for `@pixsim7/game.components`
   - Added README for `@pixsim7/interaction.gizmos`
   - Created this ADR

### Files Created/Modified

**Created:**
- `apps/main/src/lib/gizmos/renderers.ts`
- `apps/main/src/components/minigames/SceneGizmoMiniGame.tsx`
- `packages/game/components/README.md`
- `packages/scene/gizmos/README.md`
- `docs/ADR-GIZMO-ARCHITECTURE.md`

**Modified:**
- `apps/main/src/routes/GizmoLab.tsx` (re-enabled, updated imports)
- `apps/main/src/App.tsx` (uncommented GizmoLab imports)
- `apps/main/src/components/layout/FloatingPanelsManager.tsx` (uncommented GizmoLab)
- `packages/game/components/src/index.ts` (removed sceneCallStack export, added docs)
- `packages/game/components/tsconfig.json` (removed gizmo excludes)

**Deleted:**
- `packages/game/components/src/components/gizmos/` (entire directory)
- `packages/game/components/src/components/minigames/SceneGizmoMiniGame.tsx`

## Consequences

### Positive

✅ **Clean package boundaries** - No packages import from frontend
✅ **Clear responsibilities** - Each package has a well-defined purpose
✅ **Proper layering** - Dependencies flow in one direction (no cycles)
✅ **GizmoLab re-enabled** - Full functionality restored
✅ **Explicit architecture** - Documented in READMEs and this ADR
✅ **Type safety maintained** - All types properly exported from scene.gizmos

### Negative

⚠️ **Gizmo components not reusable** - They remain in frontend, not a shared package
⚠️ **Potential duplication** - If another app needs gizmos, they'd need to re-implement

### Neutral

ℹ️ **Future considerations**: If gizmo components need to be shared across multiple applications, we can:
1. Extract them to a new `@pixsim7/gizmo-components` package
2. Move them to `game components` if they become generic enough
3. Keep them in frontend if they remain app-specific

## Gizmo Surface Registry (Added 2025-11-23)

**Context:** Gizmo components needed a way to be dynamically enabled/disabled across different contexts (Game2D, scene editor, playground) and integrated into the dev tools and plugin system.

**Decision:** We created a **Gizmo Surface Registry** system that treats gizmos and debug dashboards as "surfaces" - pluggable UI components that can be:
- Registered centrally with metadata (category, contexts, priority)
- Enabled/disabled per context (scene-editor, game-2d, game-3d, playground, workspace, HUD)
- Managed via a Dev Tools panel
- Contributed by plugins

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Gizmo Surface System                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────┐    ┌─────────────────────┐  │
│  │ GizmoSurfaceRegistry │───▶│  Surface Definitions │  │
│  │  (lib/gizmos/)       │    │  - RingsGizmo        │  │
│  └──────────────────────┘    │  - OrbGizmo          │  │
│            │                  │  - ConstellationGizmo │  │
│            │                  │  - BodyMapGizmo      │  │
│            ▼                  │  - Relationship      │  │
│  ┌──────────────────────┐    │    Dashboard         │  │
│  │ GizmoSurfaceStore    │    │  - WorldToolsPanel   │  │
│  │  (Zustand + persist) │    └─────────────────────┘  │
│  │  - Enabled surfaces  │                             │
│  │    per context       │                             │
│  └──────────────────────┘                             │
│            │                                            │
│            ▼                                            │
│  ┌──────────────────────────────────────────────┐     │
│  │  UI Components                               │     │
│  │  • GizmoSurfaceRenderer - Renders active     │     │
│  │    overlays/panels for a context             │     │
│  │  • GizmoSurfacesPanel - Dev tools panel for  │     │
│  │    managing surfaces                         │     │
│  │  • ActiveGizmosIndicator - Shows active      │     │
│  │    gizmos in context                         │     │
│  └──────────────────────────────────────────────┘     │
│                                                          │
│  ┌──────────────────────────────────────────────┐     │
│  │  Plugin Integration                          │     │
│  │  • PluginFamily: 'gizmo-surface'             │     │
│  │  • registerGizmoSurface() in registryBridge  │     │
│  │  • Plugins can contribute custom surfaces    │     │
│  └──────────────────────────────────────────────┘     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Files

**Types & Registry:**
- `apps/main/src/lib/gizmos/surfaceRegistry.ts` - Core types and registry
- `apps/main/src/lib/gizmos/gizmoSurfaceStore.ts` - State management

**Registration:**
- `apps/main/src/lib/gizmos/registerGizmoSurfaces.ts` - Register all surfaces
- `apps/main/src/main.tsx` - Calls registration on startup

**UI Components:**
- `apps/main/src/components/devtools/GizmoSurfacesPanel.tsx` - Dev tools panel
- `apps/main/src/components/gizmos/GizmoSurfaceRenderer.tsx` - Renders active surfaces
- `apps/main/src/components/gizmos/ActiveGizmosIndicator.tsx` - Active gizmo indicator

**Plugin Integration:**
- `apps/main/src/lib/plugins/pluginSystem.ts` - Added `'gizmo-surface'` to PluginFamily
- `apps/main/src/lib/plugins/registryBridge.ts` - Plugin registration functions

### Usage

**For Users:**
1. Open Dev Tools → Gizmo Surfaces (🎮)
2. Browse available surfaces by category/context
3. Enable/disable surfaces per context (e.g., enable RingsGizmo for Game2D)
4. Active gizmos show an indicator in the corner

**For Developers:**
```tsx
// In Game2D.tsx or similar
import { GizmoSurfaceRenderer, ActiveGizmosIndicator } from './components/gizmos';

<div className="game-container">
  {/* Render active overlays */}
  <GizmoSurfaceRenderer
    context="game-2d"
    componentType="overlay"
  />

  {/* Show active gizmos indicator */}
  <ActiveGizmosIndicator context="game-2d" position="top-right" />
</div>
```

**For Plugin Authors:**
```ts
import { registerGizmoSurface } from './lib/plugins/registryBridge';

registerGizmoSurface({
  id: 'my-custom-gizmo',
  label: 'My Gizmo',
  overlayComponent: MyGizmoComponent,
  category: 'custom',
  supportsContexts: ['game-2d', 'playground'],
}, {
  origin: 'plugin-dir',
  author: 'Your Name',
});
```

### Benefits

✅ **Centralized Management** - All gizmos registered in one place
✅ **Context-Aware** - Enable different gizmos per context
✅ **User Control** - Dev tools panel for easy management
✅ **Plugin Support** - Third-party plugins can contribute surfaces
✅ **State Persistence** - Settings saved across sessions
✅ **Type Safe** - Full TypeScript support

## Validation

### Build Checks

```bash
# Clean package boundaries
✓ No frontend imports found in game components

# Package builds
✓ @pixsim7/interaction.gizmos build successful
✓ @pixsim7/game.components build successful
```

### Architecture Checks

- ✅ game components does not import from frontend
- ✅ Proper dependency chain (scene.gizmos → game components → frontend)
- ✅ All exports intentional and documented
- ✅ Types properly exported from scene.gizmos
- ✅ GizmoLab accessible at `/gizmo-lab` route

## References

- [packages/game/components/README.md](../packages/game/components/README.md)
- [packages/scene/gizmos/README.md](../packages/scene/gizmos/README.md)
- [Monorepo Package Boundaries Best Practices](https://monorepo.tools/)
- [Dependency Inversion Principle](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
