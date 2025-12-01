## Task 100: World Visual Role Binder Panel

**Status:** Planned  
**Purpose:** Give Opus a substantial, UI-focused task that *reuses* the existing panel/workspace system instead of adding a disconnected surface.

---

### Intent

Create a **World Visual Role Binder** as a first-class **workspace panel**, not a new standalone route. This panel lets creators bind gallery assets to world-specific visual roles (portraits, POV, backgrounds, comic panels) for characters and locations, using the same panel + workspace infrastructure we already have.

The panel should:

- Reuse existing panel/workspace patterns (Panel Builder, workspace toolbar, HUD/Layout panels) wherever possible.
- Store bindings in **world/scene meta JSON**, not on assets themselves.
- Use **ontology + world/NPC IDs** and the planned resolver (Task 99) to suggest assets, but keep final bindings explicit.

No new global UI paradigms; this panel should feel like “one more panel” in the existing workspace ecosystem.

---

### High-Level UX

The World Visual Role Binder appears as a panel you can add to the workspace, similar to HUD/Layout panels:

- **Left column:** List of characters and locations for the active world.
  - Characters: derived from existing NPC/world systems (`GameNPC`, world config).
  - Locations: derived from world/location definitions (e.g. `GameLocation`).
- **Middle column:** For the selected entity (character or location), show **visual role slots**:
  - For characters (e.g. `npc:alex`):
    - Portrait
    - Player-facing POV (hands/body) if applicable
    - Comic intro panels (list)
    - Optional: “default background”, “combat pose”, etc. (future extendable)
  - For locations (e.g. `loc:dungeon_entrance`):
    - Backgrounds (list)
    - Comic panels / establishing shots (list)

Each slot shows:

- The currently bound asset(s) as thumbnails (if any).
- An “Assign” / “Change” button that opens an asset picker.
- Optional “Use suggested” action that uses the resolver from Task 99 to pick candidates.

- **Right column (optional / stretch):** A minimal storyboard preview for a selected scene/arc that uses the world’s bindings plus any `Scene.meta.comicPanels` overrides.

All of this lives inside a panel container, using shared UI components (`Panel`, workspace layout components, etc.).

---

### Data Model / Storage (No Schema Changes)

**Hard constraint:** Do NOT change backend schemas. All bindings are stored in JSON meta fields that already exist for worlds/scenes.

Recommended storage:

- For per-world bindings, store in `GameWorld.meta.visualRoles` (or similar frontend contract):

  ```ts
  interface WorldVisualRoles {
    characters?: Record<string, {
      portraitAssetId?: string;
      povAssetId?: string;
      comicIntroPanelAssetIds?: string[];
      // extensible: combatPose, profile, etc.
    }>;

    locations?: Record<string, {
      backgroundAssetIds?: string[];
      comicPanelAssetIds?: string[];
    }>;
  }

  // World meta (frontend contract, stored in JSON):
  world.meta.visualRoles?: WorldVisualRoles;
  ```

- Scene-level overrides remain in `Scene.meta.comicPanels` (Task 98) and are **not** duplicated here; the binder can show them but must not own them.

**Important:** The panel should:

- Read/write these structures via existing world APIs and frontend stores.  
- Respect any existing meta fields; do not overwrite unknown keys in `world.meta`.

---

### Reuse of Existing Systems (Required)

To avoid UI fragmentation, the implementation MUST:

1. **Use the existing workspace panel system**
   - Add a new panel type (e.g. `WorldVisualRolesPanel`) registered with the same mechanism as other workspace panels (see Task 50/51/56 docs).
   - The panel is added via the workspace toolbar/“Add Panel” dropdown, not via a new top-level route.
   - The panel MUST respect the current **world context** pattern already used by other game panels (HUD/Layout, world-config, Game2D). Do not invent a separate “Game World screen”; it should plug into the same workspace + world selection flow.

2. **Reuse shared UI components**
   - Use `@pixsim7/shared.ui` components (`Panel`, `Tabs`, `Button`, etc.) for layout and styling.
   - Keep styling consistent with other panels (HUD Layout Designer, Workspace panels).

