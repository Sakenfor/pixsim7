# Task 101 – HUD Editor Modularization & Gameplay UI Core Integration

## Status

**Prerequisites:** ✅ **READY**
- ✅ Task 99 (Editing Core) - Complete (`editing-core/` exists with all types)
- ✅ Task 100 (Gameplay UI Core) - Complete (commit 66c9b52, gameplay-ui-core implemented)
- ✅ All dependencies verified and available

**Current State:** ⚠️ **PARTIAL**
- ✅ `gameplay-ui-core` types fully implemented (HudWidgetConfig, HudSurfaceConfig)
- ✅ `editing-core` types fully implemented (UnifiedWidgetConfig, useUndoRedo)
- ⚠️ HudLayoutEditor has imports but doesn't use new types yet
- ❌ HudLayoutEditor still monolithic (1258 lines)

---

## Goal

Refactor `HudLayoutEditor` into smaller, focused components and hook it up cleanly to the `gameplay-ui-core` layer defined in Task 100, without changing user-visible behavior.

This builds on:
- Task 99 – Editing Core Data Binding Migration ✅ (Complete)
- Task 100 – Gameplay UI Core + HUD Editor Alignment ✅ (Complete - commit 66c9b52)

---

## Context

**Current state:**
- `apps/main/src/components/game/HudLayoutEditor.tsx` is a large, monolithic file (1258 lines) that:
  - Uses legacy `HudToolPlacement[]` type for internal state
  - Implements region assignment, visibility conditions, profiles, view modes, and undo/redo inline
  - Already imports gameplay-ui-core types but doesn't use them (imports added in commit 66c9b52)

**Task 100 introduced** (commit 66c9b52):
- ✅ `apps/main/src/lib/gameplay-ui-core/hudConfig.ts` (274 lines)
  - `HudWidgetConfig`, `HudSurfaceConfig` types
  - Bidirectional converters: `fromHudToolPlacements()` / `toHudToolPlacements()`
- ✅ `apps/main/src/lib/gameplay-ui-core/hudVisibility.ts` (292 lines)
  - `HudVisibilityCondition` with 8 condition kinds
  - `evaluateHudVisibility()` runtime evaluation
  - Helper builders for common conditions
- ✅ Mapping between HUD configs and `UnifiedSurfaceConfig`/`UnifiedWidgetConfig`

**Editing core provides** (from Task 99):
- ✅ `apps/main/src/lib/editing-core/unifiedConfig.ts` - Unified types
- ✅ `apps/main/src/lib/editing-core/hooks/useUndoRedo.ts` - Generic undo/redo
- ✅ `apps/main/src/lib/editing-core/dataBinding.ts` - Data binding system

**We want HUD to:**
- Use `gameplay-ui-core` types (`HudSurfaceConfig`) as its domain model
- Be broken into logical React components so features are easier to maintain and extend
- Use shared `useUndoRedo<HudSurfaceConfig>` from editing-core
- Maintain backwards compatibility during migration

---

## Deliverables

### 1. Extract HUD Editor into a subfolder

**Files:**
- `apps/main/src/components/game/HudLayoutEditor.tsx` (source)
- New folder: `apps/main/src/components/hud-editor/`

**Tasks:**
- Create `apps/main/src/components/hud-editor/` and move HUD editor implementation into:
  - `HudEditor.tsx` – orchestration/shell (router entry point, context wiring).
  - `RegionAssignment.tsx` – controls for assigning tools to regions and ordering them.
  - `VisibilityConditions.tsx` – UI for quest/location/time-based visibility rules.
  - `ProfileManager.tsx` – profile creation/selection/duplication.
  - `ViewModeConfig.tsx` – view mode toggles/settings.
- Keep exported API compatible:
  - `HudLayoutEditor` (where referenced) should now re-export or wrap `HudEditor` so existing routes/imports keep working.

**Acceptance criteria:**
- HUD editor code is physically split into multiple files with clear responsibilities.
- Existing imports (`HudLayoutEditor`) still compile and render the same UI.

