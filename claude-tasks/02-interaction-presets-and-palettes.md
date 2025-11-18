**Task: Interaction Presets & Designer-Friendly Palettes (Multi‑Phase)**

**Context**
- NPC interactions are plugin-based (`InteractionPlugin` via `interactionRegistry`) and configured in `NpcSlotEditor` and hotspot definitions.
- Designers currently tweak low-level config fields (numbers, flags) for each slot/hotspot.
- We want higher-level “interaction presets” that bundle plugin config into reusable, named configurations.

Below are 5 incremental phases for evolving the interaction preset system.

---

### Phase 1 – Basic Preset Type & Apply in NpcSlotEditor

**Goal**
Let designers define simple named presets and apply them to NPC slots in `NpcSlotEditor`, without any dedicated editor UI yet.

**Scope**
- Presets are defined as data structures in a small TS module.
- NpcSlotEditor can apply a preset to a slot, populating interaction config.

**Key Steps**
1. Define `InteractionPreset` in a new module, e.g. `frontend/src/lib/game/interactions/presets.ts`:
   ```ts
   export interface InteractionPreset {
     id: string;                  // 'flirt_friendly'
     name: string;                // 'Flirt (Friendly)'
     interactionId: string;       // plugin id, e.g. 'persuade'
     config: Record<string, any>; // plugin-specific config
   }
   ```
2. Add helpers to load/save presets:
   - For now, localStorage or a simple in-memory list is fine.
   - Later, this can move to `GameWorld.meta` or a backend endpoint.
3. In `NpcSlotEditor`:
   - Load available presets at component init.
   - For the selected slot, add a small dropdown:
     - Shows `InteractionPreset.name` grouped by `interactionId`.
     - “Apply preset” button sets:
       ```ts
       slot.interactions[preset.interactionId] = {
         enabled: true,
         ...preset.config,
       };
       ```
   - Allow designers to further tweak config via existing `InteractionConfigForm` after applying.

---

### Phase 2 – Simple Preset Editor Component

**Goal**
Provide a basic UI to create, edit, and delete presets, reusing existing interaction config forms.

**Scope**
- Editor is a standalone component that works with the preset store.
- It’s enough to edit presets for the current world or globally; we don’t need complex scoping yet.

**Key Steps**
1. Implement `frontend/src/components/game/InteractionPresetEditor.tsx`:
   - Shows list of presets.
   - “New preset” flow:
     - Pick `interactionId` from `interactionRegistry` (simple select).
     - Use `InteractionConfigForm` to edit `config`.
     - Enter `name` and `id` (or auto-generate id from name).
   - “Edit” and “Delete” actions for existing presets.
2. Wire the editor into an appropriate place:
   - e.g. as a floating panel in workspace or a route under a dev/settings section.
3. Ensure that saving presets updates the store used by `NpcSlotEditor` (either via shared store or re-fetch).

---

### Phase 3 – Hotspot Editor Integration

**Goal**
Let designers apply the same presets when configuring interactions on hotspots, for consistency with NPC slots.

**Scope**
- Reuse the same preset data and UI patterns.
- Only show presets relevant to the current interaction type.

**Key Steps**
1. Identify hotspot editing component(s) (e.g. 2D location editor/hotspot editor).
2. For each hotspot interaction that uses the plugin system:
   - Load presets.
   - Filter presets whose `interactionId` matches the hotspot’s interaction plugin.
   - Provide the same “Apply preset” button to populate config.
3. Keep the UI minimal; the key is reuse of the presets, not an elaborate editor.

---

### Phase 4 – Per‑World Presets & Basic Categorization

**Goal**
Support both global presets and per‑world presets, with simple categories/tags to help organize them.

**Scope**
- Extend `InteractionPreset` with optional categorization fields.
- Allow separate sets for “global defaults” and “world overrides”.

**Key Steps**
1. Extend type:
   ```ts
   export interface InteractionPreset {
     id: string;
     name: string;
     interactionId: string;
     config: Record<string, any>;
     category?: string; // 'romance', 'trade', 'combat'
     tags?: string[];
   }
   ```
2. Update the preset store to support:
   - Global presets (e.g. stored in localStorage under one key).
   - World-specific presets (e.g. stored in `GameWorld.meta.interactionPresets`).
3. In editors (NpcSlotEditor, hotspot editor):
   - Show combined list (global + world) with a badge indicating scope.
   - Optionally allow “promote to global” or “copy to world” actions.

---

### Phase 5 – Optional Usage Summary (Dev‑Only)

**Goal**
Give designers a rough sense of which presets are actually used during playtests, without building a full analytics system.

**Scope**
- Dev‑only counters for “preset used N times”.
- A simple dev panel to view counts.

**Key Steps**
1. When applying a preset to a slot/hotspot, attach its `presetId` in a small metadata field on the interaction config (e.g. `config.__presetId`).
2. In the interaction executor, when an interaction runs:
   - If `config.__presetId` exists, increment an in-memory/localStorage counter for that preset ID.
3. Add a minimal dev component (e.g. `InteractionPresetUsagePanel`) that:
   - Lists presets with their usage counts.
   - Is only reachable via a dev route or flag.