3. **Integrate with gallery / assets UI**
   - For asset selection, either:
     - Reuse an existing asset picker if one exists (e.g., the one used by other panels or the Assets route), or
     - Implement a small picker component that uses the same `GalleryAsset` / `GalleryToolContext` types and conventions.
   - The panel MUST NOT invent a completely separate asset listing; it should either embed or control existing gallery surfaces, or use existing selection APIs.

4. **Align with ontology and resolver (Task 99)**
   - When suggesting assets for a slot:
     - Use ontology/world IDs (e.g. `npc:*`, `loc:*`, `camera:view:pov`) and asset tags as defined in Task 99.
     - Use the resolver’s helper functions where available instead of duplicating matching logic.
   - The panel may still allow manual override; suggestions are helpers, not mandates.

5. **Play nicely with Interaction Studio / interactions**
   - Interaction Studio remains a separate, interaction-focused tool. This panel MUST NOT try to subsume or replace it.
   - However, when possible, it should use the same world/NPC IDs (`npc:*`, `loc:*`) so interactions, visual bindings, and gameplay logic all operate on the same world entities.

---

### Concrete Tasks

1. **Panel skeleton**
   - Create `WorldVisualRolesPanel.tsx` under the existing panels directory (e.g. `apps/main/src/components/panels/` or the appropriate location per panel architecture).
   - Register it with the panel registry / workspace panel system so it can be added to the workspace.

2. **Load world, characters, and locations**
   - Use existing frontend store(s) / API clients to:
     - Determine the “active world” (follow whatever pattern HUD/Layout panels use).
     - Load NPCs for that world (e.g., via `game_npcs` API or existing stores).
     - Load locations for that world (e.g., via `game_worlds` / `game_locations` or equivalent).
   - Normalize them into a list of entities with IDs that match world IDs (e.g. `npc:*`, `loc:*`).

3. **Render entity list (left column)**
   - Show characters and locations, grouped, with basic info (name, maybe a small icon).
   - Selecting an entity updates the middle column to show its visual role slots.

4. **Visual role slots (middle column)**
   - For each entity:
     - Read existing bindings from `world.meta.visualRoles` (if any).
     - Render slots (portrait, POV, backgrounds, comic panels) with thumbnails for bound assets.
   - Actions per slot:
     - “Assign / Change”: open asset picker; on selection, update the corresponding `world.meta.visualRoles` entry.
     - “Clear”: remove binding from `world.meta.visualRoles`.
     - “Suggest”: call the resolver from Task 99 using entity IDs and roles, and propose one or more assets; user can accept or ignore.

5. **Optional scene storyboard (right column)**
   - If implementing the mini storyboard:
     - Allow selecting a scene from a dropdown (scenes for current world).
     - Show frames from `Scene.meta.comicPanels` if present; otherwise, use world-level comic intro panels as a default.
     - This is read-only in this task; editing scene-level panels is covered by Task 98’s editor work.

6. **Persistence**
   - Ensure updates to `world.meta.visualRoles` are persisted using existing world update API flows.
   - Handle optimistic UI and error states gracefully (e.g., simple “Failed to save” message).

---

### Non-Goals / Constraints

- No backend schema migrations; only JSON meta fields are used.
- No new top-level routes; this is **only** a workspace panel.
- Do not implement a full comic editor or deep scene storyboard UI here—this panel is for **binding**, not full storyboard authoring.
- Do not duplicate gallery/asset browsing logic unnecessarily; prefer reusing existing components/patterns.

---

### How This Ties Everything Together

Once implemented, this panel provides:

- A clear, visual mapping between **world entities** (NPCs, locations) and **assets** (portraits, backgrounds, comic panels).
- A single, panel-based UI that other systems can rely on:
  - The asset resolver (Task 99) can treat `world.meta.visualRoles` as a high-priority source of “preferred assets” per NPC/location.
  - The `comic-panel` widget (Task 98) and scene storyboard UI can use these bindings as defaults.
  - ActionBlocks and DSL-based generation can resolve world/ontology IDs to real images via this panel’s bindings.

Crucially, it does this without introducing a new, separate UX paradigm, keeping everything aligned with the existing workspace and panel system.
