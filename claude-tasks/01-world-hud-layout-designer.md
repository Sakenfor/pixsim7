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

---

## Phase 2: HUD Presets, Responsiveness & Capability-Aware Layouts

Once the basic per-world HUD layout system is in place, the next step is to make it easier to reuse layouts and adapt them to different contexts.

**Phase 2 Goals**
- Add reusable **HUD presets** that can be applied to multiple worlds.
- Make HUD layouts **responsive** to viewport size (desktop vs tablet vs narrow window).
- Integrate more deeply with the **capability registry** and view modes so layouts can adapt to feature availability.

**Key Ideas**
- Define a simple preset type:
  ```ts
  interface HudLayoutPreset {
    id: string;
    name: string;
    description?: string;
    placements: HudToolPlacement[];
  }
  ```
- Store presets in a shared frontend store (later: per-world overrides or backend), and allow worlds to reference presets by ID plus small overrides.
- Use capability registry information (features/routes/actions) and world `viewMode` to conditionally choose presets (e.g. cinematic vs debug layouts).
- Add minimal breakpoint logic (`sm/md/lg`) to hide/move lower-priority tools on smaller screens.

**Phase 2 Implementation Outline**
1. **HUD Preset Library**
   - Add a `hudPresetsStore.ts` that maintains a list of `HudLayoutPreset`s (persisted in localStorage or a JSON file to start).
   - Extend `WorldUiConfig` so a world can reference a preset:
     ```ts
     interface WorldUiConfig {
       hudPresetId?: string;
       hudOverrides?: HudToolPlacement[]; // optional small tweaks
     }
     ```
   - In Game2D, resolve `hudPresetId` + `hudOverrides` into final placements.

2. **Preset Management UI**
   - Extend `HudLayoutEditor` to:
     - Load/save presets via `hudPresetsStore`.
     - Allow designers to:
       - Save current world’s HUD as a preset.
       - Apply an existing preset then tweak overrides.

3. **Responsive Layout Support (Lightweight)**
   - Introduce an optional `minViewport` / `maxViewport` field on `HudToolPlacement` (e.g. `'sm' | 'md' | 'lg'` breakpoints).
   - In the layout helper, filter placements based on current viewport width (can use a small hook that listens to window resize or CSS `sm/md/lg` classes).

4. **Capability & View Mode-Aware Presets**
   - Add a helper that, given `WorldUiConfig.viewMode` and capability registry data, picks a default preset when none is set:
     - `cinematic` → minimal preset (one or two tools).
     - `hud-heavy` → full preset with all tools placed.
     - `debug` → preset that includes debug tools (world info, mood debug).
   - Keep this logic small and data-driven; rely on IDs and simple rules, not hardcoded component imports.

---

## Phase 3: Dynamic HUD Adaptation & Player Preferences

With presets and responsive layouts working, add dynamic adaptation based on gameplay context and player preferences.

**Phase 3 Goals**
- Implement **context-aware HUD switching** - automatically change HUD based on game state.
- Add **player preference system** - let players customize their HUD within designer constraints.
- Enable **animated transitions** between HUD states for smooth UX.
- Support **floating/dockable panels** that players can reposition.

**Key Features**
- Context triggers for HUD changes:
  - Combat mode → show health, abilities, threat indicators.
  - Dialogue mode → minimize HUD, focus on conversation.
  - Exploration mode → show map, inventory, quest tracker.
- Player preferences:
  - Scale UI elements (accessibility).
  - Toggle individual tools on/off.
  - Save custom layouts per player.
- Smooth transitions:
  - Fade in/out animations.
  - Slide panels from edges.
  - Morphing between layouts.

**Phase 3 Implementation**
1. **Context Detection System**
   - Monitor game state (current scene type, active interactions, combat state).
   - Define HUD contexts and their preferred layouts.
   - Auto-switch between layouts with configurable triggers.

2. **Player Preference Layer**
   - Store player preferences in localStorage/user profile.
   - Layer player customizations over designer layouts.
   - Respect designer constraints (min/max tools, required elements).

3. **Animation Framework**
   - Use CSS transitions or Framer Motion for smooth changes.
   - Queue layout changes to prevent jarring switches.
   - Add preference for reduced motion (accessibility).

---

## Phase 4: Advanced HUD Components & Data Visualization

Evolve from static tool panels to dynamic, data-driven HUD components.

**Phase 4 Goals**
- Create **custom HUD widgets** beyond basic panels (meters, graphs, mini-maps).
- Add **real-time data binding** for live updates without re-renders.
- Implement **HUD scripting system** for complex behaviors.
- Support **picture-in-picture** and **multi-monitor** setups.

**Key Features**
- Widget types:
  - Progress bars (health, stamina, relationship meters).
  - Mini-maps with live position tracking.
  - Notification feeds with priority queuing.
  - Quick action wheels/radial menus.
- Data binding:
  - Subscribe to session state changes.
  - Efficient updates via observables/signals.
  - Computed values and thresholds.
- Scripting capabilities:
  - Conditional visibility logic.
  - Custom animations and effects.
  - Event-driven behaviors.

**Phase 4 Implementation**
1. **Widget Component Library**
   - Build reusable HUD widgets with standardized APIs.
   - Support theming and styling per world.
   - Enable widget composition (widgets within widgets).

2. **Reactive Data System**
   - Implement pub/sub for game state changes.
   - Use efficient diffing for minimal DOM updates.
   - Add performance monitoring for optimization.

3. **HUD Script Engine**
   - Simple DSL or JavaScript snippets for widget logic.
   - Sandboxed execution environment.
   - Visual scripting option for non-programmers.

---

## Phase 5: Production HUD System & Team Collaboration

Transform the HUD system into a production-ready platform with team features.

**Phase 5 Goals**
- Build **HUD version control** with branching and rollback.
- Add **A/B testing framework** for HUD optimization.
- Create **HUD analytics dashboard** to track usage patterns.
- Enable **collaborative editing** with conflict resolution.

**Key Features**
- Version control:
  - Track HUD layout changes over time.
  - Branch layouts for experimentation.
  - Rollback to previous versions if needed.
- A/B testing:
  - Define layout variants.
  - Random assignment to player cohorts.
  - Metrics tracking (engagement, confusion, task completion).
- Analytics:
  - Which tools are most/least used.
  - Click heatmaps on HUD elements.
  - Player journey through HUD states.
- Team collaboration:
  - Real-time collaborative editing.
  - Comment and review system.
  - Approval workflows for production layouts.

**Phase 5 Implementation**
1. **Version Control Integration**
   - Store layout history in backend.
   - Implement diff visualization for changes.
   - Add merge conflict resolution UI.

2. **A/B Testing Platform**
   - Variant definition and management.
   - Statistical analysis of results.
   - Automatic winner selection.

3. **Analytics Pipeline**
   - Event tracking for all HUD interactions.
   - Aggregation and visualization dashboards.
   - Export data for external analysis.

4. **Collaboration Features**
   - WebSocket-based real-time sync.
   - Presence indicators (who's editing).
   - Change proposals and review system.
