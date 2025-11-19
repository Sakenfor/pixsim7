**Task: World HUD / Dashboard Layout Designer (Multi‑Phase)**

**Context**
- Game2D already uses `WorldToolPlugin` + `WorldToolsPanel` to show tools (Relationships, Quest Log, Inventory, World Info, Mood Debug, etc.).
- Initial placement lived as a single “cluster” controlled in `Game2D.tsx`.
- Designers should be able to shape the HUD (which tools, where, and how many) **per‑world** without touching code.

Below are 10 phases for evolving the HUD system over time.

> **For agents:** When you complete or extend a phase, update the checklist and add a short note (files/PR/date). Treat phases 1–5 as “shipped v1”; phases 6–10 are forward‑looking.

### Phase Checklist

- [x] **Phase 1 – Minimal Per‑World HUD Config**
- [x] **Phase 2 – Regions & Basic Layout**
- [x] **Phase 3 – HUD Layout Editor**
- [x] **Phase 4 – Visibility Conditions (View Mode / Capability / Flags)**
- [x] **Phase 5 – Local HUD Presets**
- [x] **Phase 6 – Player Profiles & View‑Mode‑Specific Layouts** *(Completed 2025-11-19)*
- [x] **Phase 7 – Shared / Server‑Backed HUD Presets** *(Completed 2025-11-19)*
- [ ] **Phase 8 – HUD Usage Analytics**
- [ ] **Phase 9 – Layout Validation & Recommendations**
- [ ] **Phase 10 – Responsive / Device‑Aware HUD Layouts**

---

### Phase 1 – Minimal Per‑World HUD Config

**Goal**  
Introduce a per‑world HUD config that controls which tools are visible, without changing the overall layout.

**Scope**
- Add HUD config under `GameWorld.meta`.
- Filter `worldToolRegistry.getVisible(context)` based on this config.

**Key Steps**
1. Define HUD config types (now in `WorldUiConfig` in `@pixsim7/types`).
2. Add helpers in `@pixsim7/game-core/world/worldUiConfig.ts` to read/write `WorldUiConfig` from `GameWorldDetail.meta`.
3. In Game2D, after building `WorldToolContext`, compute `enabledToolIds` from config and filter `worldToolRegistry.getVisible(context)` before passing tools to the HUD layout.
4. Preserve default behavior when no HUD config is present (all tools enabled).

---

### Phase 2 – Regions & Basic Layout

**Goal**  
Allow placing tools into coarse regions (top/left/right/bottom/overlay) while keeping implementation simple.

**Scope**
- Extend HUD config with region + order.
- Introduce a layout helper and regional HUD component.

**Key Steps**
1. Define `HudRegion` and `HudToolPlacement` (see `frontend/src/lib/worldTools/types.ts`).
2. Add helpers that, given:
   - `visibleTools` from `worldToolRegistry.getVisible(context)`,
   - `hudPlacements` from config,
   return tools grouped and sorted by region.
3. Implement `RegionalHudLayout` to render separate `WorldToolsPanel` instances (or wrappers) for each region.
4. Fall back to the legacy “single cluster” when no placement info exists.

---

### Phase 3 – HUD Layout Editor

**Goal**  
Provide an in‑app editor so designers can choose which tools appear and in which region, per world.

**Scope**
- Editor manipulates `HudToolPlacement` data and persists to world meta.

**Key Steps**
1. Implement `frontend/src/components/game/HudLayoutEditor.tsx`:
   - Props: `worldDetail`, `onSave`, `onClose`.
   - Reads HUD configuration from `worldDetail.meta`.
   - Lists `worldToolRegistry.getAll()` as available tools.
   - Lets designers:
     - Choose region (`top/bottom/left/right/overlay/hidden`).
     - Set order (`order` field).
2. Wire the editor into Game2D HUD customization (e.g. HUD customization button/panel).
3. Confirm worlds without HUD data continue to work with sensible defaults.

---

### Phase 4 – Visibility Conditions (View Mode / Capability / Flags)

**Goal**  
Allow simple conditions on HUD placements based on view mode, capabilities, time, flags, etc., without building a full rule engine.

**Scope**
- Optional visibility conditions on placements.
- Small evaluation helper.

**Key Steps**
1. Extend `HudToolPlacement` with a `visibleWhen` object (already present) that can represent:
   - View‑mode gating.
   - Capability presence.
   - Session flags, location, time slots, quest states, relationships.
2. Add a helper that filters placements by:
   - Current `viewMode` (`WorldUiConfig.viewMode`).
   - Current capabilities (from the capability registry).
   - Current world/session state (flags, time, location).
3. Extend `HudLayoutEditor` so designers can choose a `visibleWhen.kind` and configure basic parameters (e.g. flag id, capability id).

---

### Phase 5 – Local HUD Presets

**Goal**  
Make it easy to reuse HUD layouts across worlds by introducing presets stored on the frontend.

**Scope**
- Presets are named collections of `HudToolPlacement`.
- Stored in localStorage; no backend requirement for v1.

**Key Steps**
1. Define `HudLayoutPreset` and a small preset store (see `frontend/src/lib/worldTools/hudPresets.ts`).
2. Extend `HudLayoutEditor` to:
   - “Save current layout as preset” (name + optional description).
   - “Apply preset” to overwrite the world’s HUD placements.
3. Keep everything opt‑in and local; avoid backend changes in this phase.

---

### Phase 6 – Player Profiles & View‑Mode‑Specific Layouts

**Goal**
Allow different HUD layouts per player profile and/or view mode (e.g. cinematic vs hud‑heavy) using existing placements and presets.

**Scope**
- Layer "profile" on top of `WorldUiConfig` + presets.