---

### 2. Switch to gameplay-ui-core types in the new components

**Files:**
- `apps/main/src/components/hud-editor/*.tsx`
- `apps/main/src/lib/gameplay-ui-core/hudConfig.ts`
- `apps/main/src/lib/gameplay-ui-core/hudVisibility.ts`

**Tasks:**
- Replace ad-hoc HUD config/visibility types inside the UI components with:
  - `HudSurfaceConfig` / `HudWidgetConfig` from `hudConfig.ts`.
  - Advanced visibility types from `hudVisibility.ts`.
- Use mapping helpers from Task 100 to:
  - Load/save HUD configs as `HudSurfaceConfig`.
  - Optionally provide conversion to/from `UnifiedSurfaceConfig` when needed (e.g. for presets or inspection).

**Acceptance criteria:**
- HUD components type-check against `gameplay-ui-core` types.
- There are no duplicate or conflicting HUD config type definitions inside the components.

---

### 3. Centralize undo/redo and preset interactions

**Files:**
- `apps/main/src/components/hud-editor/HudEditor.tsx`
- `apps/main/src/lib/editing-core/hooks/useUndoRedo.ts`
- Preset-related files (if any) used by HUD

**Tasks:**
- Replace any HUD-local undo/redo stacks with the shared `useUndoRedo<T>` from `editing-core`.
  - The `T` should be `HudSurfaceConfig` or a small struct that includes it.
- If HUD has its own preset/profile persistence logic:
  - Normalize it to use a `PresetStore<HudSurfaceConfig>`-like abstraction (even if implemented inline for now), ready to be wired to the shared preset layer later.

**Acceptance criteria:**
- Undo/redo in HUD goes through `useUndoRedo`.
- Preset/profile save/load logic is centralized in `HudEditor.tsx` (or a small helper), not scattered across multiple components.

---

### 4. Keep behavior stable (no UX changes)

**Scope:**
- This task is about structure and type alignment, not redesign.

**Tasks:**
- Verify that after refactor:
  - HUD regions, ordering, and view modes behave as before.
  - Visibility conditions still apply as they did pre-refactor.
  - Profiles can still be created, switched, and deleted.
- If you adjust any labels/layout for ergonomics, call it out in a short comment in the PR/commit description.

**Acceptance criteria:**
- No intentional UX or behavior changes; only code organization and type usage are different.

---

## Out of Scope

- Adding new HUD features (new condition types, widgets, etc.).
- Wiring HUD to the core `DataBinding` system (that is part of Task 99 follow-ups).
- Changing how HUD configs are persisted beyond what's needed to wrap them in `HudSurfaceConfig`.
- Full migration to `HudSurfaceConfig` as internal state (can be done incrementally - start with export/import only).

---

## Testing & Validation

### Manual Testing Checklist

After refactor, verify that:
- ✅ HUD regions (top/bottom/left/right/overlay) still work correctly
- ✅ Tool ordering within regions is preserved
- ✅ Visibility conditions apply as before (quest/location/time-based)
- ✅ Profiles can be created, switched, duplicated, and deleted
- ✅ View modes (cinematic/hud-heavy/debug) still work
- ✅ Undo/redo works for all operations
- ✅ Preset save/load maintains all configuration
- ✅ Round-trip conversion works: HudToolPlacement[] → HudSurfaceConfig → HudToolPlacement[]

### Test Cases for Converters

**Critical:** Test bidirectional conversion:
```typescript
// Test 1: Legacy → Unified → Legacy (should be lossless)
const original: HudToolPlacement[] = [...current HUD state];
const surface = fromHudToolPlacements(original, { profileId: 'test' });
const converted = toHudToolPlacements(surface);
// Assert: converted deeply equals original

// Test 2: Visibility conditions are preserved
const toolWithVisibility: HudToolPlacement = {
  toolId: 'quest-tracker',
  region: 'right',
  visibleWhen: { kind: 'quest', id: 'main-quest-1' }
};
const widget = fromHudToolPlacement(toolWithVisibility);
const backToTool = toHudToolPlacement(widget);
// Assert: backToTool.visibleWhen matches original

// Test 3: Export/import via JSON
const exported = JSON.stringify(surface);
const imported: HudSurfaceConfig = JSON.parse(exported);
// Assert: imported matches surface
```

