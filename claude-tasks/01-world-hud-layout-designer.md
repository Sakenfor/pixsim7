**Task: World HUD / Dashboard Layout Designer**

**Context**
- Game2D uses `WorldToolPlugin` + `WorldToolsPanel` to show tools like Relationships, Quest Log, Inventory, World Info.
- Layout is currently hard-coded in `Game2D.tsx` (panel placement, which panel appears where).
- Goal: let designers configure the Game2D HUD layout per-world without touching code, using config stored in `GameWorld.meta`.

**Goal**
Design and implement a per-world HUD layout system that:
- Uses existing `WorldToolPlugin` definitions (from `worldToolRegistry`) as building blocks.
- Stores layout configuration in `GameWorldDetail.meta`.
- Lets Game2D render tools according to the layout config.
- Provides a simple editor UI for designers to edit HUD layout per world.

**Key Ideas**
- Introduce a small schema for `world.meta.ui.hud`, e.g.:
  ```ts
  interface HudToolPlacement {
    toolId: string;                       // world tool plugin id
    region: 'left' | 'right' | 'top' | 'bottom' | 'overlay';
    order?: number;
    visibleWhen?: { kind: 'capability' | 'flag'; id: string }; // optional
  }

  interface WorldUiConfig {
    hud?: HudToolPlacement[];
  }
  ```
- Each placement references an existing `WorldToolPlugin` (from `worldToolRegistry`).
- Game2D reads `world.meta.ui.hud` and decides which `WorldToolsPanel` variant to render in which region (or uses a small layout util).

**Implementation Outline**
1. **Schema & Types**
   - Add TypeScript types for `WorldUiConfig` and `HudToolPlacement` in a shared place (e.g. `@pixsim7/types` or a local frontend types file).
   - Decide on default layout when no config is present (e.g. current behavior).

2. **Game2D Layout Integration**
   - In `frontend/src/routes/Game2D.tsx`, after you build `WorldToolContext`, derive:
     - Available tools: `const tools = worldToolRegistry.getVisible(context)`.
     - Tool placement config: read `worldDetail.meta?.ui?.hud` if present.
   - Implement a small helper that groups tools by region and passes them to:
     - One or more `WorldToolsPanel` instances, or
     - A new layout component that arranges multiple regions.
   - Ensure that if a configured `toolId` doesn’t exist or isn’t visible, it is skipped gracefully.

3. **HUD Layout Editor UI**
   - Add a simple editor for HUD layout, e.g.:
     - New component: `frontend/src/components/game/HudLayoutEditor.tsx`.
     - Place it either on the GameWorld route or as a floating panel in Workspace.
   - Features:
     - Show list of available world tools (from `worldToolRegistry.getAll()`).
     - Let designer assign a tool to a region (select region + order).
     - Store changes back into `GameWorldDetail.meta.ui.hud` via existing world meta save API.
   - Basic UX is enough: a table with dropdowns for region/order is fine; no drag-and-drop required.

4. **Visibility Conditions (optional, light)**
   - For now, you can support a simple `visibleWhen`:
     - e.g. `kind: 'capability', id: 'generation'` → show only if that feature is enabled in the capability registry.
     - Or `kind: 'flag', id: 'session.flags.someFlag'`.
   - Implement this as a helper that filters placements before rendering.

**Constraints**
- Do not change backend schemas; use existing JSON meta on `GameWorld`.
- Keep default behavior backward-compatible when no HUD config is defined.
- Reuse `WorldToolPlugin` and `WorldToolsPanel` where possible; avoid duplicating logic.

**Success Criteria**
- Designers can open the HUD layout editor, assign world tools to regions, save, and see Game2D update layout per world accordingly.
- Game2D behavior is unchanged for worlds without HUD config.

