**Task 58: HUD Builder Integration with Panel Builder & Data Binding**

> **For Agents**
> - Connects Task 01 (World HUD Layout Designer) to the Panel Builder + data binding system (Tasks 50 & 51).
> - The HUD should be built out of the same widget compositions used for custom panels.
> - Read:
>   - `claude-tasks/01-world-hud-layout-designer.md`
>   - `claude-tasks/50-workspace-panel-system-enhancement.md`
>   - `claude-tasks/51-builder-data-sources.md`
>   - `apps/main/src/lib/widgets/panelComposer.ts`
>   - `apps/main/src/lib/dataBinding/index.ts`

---

## Goals

1. Model HUD layouts as compositions of widgets (Panel Builder).
2. Use Task 51 data bindings to feed HUD widgets from session/world stores.
3. Provide a HUD Layout Builder UI (panel + optional route).
4. Apply per-world HUD layouts in game frontends (2D/3D).

Non-goals:
- No backend schema changes (store HUD configs in JSON/meta or frontend storage).
- No new widget types beyond what Panel Builder already uses (at least for v1).

---

## Phase Checklist

- [x] **Phase 58.1 – HUD Layout Types & Store**
- [x] **Phase 58.2 – HUD Builder Panel (Reuse Panel Builder)**
- [ ] **Phase 58.3 – HUD Renderer in Game Frontends**
- [ ] **Phase 58.4 – Presets, Profiles & Overrides**
- [ ] **Phase 58.5 – UX & Docs**

**Status:** In progress (Phases 58.1-58.2 complete).

---

## Phase 58.1 – HUD Layout Types & Store

**Goal:** Define HUD layout types that reuse panel composition structures and decide where to persist them.

### Plan

- Add HUD layout types:
  ```ts
  // lib/hud/types.ts
  import type { PanelComposition } from '../widgets/panelComposer';

  export type HudRegionId = 'top' | 'bottom' | 'left' | 'right' | 'center';

  export interface HudRegionLayout {
    region: HudRegionId;
    composition: PanelComposition;
  }

  export interface WorldHudLayout {
    id: string;
    worldId: number | string;
    name: string;
    regions: HudRegionLayout[];
    isDefault?: boolean;
  }
  ```
- Add a HUD layout store:
  ```ts
  // stores/hudLayoutStore.ts
  export interface HudLayoutState {
    layouts: WorldHudLayout[];
  }
  // plus actions to get/set per worldId, using createBackendStorage('hudLayouts').
  ```

### Verification

- Able to create/update/delete HUD layouts for a given `worldId`.

---

## Phase 58.2 – HUD Builder Panel (Reuse Panel Builder)

**Goal:** Provide a UI to edit HUD layouts using existing builder components.

### Plan

- Create `HudLayoutBuilderPanel`:
  - Wraps:
    - `PanelBuilderCanvas`
    - `WidgetLibrary`
    - `WidgetInspector`
    - `DataBindingEditor`
  - Offers:
    - Region selector (`top`, `bottom`, etc.).
    - Region preview around a simple game viewport mock.
  - Reuses the same widget and data binding types as composed panels.
- HUD-specific widgets:
  - Initially reuse existing widgets (Metric, List, Text, etc.).
  - Later, add HUD-focused widgets (minimap, NPC status strip) as needed.

### Verification

- For a selected world, can design per-region HUD widget layouts and save them.

---

## Phase 58.3 – HUD Renderer in Game Frontends

**Goal:** Apply stored HUD layouts in Game2D and (optionally) Game3D.

### Plan

- Implement `HudRenderer`:
  - Reads `WorldHudLayout` for current `worldId`.
  - For each `HudRegionLayout`, uses the same rendering path as `ComposedPanel`:
    - Resolve widgets via `widgetRegistry`.
    - Resolve data bindings via Task 51 hooks (`useBindingValues`).
  - Renders into overlay containers positioned per region.
- Integrate into:
  - `Game2D.tsx` – wrap scene viewport with `HudRenderer`.
  - Any Game3D entry if present (or leave as future work).

### Verification

- HUD appears in game view and reflects world/session state.
- Changing HUD layout in builder affects HUD after reload.

---

## Phase 58.4 – Presets, Profiles & Overrides

**Goal:** Provide baseline HUD presets and a way to override them per world/profile.

### Plan

- Define a few presets:
  - “Story HUD” – minimal story UI.
  - “Debug HUD” – lots of metrics and state.
  - “Playtest HUD” – middle ground.
- Allow:
  - Per-world default HUD selection.
  - Dev override (e.g., via Dev tools or workspace preset).
- Wire with:
  - `hudLayoutStore` (for layouts).
  - `workspaceStore` (for dev/test overrides if desired).

### Verification

- For each world, can pick a default HUD preset/layout.
- Devs can temporarily switch HUD without changing world defaults.

---

## Phase 58.5 – UX & Docs

**Goal:** Make HUD design discoverable and maintainable.

### Plan

- UX:
  - Add “HUD Designer” access:
    - As a workspace panel (`HudLayoutBuilderPanel`).
    - Optionally as a dedicated route.
  - Show clearly which world’s HUD is being edited.
- Docs:
  - Update Task 01 to note that HUD now uses the Panel Builder + data binding stack.
  - Add a short HUD section to `SYSTEM_OVERVIEW.md`.
  - Optional: `HUD_LAYOUT_DESIGNER.md` with:
    - Regions.
    - Widget and binding examples.

### Verification

- Developers can:
  - Open HUD Designer.
  - Build a simple HUD for a given world.
  - See that HUD in the 2D game view.

---

## Success Criteria

- HUD layouts are defined as widget compositions reusing existing builder & bindings.
- There is a HUD Designer in the editor that feels consistent with other composition tooling.
- Game frontends render per-world HUD layouts based on these compositions.