### Known Migration Risks

1. **State shape changes**: If switching internal state to `HudSurfaceConfig`, ensure all state updates are migrated
2. **Visibility condition mapping**: Ensure all 8 HudVisibilityCondition kinds map correctly
3. **Profile/view mode metadata**: Verify profileId, viewMode, worldId are preserved
4. **Undo/redo history**: If switching to `useUndoRedo`, existing undo stacks will be lost (document for users)

---

## Implementation Strategy (Recommended)

**Phase 1: Extract Components** (Low Risk)
1. Create `components/hud-editor/` folder
2. Extract UI components with minimal type changes
3. Keep using `HudToolPlacement[]` internally
4. Verify UI works identically

**Phase 2: Add Export/Import** (Medium Risk)
1. Add export function using `fromHudToolPlacements()`
2. Add import function using `toHudToolPlacements()`
3. Test round-trip conversion
4. Add JSON export/import buttons to UI

**Phase 3: Switch to useUndoRedo** (Medium Risk)
1. Replace custom undo/redo with `useUndoRedo<HudToolPlacement[]>`
2. Verify undo/redo behavior matches old implementation
3. Update undo/redo UI (if needed)

**Phase 4: Migrate Internal State** (High Risk - Optional)
1. Change state from `HudToolPlacement[]` to `HudSurfaceConfig`
2. Update all state mutations to work with new shape
3. Use converters only for legacy persistence layer
4. Full testing required

**Recommendation:** Start with Phases 1-3, defer Phase 4 to a future task.

---

## Notes / Tips

- Start by extracting components with minimal changes to props, then tighten types and replace inline types with `gameplay-ui-core` once the structure is stable.
- Keep `HudEditor.tsx` as thin as possible: it should coordinate state, undo/redo, and persistence, and delegate UI to the child components.
- Use `docs/EDITABLE_UI_ARCHITECTURE.md` as the reference for what belongs in `editing-core` vs `gameplay-ui-core` vs editor components.
- **Critical:** Test round-trip conversion (`HudToolPlacement[] → HudSurfaceConfig → HudToolPlacement[]`) to ensure no data loss.
- Use `gameplay-ui-core/hudVisibility.ts` helper builders (`HudVisibilityHelpers`) instead of manually constructing conditions.
- Document any deviations from the original behavior in commit messages.

---

## Success Criteria

Task is complete when:
- ✅ HudLayoutEditor code is split into 4+ focused components
- ✅ All components type-check against `gameplay-ui-core` types
- ✅ No duplicate HUD config type definitions in component files
- ✅ Undo/redo uses `useUndoRedo` from editing-core
- ✅ Manual testing checklist passes 100%
- ✅ Round-trip conversion test passes (no data loss)
- ✅ Existing HudLayoutEditor imports/routes still work
- ✅ User-facing behavior is identical (no regressions)
- ✅ Code is documented with inline comments explaining the architecture

---

## References

- **Architecture Doc:** `docs/EDITABLE_UI_ARCHITECTURE.md` (lines 472-663: Gameplay UI Core section)
- **Types:** `apps/main/src/lib/gameplay-ui-core/hudConfig.ts`
- **Visibility:** `apps/main/src/lib/gameplay-ui-core/hudVisibility.ts`
- **Undo/Redo:** `apps/main/src/lib/editing-core/hooks/useUndoRedo.ts`
- **Unified Types:** `apps/main/src/lib/editing-core/unifiedConfig.ts`
- **Current Editor:** `apps/main/src/components/game/HudLayoutEditor.tsx` (1258 lines)

