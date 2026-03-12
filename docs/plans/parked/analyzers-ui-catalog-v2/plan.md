# Analyzer UI Catalog v2: Analysis-Point-Driven Architecture

## Current Pain Points

1. **Dual state model**: The settings store carries both scalar (`defaultImageAnalyzer`) and list
   (`defaultImageAnalyzers`) fields for the same concept. Every setter must keep both in sync
   manually via `withPrimaryAnalyzer()`, which is fragile and duplicative.

2. **Intent overrides are flat**: `intentAssetAnalyzers` (scalar) and `intentAssetAnalyzerChains`
   (list) co-exist, with getters manually preferring the chain and falling back to the scalar.
   This is a historical artifact of migrating from single-select to multi-select.

3. **Analysis-point chains live in component state**: `analysisPointChains` in `AnalyzersSettings`
   is React `useState`, not part of the Zustand store. This means other features that need to
   resolve the effective analyzer for a custom analysis point cannot access it without prop drilling
   or duplicating the preference-fetch logic.

4. **Resolution logic is duplicated**: The "effective analyzer" cascade (point override -> intent
   override -> media default -> fallback) is computed inline in `analysisPointSelections` useMemo
   inside `AnalyzersSettings.tsx`. Consumers elsewhere must re-derive it.

5. **No ordered multi-select UI per analysis point**: The AnalyzerChainEditor works well for
   control-level chains (prompt default, image default), but custom per-point overrides are
   a secondary "optional" section buried below the control editor. Users cannot directly
   drag-order analyzers per point in a unified view.

6. **Catalog is read-only for routing**: `AnalyzerCatalog` shows which points use an analyzer
   but cannot change the mapping from the catalog side. All editing must go through the
   `AnalysisRoutingCatalog`.

## Architecture Options

### Option A: Unified Zustand Store with Analysis-Point-First State

**Approach**: Merge all analyzer preference state into a single Zustand store keyed by
analysis-point ID. Each point maps to an ordered `string[]` of analyzer IDs. The existing
control-level defaults (prompt, image, video) become "virtual" analysis points with well-known
IDs. Intent overrides map to their analysis-point IDs.

**State shape**:
```typescript
interface AnalyzerSettingsStateV2 {
  version: 2;
  // Primary data: analysis-point -> ordered analyzer IDs
  pointAnalyzerChains: Record<string, string[]>;
  // Similarity threshold (non-analyzer setting, kept alongside)
  visualSimilarityThreshold: number;
}
```

Well-known point IDs: `_control:prompt_default`, `_control:image_default`,
`_control:video_default`, `_intent:character_ingest_face`, etc.

**Pros**:
- Single source of truth. No scalar/chain duality.
- Any feature can read `pointAnalyzerChains[pointId]` directly.
- Resolution logic is a pure function over the store: `resolve(pointId, store) -> string[]`.
- Clean migration: on load, upgrade v1 shape to v2 by mapping old keys to well-known point IDs.

**Cons**:
- Breaking change to store shape requires migration code.
- All existing consumers of `getDefaultAssetAnalyzer()` etc. must be updated or given compat shims.
- Well-known point IDs are a new convention that must be documented.

**Migration cost**: Medium. ~15 call sites for the old getters. Compat shims keep them working.
**Risk**: Low if compat shims are retained during transition.

---

### Option B: Layered Store — Keep Existing Store, Add Analysis-Point Layer

**Approach**: Keep `useAnalyzerSettingsStore` as-is for backward compatibility. Add a new
`useAnalysisPointStore` that owns only `pointAnalyzerChains: Record<string, string[]>`. The
resolution function combines both stores: point store overrides -> existing store defaults.

**State shape**: Two stores, existing + new.

**Pros**:
- Zero changes to existing store consumers.
- Incremental adoption: new UI uses new store, old code keeps working.

**Cons**:
- Two stores to keep in sync when saving preferences.
- Resolution must merge two sources, adding complexity.
- The "dual scalar/chain" problem in the old store remains unfixed.
- Harder to reason about which store is authoritative.

**Migration cost**: Low (additive only).
**Risk**: Medium — dual-store divergence bugs.

---

### Option C: In-Place Store Evolution with Compat Accessors

**Approach**: Evolve `useAnalyzerSettingsStore` to add `pointAnalyzerChains` alongside existing
fields. Add a `version` field. On hydration, if version < 2, auto-upgrade by populating
`pointAnalyzerChains` from the legacy fields. Keep all existing getters working by reading from
`pointAnalyzerChains` internally but exposing the same API. Deprecate the old setters.

**State shape**:
```typescript
interface AnalyzerSettingsState {
  // ── v2 primary data ──
  _version: number;
  pointAnalyzerChains: Record<string, string[]>;

  // ── v1 compat (derived from pointAnalyzerChains on write, readable for compat) ──
  defaultImageAnalyzer: string;        // = pointAnalyzerChains['_control:image_default'][0]
  defaultVideoAnalyzer: string;        // = pointAnalyzerChains['_control:video_default'][0]
  defaultImageAnalyzers: string[];     // = pointAnalyzerChains['_control:image_default']
  defaultVideoAnalyzers: string[];     // = pointAnalyzerChains['_control:video_default']
  intentAssetAnalyzers: ...;           // derived
  intentAssetAnalyzerChains: ...;      // derived

  // ── v2 setters ──
  setPointAnalyzerChain(pointId: string, chain: string[]): void;
  clearPointAnalyzerChain(pointId: string): void;
  getEffectiveChain(pointId: string): string[];

  // ── v1 compat setters (delegate to v2 internally) ──
  setDefaultImageAnalyzer(value: string): void;  // writes to pointAnalyzerChains
  ...
}
```

