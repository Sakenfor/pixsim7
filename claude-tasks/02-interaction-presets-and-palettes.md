**Task: Interaction Presets & Designer-Friendly Palettes (Multi‑Phase)**

**Context**
- NPC interactions are plugin‑based (`InteractionPlugin` via `interactionRegistry`) and configured in `NpcSlotEditor` and hotspot definitions.
- Designers currently tweak low‑level config fields (numbers, flags) for each slot/hotspot.
- We want higher‑level “interaction presets” that bundle plugin config into reusable, named configurations.

Below are 10 phases for evolving the interaction preset system.

> **For agents:** When you add new preset features or change how presets are stored, update the checklist below with a brief note (files/PR/date) so others can see what’s done.

### Phase Checklist

- [x] **Phase 1 – Basic Preset Type & Apply in NpcSlotEditor**
- [x] **Phase 2 – Preset Editor Component**
- [x] **Phase 3 – Hotspot Editor Integration**
- [x] **Phase 4 – Per‑World Presets & Categorization**
- [x] **Phase 5 – Usage Summary (Dev‑Only)**
- [x] **Phase 6 – Cross‑World / Cross‑Project Preset Libraries** *(Completed 2025-11-19)*
- [x] **Phase 7 – Outcome‑Aware Presets & Success Metrics** *(Completed 2025-11-19)*
- [ ] **Phase 8 – Context‑Aware Preset Suggestions**
- [ ] **Phase 9 – Preset Conflict & Compatibility Checks**
- [ ] **Phase 10 – Preset Playlists & Sequenced Interactions**

---

### Phase 1 – Basic Preset Type & Apply in NpcSlotEditor

**Goal**  
Let designers define simple named presets and apply them to NPC slots in `NpcSlotEditor`, without any dedicated editor UI yet.

**Scope**
- Presets are defined as data structures in a TS module.
- `NpcSlotEditor` can apply a preset to a slot, populating interaction config.

**Key Steps**
1. Define `InteractionPreset` (now in the interaction preset helpers):
   ```ts
   export interface InteractionPreset {
     id: string;
     name: string;
     interactionId: string;
     config: Record<string, any>;
   }
   ```
2. Add helpers to load/save presets:
   - For v1, localStorage or a simple in‑memory list is fine.
3. In `NpcSlotEditor`:
   - Load available presets at component init.
   - Provide a dropdown listing presets (grouped by `interactionId`).
   - “Apply preset” sets:
     ```ts
     slot.interactions[preset.interactionId] = {
       enabled: true,
       ...preset.config,
     };
     ```
   - Allow further tweaking via existing `InteractionConfigForm`.

---

### Phase 2 – Preset Editor Component

**Goal**  
Provide a basic UI to create, edit, and delete presets, reusing existing interaction config forms.

**Scope**
- Editor works with the preset store.
- Enough to edit presets for the current world or globally; no complex scoping yet.

**Key Steps**
1. Implement `frontend/src/components/game/InteractionPresetEditor.tsx`:
   - Shows list of presets.
   - “New preset” flow:
     - Pick `interactionId` from `interactionRegistry`.
     - Use `InteractionConfigForm` to edit `config`.
     - Enter `name` and `id` (or auto‑generate id from name).
   - “Edit” and “Delete” actions for existing presets.
2. Wire the editor:
   - E.g. as a panel on `GameWorld` route or a dev/settings route.
3. Ensure saving presets updates the store used by `NpcSlotEditor` (shared store or re‑fetch).

---

### Phase 3 – Hotspot Editor Integration

**Goal**  
Let designers apply the same presets when configuring interactions on hotspots, for consistency with NPC slots.

**Scope**
- Reuse preset data and UI patterns.
- Only show presets relevant to the current interaction type.

**Key Steps**
1. Identify hotspot editing components (e.g. 2D location editor / `HotspotEditor`).
2. For each interaction that uses the plugin system:
   - Load presets.
   - Filter presets whose `interactionId` matches the hotspot’s plugin.
   - Provide an “Apply preset” action to populate config.
3. Keep UI minimal; focus on reuse of presets.

---

### Phase 4 – Per‑World Presets & Categorization

**Goal**  
Support both global presets and per‑world presets, with simple categories/tags to help organize them.

