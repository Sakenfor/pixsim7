**Task: Interaction Presets & Designer-Friendly Palettes**

**Context**
- NPC interactions are now plugin-based (`InteractionPlugin` via `interactionRegistry`) and configured in `NpcSlotEditor` / hotspot actions.
- Designers currently have to tune raw config fields (numbers, flags) for each slot/hotspot.
- Goal: provide higher-level “interaction presets” that designers can reuse, instead of tweaking low-level config every time.

**Goal**
Add a system for **Interaction Presets** that:
- Encapsulates `InteractionPlugin` + config into reusable named presets.
- Provides a palette UI in `NpcSlotEditor` (and optionally hotspot editors) to apply presets.
- Stores presets in JSON (e.g. per-world in `GameWorld.meta` or a shared presets registry).

**Key Ideas**
- Define a simple preset type:
  ```ts
  interface InteractionPreset {
    id: string;                  // 'flirt_friendly'
    name: string;                // 'Flirt (Friendly)'
    interactionId: string;       // e.g. 'persuade' or custom plugin id
    config: Record<string, any>; // plugin-specific config
    category?: string;           // 'romance', 'trade', 'combat'
    tags?: string[];
  }
  ```
- Presets can be:
  - Global (shared across worlds), or
  - Per-world, stored under `GameWorld.meta.interactionPresets`.
- When a preset is applied to a slot/hotspot, it populates the interaction config for that plugin.

**Implementation Outline**
1. **Preset Storage & Types**
   - Add `InteractionPreset` type in a shared TS module (`frontend/src/lib/game/interactions/presets.ts` or similar).
   - Add helper functions:
     - `loadWorldInteractionPresets(world: GameWorldDetail): InteractionPreset[]`
     - `saveWorldInteractionPresets(worldId: number, presets: InteractionPreset[])` (using existing meta APIs).

2. **Preset Editor UI**
   - New component: `frontend/src/components/game/InteractionPresetEditor.tsx`.
   - Features:
     - List existing presets (per world or global).
     - Create new preset:
       - Select `interactionId` from `interactionRegistry`.
       - Use `InteractionConfigForm` to edit config.
       - Save as named preset.
     - Edit/delete presets.
   - Keep the UI simple; focus on functionality.

3. **Preset Palette in NpcSlotEditor**
   - In `frontend/src/components/NpcSlotEditor.tsx`:
     - Load presets for the current world.
     - Add a “Presets” section in the slot editor:
       - A dropdown or list of presets available for the selected slot.
       - “Apply preset” button that:
         - Sets `slot.interactions[interactionId] = { enabled: true, ...configFromPreset }`.
         - Triggers re-render / save as usual.
   - Optionally allow editing the applied preset config locally after applying (presets are just starting points).

4. **Optional: Hotspot Editor Integration**
   - If there is a hotspot editor for 2D locations, add the same preset palette there in a later step.

**Constraints**
- No backend schema changes; use existing meta fields for storing presets (e.g., under `GameWorld.meta`).
- Keep all interaction behavior in plugins; presets are just config bundles, not new code paths.

**Success Criteria**
- Designers can create named interaction presets and reuse them across multiple NPC slots without touching raw config each time.
- Applying a preset correctly configures and enables the appropriate interaction plugin for a slot.

---

## Phase 2: Preset Libraries, Roles & Balancing

After the basic preset system is working, the next step is to make presets richer and easier to manage across a whole game.

**Phase 2 Goals**
- Introduce **global preset libraries** and per-world overrides.
- Let designers define **role-based defaults** (e.g. “bartender greeting”, “romanceable NPC flirt”) that auto-apply to certain slots.
- Add light **balancing/analytics hooks** so designers can see how often presets are used and how they perform.

**Key Ideas**
- Extend `InteractionPreset` with optional role/conditions:
  ```ts
  interface InteractionPreset {
    id: string;
    name: string;
    interactionId: string;
    config: Record<string, any>;
    category?: string;
    tags?: string[];
    defaultForRoles?: string[]; // e.g. ['bartender', 'romance_target']
  }
  ```
