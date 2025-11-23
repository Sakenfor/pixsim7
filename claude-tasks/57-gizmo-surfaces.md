**Task 57: Gizmo & Debug Surfaces Registry**

> **For Agents**
> - Makes gizmo and debug dashboards pluggable “surfaces”, similar to panels and graph editors.
> - Targets overlays/dashboards from `scene-gizmos`, NPC brain tools, world/time debug UIs, etc.
> - Read:
>   - `packages/scene-gizmos/*`
>   - `apps/main/src/components/gizmos/*`
>   - `docs/ADR-GIZMO-ARCHITECTURE.md`
>   - `claude-tasks/05-simulation-playground-for-npc-brain-and-world.md`

---

## Goals

1. Define `GizmoSurfaceDefinition` and a `gizmoSurfaceRegistry`.
2. Register existing gizmo overlays and dashboards.
3. Integrate gizmo surfaces into workspace / Dev tools and, optionally, HUD layouts.
4. Optionally wire gizmo surfaces into the plugin system.

Non-goals:
- Changing gizmo semantics or simulation logic.
- Adding new gizmo types; focus is on surfaces/registration.

---

## Phase Checklist

- [ ] **Phase 57.1 – Gizmo Surface Types & Registry**
- [ ] **Phase 57.2 – Register Existing Gizmo Surfaces**
- [ ] **Phase 57.3 – Workspace & HUD Integration**
- [ ] **Phase 57.4 – Plugin Integration (Optional)**
- [ ] **Phase 57.5 – UX & Docs**

**Status:** Not started.

---

## Phase 57.1 – Gizmo Surface Types & Registry

**Goal:** Capture gizmo UIs as registry entries.

### Plan

- In `apps/main/src/lib/gizmos`:
  ```ts
  export type GizmoSurfaceId =
    | 'rings-gizmo'
    | 'npc-mood-timeline'
    | 'relationship-debug'
    | 'world-time-overlay'
    | string;

  export interface GizmoSurfaceDefinition {
    id: GizmoSurfaceId;
    label: string;
    description?: string;
    icon?: string;
    category?: 'scene' | 'world' | 'npc' | 'debug' | 'custom';

    // UI surfaces
    panelComponent?: React.ComponentType<any>;   // workspace/debug panel
    overlayComponent?: React.ComponentType<any>; // in-scene/world overlay

    supportsContexts?: Array<'scene-editor' | 'game-2d' | 'game-3d' | 'playground'>;
  }

  export class GizmoSurfaceRegistry {
    // register/get/getAll/getByCategory...
  }

  export const gizmoSurfaceRegistry = new GizmoSurfaceRegistry();
  ```

### Verification

- Registry can register and retrieve `GizmoSurfaceDefinition` instances.

---

## Phase 57.2 – Register Existing Gizmo Surfaces

**Goal:** Register currently implemented gizmos / debug dashboards.

### Plan

- Identify core gizmos:
  - `RingsGizmo` from `scene-gizmos`.
  - Any world-time overlays, NPC presence/time views.
  - NPC brain playground views from Task 05.
- In `registerGizmoSurfaces()`:
  ```ts
  gizmoSurfaceRegistry.register({
    id: 'rings-gizmo',
    label: 'Rings Gizmo',
    description: 'Visual rings overlay for scene nodes',
    icon: '⭕',
    category: 'scene',
    overlayComponent: RingsGizmo,
    supportsContexts: ['scene-editor', 'game-2d'],
  });
  // ...other gizmos...
  ```
- Call `registerGizmoSurfaces()` on app startup.

### Verification

- `gizmoSurfaceRegistry.getAll()` lists expected gizmo surfaces.

---

## Phase 57.3 – Workspace & HUD Integration

**Goal:** Make gizmo surfaces controllable from workspace and HUD-related UIs.

### Plan

- Add a `GizmoSurfacesPanel`:
  - Lists gizmo surfaces with toggles per context.
  - Lives under Dev tools / gizmos section.
- For contexts like Game2D / scene editor:
  - Read enabled gizmo surfaces from a store.
  - Render their `overlayComponent` into overlay layers.
- Optionally allow HUD layouts (Task 01/58) to reference gizmo surfaces for HUD overlays.

### Verification

- Gizmo overlays can be enabled/disabled from workspace.
- Gizmo panel dashboards can be opened as panels.

---

## Phase 57.4 – Plugin Integration (Optional)

**Goal:** Allow gizmo surfaces to be supplied by plugins.

### Plan

- In `pluginSystem.ts`:
  - Add `'gizmo-surface'` to `PluginFamily`.
  - Add metadata extension with `gizmoSurfaceId`, `category`, contexts.
- In `registryBridge.ts`:
  - Add `registerGizmoSurface(def, options)` that writes to:
    - `gizmoSurfaceRegistry`.
    - `pluginCatalog` (`family: 'gizmo-surface'`).

### Verification

- Prototype gizmo plugin can be loaded and appears in `gizmoSurfaceRegistry` + PluginBrowser.

---

## Phase 57.5 – UX & Docs

**Goal:** Make gizmo surfaces discoverable, not hidden internals.

### Plan

- UX:
  - In Dev Tools / Gizmos panel, show status (enabled/disabled) and contexts for each surface.
  - Add a small indicator in Game2D / scene editor when gizmos are active.
- Docs:
  - Update `ADR-GIZMO-ARCHITECTURE.md` to reference gizmo surfaces & registry.
  - Optionally create `GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md` summarizing:
    - Available surfaces.
    - How to add new ones.

### Verification

- Devs can turn gizmos on/off without digging through the code.