**Scope**
- Extend `InteractionPreset` with categorization fields.
- Separate sets for global defaults vs world overrides.

**Key Steps**
1. Extend type with optional `category` and `tags`.
2. Update the preset store to support:
   - Global presets (localStorage key).
   - World‑specific presets (e.g. `GameWorld.meta.interactionPresets`).
3. In editors:
   - Show combined list (global + world) with scope badges.
   - Optionally allow “promote to global” or “copy to world” actions.

---

### Phase 5 – Usage Summary (Dev‑Only)

**Goal**  
Give designers a rough sense of which presets are actually used during playtests, without building a full analytics system.

**Scope**
- Dev‑only counters like “preset used N times”.
- A simple dev panel to view counts.

**Key Steps**
1. When applying a preset to a slot/hotspot, attach its `presetId` in metadata on the interaction config (e.g. `config.__presetId`).
2. In the interaction executor, when an interaction runs:
   - If `config.__presetId` exists, increment a counter for that preset ID (localStorage or in‑memory).
3. Add `InteractionPresetUsagePanel` that:
   - Lists presets with usage counts.
   - Is reachable via a dev route or flag only.

---

### Phase 6 – Cross‑World / Cross‑Project Preset Libraries ✅

**Goal**
Allow teams to share interaction presets across worlds and projects via import/export and simple library management.

**Scope**
- Keep existing global/per‑world separation; add library import/export.

**Key Steps**
1. Define a stable JSON format for `InteractionPreset` collections (with optional scope metadata).
2. Add helpers to export selected presets to a `.json` file and import them into another project.
3. Extend `InteractionPresetEditor` with "Export" / "Import" controls and basic validation.
4. Document how to handle ID collisions (rename or generate new IDs).

**Implementation Notes** *(Completed 2025-11-19)*

**Files Modified:**
- `frontend/src/lib/game/interactions/presets.ts` - Added Phase 6 export/import functions
- `frontend/src/components/game/InteractionPresetEditor.tsx` - Added import/export UI

**Features Implemented:**

1. **Library Format** (`PresetLibrary` type):
   - Version field for compatibility checking (currently v1.0)
   - Metadata: exportDate, description, source, author
   - Preset array

2. **Export Functions**:
   - `exportPresetsToLibrary()` - Creates library object with metadata
   - `downloadPresetsAsJSON()` - Downloads presets as JSON file
   - Export All button (respects scope filter: all/global/world)
   - Export Selected button for single preset export
   - Automatic filename generation with timestamp

3. **Import Functions**:
   - `validatePresetLibrary()` - Validates library format and version compatibility
   - `parsePresetLibrary()` - Parses JSON string to library object
   - `importPresetsFromFile()` - Imports from File object
   - `importPresetsFromLibrary()` - Core import with conflict resolution

4. **Conflict Resolution** (`ConflictResolution` type):
   - **Skip**: Don't import presets with duplicate IDs
   - **Rename**: Auto-generate new IDs for conflicts
   - **Overwrite**: Replace existing presets (use with caution)

5. **Import UI Features**:
   - Import dialog with options
   - Target selection (global or world)
   - Conflict resolution strategy picker
   - Detailed import results (imported count, renamed count, skipped count)
   - Error handling and success messages

6. **ID Collision Handling**:
   - Uses existing `generatePresetId()` function to create unique IDs
   - Maintains original preset name when renaming
   - Tracks renamed presets in import results
   - Prevents accidental overwrites with clear warnings

**Usage:**
- Designers can export presets from one world and import to another
- Teams can share preset libraries across projects via JSON files
- Global presets can be distributed as starter templates
- Supports partial imports (select specific conflict resolution strategy)

---

### Phase 7 – Outcome‑Aware Presets & Success Metrics ✅

**Goal**
Give designers a sense of how different presets perform (e.g. success/fail rates) without heavy analytics.

**Scope**
- Light, dev‑only metrics tied to interaction outcomes (success/failure/neutral).

**Key Steps**
1. Define a small outcome schema for interactions that can be attached to preset executions.
2. Extend the interaction executor to record outcome counts per `presetId` alongside usage counts.
3. Enhance `InteractionPresetUsagePanel` to show both usage counts and outcome ratios (e.g. success %).
4. Provide filters to find underperforming or overused presets.