- Maintain:
  - A global preset library (e.g. `globalInteractionPresets` in localStorage or a static JSON).
  - Per-world preset overrides that can shadow or extend global presets.
- Add optional logging hooks when a preset-based interaction runs to capture usage stats (in dev mode only, or via an in-memory counter).

**Phase 2 Implementation Outline**
1. **Global vs World Presets**
   - Adjust presets store to support:
     - `getGlobalPresets()`, `setGlobalPresets()`.
     - `getWorldPresets(worldId)`, `setWorldPresets(worldId, presets)`.
   - Resolution strategy when editing/applying:
     - Show combined list, but differentiate global vs world in the UI (badge or section).
     - When saving changes to a global preset from a world context, either:
       - Fork into a world-specific preset, or
       - Provide a toggle “update globally” vs “override in this world”.

2. **Role-Based Defaults for Slots**
   - Extend `NpcSlot2d` and/or its metadata in `GameLocation.meta` with roles that map to presets (if not already set):
     - e.g. `slot.roles = ['bartender']`.
   - In `NpcSlotEditor`, when creating or editing a slot:
     - Suggest presets whose `defaultForRoles` includes any of the slot’s roles.
     - Optionally auto-apply a role default when creating new slots with a certain role.

3. **Hotspot Preset Integration (Optional but Recommended)**
   - If there is a hotspot editor for 2D interactions, integrate the same preset selection logic there:
     - Show presets filtered by interaction kind (e.g. only presets whose `interactionId` matches the hotspot’s action type).

4. **Usage & Balancing Hooks (Lightweight)**
   - In the interaction executor (`executeSlotInteractions` or `executeInteraction`), add a dev-only hook that:
     - If an interaction came from a preset (store preset ID on the config metadata when applied), increment a counter for that preset ID in a small in-memory or localStorage store.
   - Add a simple dev panel (later) to view preset usage counts, helping designers see which presets are actually used.

---

## Phase 3: Smart Presets & Contextual Suggestions

Build intelligence into the preset system to reduce manual configuration.

**Phase 3 Goals**
- Add **AI-powered preset suggestions** based on NPC type and context.
- Implement **conditional presets** that change based on game state.
- Create **preset variations** for different relationship levels.
- Enable **preset inheritance** and composition.

**Key Features**
- Smart suggestions:
  - Analyze NPC traits to suggest appropriate presets.
  - Consider location and time for context-aware presets.
  - Learn from designer choices to improve suggestions.
- Conditional logic:
  - Different presets for first meeting vs familiar NPC.
  - Relationship-based preset selection.
  - Quest state influences available presets.
- Preset families:
  - Base preset + variations.
  - Inheritance chains (generic → specific).
  - Composite presets from multiple sources.

---

## Phase 4: Interaction Balancing & Tuning Dashboard

Add sophisticated tools for balancing and optimizing interaction gameplay.

**Phase 4 Goals**
- Build **interaction simulator** to test preset outcomes.
- Create **balance dashboard** with success/failure analytics.
- Add **difficulty scaling** for interactions.
- Implement **player skill tracking** for adaptive difficulty.

**Key Features**
- Simulation engine:
  - Run 1000s of simulated interactions.
  - Monte Carlo analysis of outcomes.
  - Identify edge cases and exploits.
- Balance metrics:
  - Success rate distribution.
  - Resource consumption analysis.
  - Time-to-complete tracking.
- Adaptive difficulty:
  - Player skill estimation.
  - Dynamic parameter adjustment.
  - Fairness algorithms.

---

## Phase 5: Production Interaction System

Enterprise-grade interaction management with full lifecycle support.

**Phase 5 Goals**
- Implement **interaction versioning** with migration paths.
- Add **multiplayer interaction** support.
- Create **interaction marketplace** for sharing presets.
- Build **interaction debugger** with replay capability.

**Key Features**
- Version control:
  - Track preset evolution.
  - Automated migration scripts.
  - Compatibility testing.
- Multiplayer:
  - Synchronized interactions.
  - Turn-based negotiation.
  - Group interactions.
- Marketplace:
  - Share presets between projects.
  - Rate and review system.
  - Curated collections.