**Pros**:
- Single store, single source of truth.
- Zero breaking changes: all existing getters/setters keep working.
- Auto-upgrade on first load; no manual migration step for users.
- New UI and new features use the clean v2 API.
- Old compat layer can be removed in a future major version.

**Cons**:
- Store interface is larger (carries both v1 and v2 API).
- Compat shim code adds ~40 lines to the store.

**Migration cost**: Low-to-medium. Store changes are internal; callers unchanged.
**Risk**: Low. Compat layer is straightforward and testable.

---

## Recommendation: Option C — In-Place Store Evolution

**Rationale**:
- Best balance of clean architecture and zero-regression risk.
- Single store avoids the dual-store sync problem of Option B.
- Compat accessors mean no blast radius to the ~15 existing consumers.
- Auto-upgrade path means existing localStorage data "just works".
- The compat layer is thin, well-tested, and can be removed later.

## Implementation Plan

### Phase 1: Store Evolution (this PR)
1. Add `_version` and `pointAnalyzerChains` to store.
2. Add `migrate()` function in persist config to auto-upgrade v1 -> v2.
3. Rewrite v1 getters to read from `pointAnalyzerChains`.
4. Rewrite v1 setters to write to `pointAnalyzerChains`, then derive v1 fields.
5. Add v2 API: `setPointAnalyzerChain`, `clearPointAnalyzerChain`, `getEffectiveChain`.

### Phase 2: UI Refactor (this PR)
1. Refactor `AnalysisRoutingCatalog` to use v2 store API directly.
2. Add multi-select ordered list per analysis point with drag reorder.
3. Show "effective resolved chain" preview that traces the cascade.
4. Move `analysisPointChains` from component state to store.

### Phase 3: Tests (this PR)
1. Store migration: v1 localStorage -> v2 shape.
2. Compat getters: ensure all v1 accessors return correct values from v2 data.
3. Resolution cascade: point override > intent override > media default > fallback.
4. UI: selection, reorder, persistence round-trip.

### Phase 4: Cleanup (follow-up)
1. Deprecation warnings on v1 setters in dev mode.
2. Audit and migrate remaining consumers to v2 API.
3. Remove v1 compat layer once all consumers migrated.

## Well-Known Point IDs

| Point ID | Maps to (v1) | Control |
|---|---|---|
| `_control:prompt_default` | `promptDefaultChain` | prompt_default |
| `_control:image_default` | `imageDefaultChain` | image_default |
| `_control:video_default` | `videoDefaultChain` | video_default |
| `_intent:character_ingest_face` | `intentAssetAnalyzerChains.character_ingest_face` | intent_override |
| `_intent:character_ingest_sheet` | `intentAssetAnalyzerChains.character_ingest_sheet` | intent_override |
| `_intent:scene_prep_location` | `intentAssetAnalyzerChains.scene_prep_location` | intent_override |
| `_intent:scene_prep_style` | `intentAssetAnalyzerChains.scene_prep_style` | intent_override |

Custom analysis points use their backend-assigned ID directly (e.g., `user:detection-face`).

## Preference Payload Compatibility

The backend `AnalyzerPreferences` shape is **unchanged**:
```python
prompt_default_ids: list[str]
asset_default_image_ids: list[str]
asset_default_video_ids: list[str]
asset_intent_default_ids: dict[str, list[str]]
analysis_point_default_ids: dict[str, list[str]]
```

The frontend store serializes `pointAnalyzerChains` back to this shape when persisting to the
backend. The well-known point IDs are stripped and mapped to the correct preference keys.
No backend schema changes are needed.

## Changelog

### v2 Store (this PR)

**New preference shape** — `pointAnalyzerChains: Record<string, string[]>`

All analyzer routing is now keyed by analysis-point ID. Well-known IDs use
`_control:` and `_intent:` prefixes. Custom analysis points use their backend ID.

**Migration**: Automatic. On first load after upgrade, the v1 localStorage shape
is migrated to v2 by the `zustand/persist` `migrate` option. No user action needed.

**New v2 API**:
- `setPointAnalyzerChain(pointId, chain)` — set ordered analyzer list for any point
- `clearPointAnalyzerChain(pointId)` — remove a point's chain
- `getPointAnalyzerChain(pointId)` — read a specific point's chain
- `getEffectiveChain(pointId)` — resolve with cascade fallback

**Compat**: All v1 getters/setters (`setDefaultImageAnalyzer`, `getDefaultAssetAnalyzers`,
`setIntentAssetAnalyzerChain`, etc.) continue to work and delegate to the v2 data internally.

**Backend**: No schema changes. The frontend maps `pointAnalyzerChains` back to the
existing `AnalyzerPreferences` payload shape when persisting.

**Analysis-point chains** are now stored in the Zustand store instead of React component
state, making them accessible to any feature without prop drilling.

## Follow-up Steps

- [ ] Add drag-and-drop reorder to AnalyzerChainEditor (Phase 2 enhancement)
- [ ] Deprecate v1 setters with console.warn in dev mode
- [ ] Migrate all consumers to v2 API (grep for v1 setter names)
- [ ] Remove v1 compat layer after migration complete
- [ ] Consider adding analysis-point CRUD from the catalog view