**Key Steps**
1. Introduce a notion of HUD profile (e.g. `profileId`) stored in user preferences or session flags.
2. Extend HUD resolution to consider `(worldId, viewMode, profileId)` when selecting placements/presets.
3. In `HudLayoutEditor`, add a profile selector and allow editing layout per profile.
4. Provide a small toggle in Game2D to switch profiles and verify layout changes.

**Implementation Notes** *(Completed 2025-11-19)*
- **Files Added:**
  - `frontend/src/lib/worldTools/hudProfiles.ts` - Profile management with built-in profiles (default, minimal, streamer, debug)
  - `frontend/src/components/game/HudProfileSwitcher.tsx` - UI components for switching profiles
- **Files Modified:**
  - `frontend/src/lib/worldTools/types.ts` - Added `HudProfile` interface and `profileLayouts` to `WorldUiConfig`, added `activeProfileId` to `PlayerHudPreferences`
  - `frontend/src/lib/worldTools/hudLayout.ts` - Extended `getHudConfig()` and `buildHudLayout()` to resolve profile-specific layouts
  - `frontend/src/components/game/HudLayoutEditor.tsx` - Added profile and view mode selectors, updated save logic
  - `frontend/src/routes/Game2D.tsx` - Integrated `HudProfileSwitcherButton`
- **Features:**
  - 4 built-in profiles: Default, Minimal, Streamer, Debug
  - Profile layouts stored per world in `GameWorld.meta.ui.profileLayouts` with key format `"profileId:viewMode"` or `"profileId"`
  - Active profile stored in player preferences (localStorage)
  - Editor allows editing layouts for specific profile + view mode combinations
  - In-game profile switcher button for quick switching
  - Automatic layout resolution based on active profile and current view mode

---

### Phase 7 – Shared / Server‑Backed HUD Presets

**Goal**  
Allow teams to share HUD presets across machines by syncing them to backend or `GameWorld.meta`, instead of only localStorage.

**Scope**
- Keep local presets; add optional world/global shared presets.

**Key Steps**
1. Define a serializable HUD preset shape suitable for `GameWorld.meta` or a dedicated endpoint.
2. Add helpers to merge local presets with world‑scoped presets.
3. Extend `HudLayoutEditor`:
   - Mark presets as local vs shared.
   - Provide actions like "publish to world" / "copy from world".
4. If needed, define a minimal backend API for global presets under a `game_hud` namespace.

**Implementation Notes** *(Completed 2025-11-19)*
- **Files Modified:**
  - `frontend/src/lib/worldTools/hudPresets.ts` - Added `PresetScope` type and world preset utilities (`getWorldPresets`, `getAllPresets`, `publishPresetToWorld`, `copyWorldPresetToLocal`, `deleteWorldPreset`, `isWorldPreset`)
  - `frontend/src/lib/worldTools/types.ts` - Added `scope` and `worldId` fields to `HudLayoutPreset`, added `worldPresets` array to `WorldUiConfig`
  - `frontend/src/components/game/HudLayoutEditor.tsx` - Updated to show preset scope with visual distinction, added "Publish" button for local presets, added "Copy" button for world presets, updated all preset handlers to work with both local and world presets
- **Features:**
  - Local presets stored in localStorage (per-user)
  - World presets stored in `GameWorld.meta.ui.worldPresets` (shared across all users)
  - Visual distinction: Local presets show "💾 Local" badge, World presets show "🌍 World" badge with blue background
  - Publish local presets to world scope (makes them available to all users)
  - Copy world presets to local scope (creates editable local copy)
  - Delete works for both local and world presets (with appropriate permissions)
  - Presets are automatically merged: `getAllPresets()` returns local + world presets
  - Export/import only available for local presets (world presets managed via publish/copy)

**Note:** Global backend API (Phase 7 step 4) deferred for future implementation. Current implementation focuses on local + world-scoped presets which covers the main use case.

---

### Phase 8 – HUD Usage Analytics

**Goal**  
Help designers understand which HUD tools are actually used or opened during playtests, to inform layout decisions.

**Scope**
- Dev‑only usage metrics (local or lightweight backend aggregation).

**Key Steps**
1. Instrument world tool panels to record when they are opened/closed and how long they remain visible.
2. Store usage counts per `toolId` (and optionally per world) in localStorage or a dev‑only backend.
3. Add a “HUD Analytics” dev panel that:
   - Lists tools by usage frequency.
   - Shows distribution by region/view mode.
4. Optionally surface hints in `HudLayoutEditor` (e.g. low‑usage tools flagged subtly).

---

### Phase 9 – Layout Validation & Recommendations

**Goal**  
Automatically flag problematic HUD layouts (e.g. too many tools in one region) and suggest simple fixes.

**Scope**
- Static validation on placements and conditions.

**Key Steps**
1. Define validation rules (e.g. max tools per region, conflicting visibility conditions).
2. Add a validator that runs on the current layout and returns warnings + recommendations.
3. Show warnings inline in `HudLayoutEditor` (e.g. under the table or in a sidebar).
4. Provide “auto‑fix” options where safe (e.g. normalize order, move rarely used tools to overlay).

---

### Phase 10 – Responsive / Device‑Aware HUD Layouts

**Goal**  
Adapt HUD layouts for different display modes (desktop vs narrow/mobile) and resolutions without duplicating all placement data.

**Scope**
- Extend layout resolution to consider viewport size and device type.

**Key Steps**
1. Add optional responsive hints to placements (e.g. `hideOnNarrow`, `collapseToOverlay`).
2. Update `RegionalHudLayout` to read viewport metrics and apply responsive rules when rendering.
3. Ensure existing configs behave the same on desktop; treat responsive behavior as opt‑in.
4. Document responsive conventions in `docs/HUD_LAYOUT_PHASES_6-10_IMPLEMENTATION_GUIDE.md`.

