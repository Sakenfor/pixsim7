**Task: World HUD / Dashboard Layout Designer (Multi‑Phase)**

**Context**
- Game2D already uses `WorldToolPlugin` + `WorldToolsPanel` to show tools (Relationships, Quest Log, Inventory, World Info, Mood Debug, etc.).
- Placement is still effectively “one cluster” controlled in `Game2D.tsx`.
- Designers should be able to shape the HUD (which tools, where, and how many) per‑world without touching code.

Below are 5 incremental phases for evolving the HUD system. Each phase should be independently shippable and realistic.

---

### Phase 1 – Minimal Per‑World HUD Config

**Goal**
Introduce a very small per‑world HUD config that controls which tools are visible, without changing the overall layout.

**Scope**
- Add a list of enabled world tools per world, stored in `GameWorld.meta`.
- Game2D filters `worldToolRegistry.getVisible(context)` using this list.
- No new UI editor yet; editing can be done via JSON or a simple debug panel.

**Key Steps**
1. Add types (frontend‑only) for HUD config, e.g.:
   ```ts
   interface HudToolConfig {
     toolId: string;
     enabled: boolean;
   }

   interface WorldUiConfig {
     hudTools?: HudToolConfig[];
   }
   ```
2. Add small helpers to read/write `WorldUiConfig` from `GameWorldDetail.meta`.
3. In `Game2D.tsx`, after building `WorldToolContext`:
   - Compute `enabledToolIds` from `WorldUiConfig` (fallback: all tools enabled if no config).
   - Filter `worldToolRegistry.getVisible(context)` by `enabledToolIds` before passing to `WorldToolsPanel`.
4. Keep default behavior unchanged when no HUD config is present.

---

### Phase 2 – Simple Regions (Left/Right/Bottom)

**Goal**
Allow placing tools into a few coarse regions (e.g. left column, right column, bottom panel) while still keeping implementation simple.

**Scope**
- Extend HUD config with a `region` and `order` field.
- Add a small layout helper in Game2D to group tools by region.
- Use multiple `WorldToolsPanel` instances or a new layout component.

**Key Steps**
1. Extend types:
   ```ts
   type HudRegion = 'left' | 'right' | 'bottom';

   interface HudToolPlacement {
     toolId: string;
     region: HudRegion;
     order?: number;
   }

   interface WorldUiConfig {
     hudPlacements?: HudToolPlacement[];
   }
   ```
2. Write a helper that, given:
   - `visibleTools` from `worldToolRegistry.getVisible(context)`,
   - `hudPlacements` from config,
   returns three arrays: `leftTools`, `rightTools`, `bottomTools`, sorted by `order`.
3. In `Game2D.tsx`, render up to three `WorldToolsPanel` instances (or a simple layout component) in appropriate regions of the UI.
4. If there’s no placement info, fall back to the previous “single cluster” behavior.

---

### Phase 3 – Basic HUD Layout Editor

**Goal**
Provide a simple in‑app editor so designers can choose which tools appear and in which region, per world.

**Scope**
- Editor just manipulates `HudToolPlacement` data; no conditions or presets yet.
- Integrated into an existing world‑editing surface (e.g. GameWorld route or floating panel).

**Key Steps**
1. Create `frontend/src/components/game/HudLayoutEditor.tsx`:
   - Props:
     - `world: GameWorldDetail`
     - `onWorldUpdate(world: GameWorldDetail): void`
   - Behaviour:
     - Reads current `WorldUiConfig` from `world.meta`.
     - Lists `worldToolRegistry.getAll()` as available tools.
     - For each tool, allow:
       - Selecting region from a `<select>` (`left/right/bottom/hidden`).
       - Setting order via a small number input or simple up/down buttons.
     - On save, writes config back to world via existing world meta save API.
2. Wire the editor into an appropriate place (e.g. “HUD Layout” panel on the `GameWorld` route or a floating panel in workspace).
3. Confirm that worlds without any HUD data continue to work as before.

---

### Phase 4 – Light Conditions (View Mode / Capability)

**Goal**
Allow simple conditions on HUD placements based on view mode or capability flags, without building a full rule engine.

**Scope**
- Add optional conditions like “only show in debug view mode” or “only if a feature is enabled”.
- Keep condition types minimal and evaluate them in a small helper.

**Key Steps**
1. Extend `HudToolPlacement` with optional condition fields, e.g.:
   ```ts
   interface HudToolPlacement {
     toolId: string;
     region: HudRegion;
     order?: number;
     onlyInViewMode?: 'cinematic' | 'hud-heavy' | 'debug';
     requiresFeatureId?: string; // capability feature id, e.g. 'game'
   }
   ```
2. Add a helper that filters placements by:
   - Current `viewMode` for the world (from `WorldUiConfig` or a default).
   - Current capabilities (from the capability registry feature list).
3. Extend `HudLayoutEditor` minimally to let designers pick `onlyInViewMode` and `requiresFeatureId` using dropdowns.

---

### Phase 5 – Local HUD Presets (Optional)

**Goal**
Make it easier to reuse HUD layouts across worlds by introducing simple presets stored on the frontend (no backend changes).

**Scope**
- Presets are named collections of `HudToolPlacement` saved in localStorage or a small JSON file.
- Worlds can “copy from preset” but still store their own config in `world.meta`.

**Key Steps**
1. Define a `HudLayoutPreset` type in a small helper module:
   ```ts
   interface HudLayoutPreset {
     id: string;
     name: string;
     description?: string;
     placements: HudToolPlacement[];
   }
   ```
2. Add a preset store (e.g. `hudLayoutPresetsStore.ts`) that:
   - Loads/saves presets from localStorage.
   - Provides `getPresets()`, `savePreset(preset)`, `deletePreset(id)`.
3. Extend `HudLayoutEditor` to:
   - “Save current layout as preset” (name + optional description).
   - “Apply preset” which overwrites the world’s HUD placements with the preset (world still persists its own copy).
4. Keep everything opt‑in and local; avoid backend changes and keep the logic simple.