**Implementation Notes** *(Completed 2025-11-19)*

**Files Modified:**
- `frontend/src/lib/game/interactions/presets.ts` - Added outcome tracking types and functions
- `frontend/src/lib/game/interactions/executor.ts` - Added outcome recording
- `frontend/src/components/game/InteractionPresetUsagePanel.tsx` - Enhanced UI with outcome metrics

**Features Implemented:**

1. **Outcome Schema** (`InteractionOutcome` type):
   - `success`: Interaction completed successfully
   - `failure`: Interaction failed or threw an error
   - `neutral`: Interaction completed but with neither success nor failure

2. **Outcome Tracking**:
   - Extended `PresetUsageStats` interface with `outcomes` field
   - New `trackPresetOutcome()` function to record outcomes
   - Automatic outcome detection in interaction executor
   - Backward compatible with existing usage stats (auto-initializes outcomes)

3. **Executor Integration**:
   - Tracks outcome based on `InteractionResult.success` field
   - Handles exceptions as failures
   - Only tracks outcomes for preset-based interactions (checks `__presetId`)

4. **Enhanced Statistics**:
   - `getPresetUsageStatsWithDetails()` now includes:
     - `outcomes`: Success/failure/neutral counts
     - `successRate`: Percentage (null if no outcomes)
     - `totalOutcomes`: Total outcome count
   - Success rate calculation: `(success / total) * 100`

5. **Usage Panel Enhancements**:
   - **Dashboard Metrics**:
     - Average success rate across all presets
     - Total outcomes count
   - **Filtering** (Phase 7 requirement):
     - All Presets (default)
     - Underperforming (< 40% success rate, min 3 outcomes)
     - Overused (> 1.5x average usage)
   - **Sorting Options**:
     - Usage Count (default)
     - Success Rate
     - Last Used
   - **Table Columns**:
     - Success Rate badge (color-coded: green ≥70%, yellow ≥40%, red <40%)
     - Outcomes breakdown (S/F/N with visual symbols)
   - **Visual Indicators**:
     - Green ✓ for successes
     - Red ✗ for failures
     - Blue ● for neutral outcomes

**Usage:**
- Designers can now identify presets that need balancing
- Underperforming filter helps find problematic configurations
- Success rates inform preset design decisions
- Outcome data persists in localStorage alongside usage counts

---

### Phase 8 – Context‑Aware Preset Suggestions

**Goal**  
Suggest relevant presets based on world context, NPC roles, or past usage, reducing decision load for designers.

**Scope**
- Heuristic, local suggestions; no external model required.

**Key Steps**
1. Add metadata to presets (recommended NPC roles, world tags, situation tags like “intro”, “intense”).
2. In `NpcSlotEditor` / hotspot editors, sort or highlight presets based on:
   - NPC role or tags.
   - Location/world tags.
   - Recent usage in the current world.
3. Optionally add a “Recommended” section at the top of preset lists.

---

### Phase 9 – Preset Conflict & Compatibility Checks

**Goal**  
Detect when multiple presets applied to the same slot/hotspot might conflict (e.g. contradictory flags or timing).

**Scope**
- Static analysis of preset configs for obvious conflicts.

**Key Steps**
1. Define a small set of conflict rules (e.g. two presets both enabling mutually exclusive modes).
2. Add a validation helper that inspects active presets for a slot/hotspot and returns warnings.
3. Surface warnings in editors (inline badges or a summary panel).
4. Provide suggestions where possible (e.g. “remove X” / “adjust Y”).

---

### Phase 10 – Preset Playlists & Sequenced Interactions

**Goal**  
Allow designers to define small sequences of presets (playlists) that run over time or in response to state changes.

**Scope**
- Build on existing presets; do not replace them.

**Key Steps**
1. Define a `PresetPlaylist` type that orders multiple `InteractionPreset` IDs with optional conditions/delays.
2. Extend editors to let designers build and assign playlists to NPC slots or hotspots.
3. Add execution logic to step through playlists while respecting existing interaction rules.
4. Ensure playlists degrade gracefully when some presets are missing or disabled.

