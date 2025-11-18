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

