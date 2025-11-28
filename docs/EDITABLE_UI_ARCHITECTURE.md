# Editable UI Architecture Documentation

## Overview

This document analyzes the current implementation of editable player UI in the codebase, identifies architectural patterns, overlaps, and provides recommendations for improvement.

## Architecture Direction (Recommended)

### Single "Editable UI Core" with Multiple Specialized Editors

**Principle:** Keep `OverlayEditor` and `HudLayoutEditor` as separate UIs, but position them as **clients of a shared "Editable UI Core"** that owns:

- **Unified serializable config types** (pure JSON, no React)
- **Data binding system** (static / path / function)
- **Preset storage abstraction** (localStorage / IndexedDB / API)
- **Undo/redo and validation helpers**
- **Widget registry** (type → factory, icon, schema)

### Key Architectural Principles

#### 1. Serializable vs Runtime Config

**Critical distinction:**
- **Serializable config** = Pure JSON, no React, safe to persist in presets/game worlds/sessions
- **Runtime config** = Enriched with `render: () => ReactNode` and React-specific behavior

Current `OverlayConfiguration` in `apps/main/src/lib/overlay` is a **runtime shape** with render functions. We need a separate `SerializableOverlayConfig` / `UnifiedWidgetConfig` that is pure JSON.

#### 2. Unified Widget + Binding Model

- Central widget registry used by both editors
- Simple `DataBinding<T>` type instead of overloading `number | string | fn`
- Overlay's string property paths are just one variant of the binding model
- HUD can opt into the same binding system for game-state-driven data

#### 3. Positioning Modes as First-Class Axis

Keep both paradigms but unify them in the schema:
- `mode: 'anchor' | 'region' | 'absolute'`
- Overlay uses anchor, HUD uses region, both pass through `UnifiedWidgetConfig.position`

#### 4. Shared Preset + Storage Layer

- Single `PresetStore<T>` abstraction with pluggable backends
- Presets include `componentType` ('mediaCard' | 'hud') and `version` for migrations
- Both OverlayEditor's PresetManager and HUD's profiles converge on this interface

#### 5. Decision Table for New Work

| What You're Building | Which Editor | Must Use |
|---------------------|-------------|----------|
| Content / media surfaces (upload cards, video players) | Overlay Editor | Unified core config + binding |
| Game-state-driven HUD (health, quest tracker, inventory) | HUD Editor | Unified core config + binding |
| New third editor? | **STOP** | Must go through unified core, don't invent a third system |
| New widget type | Either (register in widget registry) | Central registry + factory |
| New data source | Either (add to data binding) | Shared data binding system |
| New preset storage backend | Either (implement PresetStore) | Shared PresetStore interface |

## Current Architecture

### Two Parallel Systems

The codebase currently has **two distinct but overlapping systems** for making UI editable:

#### 1. Generic Overlay Editor System
**Location:** `apps/main/src/components/overlay-editor/` + `apps/main/src/lib/overlay/`

**Purpose:** General-purpose widget positioning and configuration system

**Key Components:**
- `OverlayEditor.tsx` - Main orchestrator
- `WidgetList.tsx` - Widget management UI
- `PositionControls.tsx` - Anchor-based positioning (9-point grid)
- `VisibilityControls.tsx` - Show/hide triggers and transitions
- `StyleControls.tsx` - Size, opacity, z-index, CSS classes
- `WidgetPropertyEditor.tsx` - Combined property panel

**Data Model:**
```typescript
OverlayConfiguration {
  widgets: OverlayWidget[]
  metadata: ConfigMetadata
}

OverlayWidget {
  id: string
  type: string
  position: OverlayPosition  // anchor + offset
  visibility: VisibilityConfig  // triggers, transitions
  style: WidgetStyle  // size, opacity, z-index
  props: Record<string, any>  // widget-specific props
}
```

**Use Cases:** Media cards, video players, generic overlay widgets

---

#### 2. HUD Layout Editor System
**Location:** `apps/main/src/components/game/HudLayoutEditor.tsx`

**Purpose:** Game-specific HUD tool positioning and configuration

**Key Components:**
- `HudLayoutEditor.tsx` (1258 lines) - Monolithic editor
- Embedded controls for region assignment, sizing, visibility
- Advanced visibility conditions (quest/location/time-based)
- Undo/Redo system
- Profile-based layouts

**Data Model:**
```typescript
HudConfiguration {
  tools: HudTool[]
  profiles: HudProfile[]
  viewModes: ViewModeConfig[]
}

HudTool {
  id: string
  region: 'top' | 'bottom' | 'left' | 'right' | 'overlay'
  order: number
  size: 'compact' | 'normal' | 'expanded'
  zIndex?: number
  visibility: VisibilityCondition[]  // complex multi-constraint
}
```

**Use Cases:** Game HUD elements (health bars, inventory, quest trackers)

---

## Analysis: Overlaps and Gaps

### Overlapping Functionality

| Feature | Overlay Editor | HUD Editor | Notes |
|---------|---------------|------------|-------|
| **Positioning** | ✅ Anchor + offset | ✅ Region-based | Different paradigms |
| **Visibility Control** | ✅ Simple triggers | ✅ Complex conditions | HUD more advanced |
| **Size/Styling** | ✅ Full control | ✅ Size variants | Different granularity |
| **Z-Index** | ✅ Via StyleControls | ✅ Direct property | Same concept |
| **Preset System** | ✅ Via PresetManager | ✅ Profile-based | Parallel implementations |
| **Undo/Redo** | ❌ Missing | ✅ Implemented | Gap in Overlay |
| **Import/Export** | ✅ JSON-based | ⚠️ Unclear | Different formats? |

### Architectural Concerns

#### 1. **Duplication of Concepts**
- Both systems handle widget/tool positioning
- Both have their own preset/profile systems
- Both implement visibility control (different complexity levels)
- Styling controls are reimplemented

#### 2. **Monolithic vs Modular**
- **Overlay Editor:** Well-modularized with separate control components
- **HUD Editor:** 1258-line monolith with embedded logic
- Difficult to share improvements between systems

#### 3. **Inconsistent Data Models**
- `OverlayPosition` uses anchors, `HudTool` uses regions
- Different visibility configuration schemas
- Cannot easily convert between formats

#### 4. **Missing Cross-Cutting Concerns**
- No shared undo/redo system
- No unified preset storage layer
- Collision detection only in Overlay system
- Data binding only in Overlay system

---

## Recommendations

### Short-Term (Quick Wins)

#### 1. Extract Shared UI Controls
**Priority: HIGH**

Create reusable control components that both editors can use:

```
apps/main/src/components/ui-controls/
  ├── PositionControl.tsx       // Unified positioning (anchor OR region)
  ├── VisibilityControl.tsx     // Tiered complexity (simple + advanced)
  ├── StyleControl.tsx          // Size, opacity, z-index
  └── PresetControl.tsx         // Preset save/load/import/export
```

**Benefits:**
- Consistent UX across editors
- Shared bug fixes
- Reduced code duplication (~30% reduction)

#### 2. Add Undo/Redo to Overlay Editor
**Priority: MEDIUM**

Extract undo/redo from HudLayoutEditor into shared utility:

```typescript
// apps/main/src/lib/editing/useUndoRedo.ts
export function useUndoRedo<T>(initialState: T) {
  // Generic undo/redo hook
}
```

Reference: `HudLayoutEditor.tsx:102-104, 365-384, 765-788`

#### 3. Document Decision Matrix
**Priority: HIGH**

Create clear guidance on when to use each system:

| Scenario | Use System | Reason |
|----------|-----------|--------|
| Game HUD elements | HUD Editor | Game-specific features |
| Media overlays | Overlay Editor | Generic positioning |
| New feature? | ??? | **Currently unclear** |

---

### Medium-Term (Architectural Improvements)

#### 1. Unified Configuration Schema (Serializable + Runtime)
**Priority: HIGH**

Introduce a clear separation between:
- **Serializable config** – pure JSON, no React, safe to persist and share
- **Runtime config** – enriched with render functions and React-specific behavior

```typescript
// apps/main/src/lib/editing-core/unifiedConfig.ts

// Serializable widget config shared by Overlay + HUD + future editors
export interface UnifiedWidgetConfig {
  id: string;
  type: string;           // 'badge', 'button', 'hud-tool', etc.
  componentType: string;  // 'mediaCard', 'hud', 'videoPlayer', ...

  position: {
    mode: 'anchor' | 'region' | 'absolute';
    anchor?: OverlayAnchor;    // overlay-style (topLeft, center, etc.)
    region?: HudRegion;        // hud-style (top, bottom, left, right)
    offset?: { x: number; y: number };
    order?: number;            // for region stacking
  };

  visibility: {
    simple?: SimpleTrigger;          // always, hover, focus
    advanced?: AdvancedCondition[];  // quest, time, location, etc.
  };

  style?: WidgetStyleLike; // size, opacity, zIndex, classes (no React)
  props?: Record<string, unknown>;
  bindings?: DataBindingConfig[];
  version: number;
}

// Runtime config for React renderers (OverlayConfiguration, HudConfiguration, etc.)
export interface RuntimeWidget extends UnifiedWidgetConfig {
  // enriched at runtime, e.g.:
  render: (data: any, ctx: WidgetContext) => React.ReactNode;
  onClick?: (data: any) => void;
}
```

**Benefits:**
- Overlay, HUD, and future editors all speak the same serializable schema
- Presets, import/export, and migrations operate on `UnifiedWidgetConfig`
- Runtime systems remain free to add React-specific behavior without polluting saved data
- Type-safe conversion between serializable and runtime forms

#### 2. Data Binding Model (Static / Path / Function)
**Priority: HIGH**

Align all editable UIs on a shared data binding abstraction instead of ad-hoc `string | function` fields.

```typescript
// apps/main/src/lib/editing-core/dataBinding.ts

export type DataBindingKind = 'static' | 'path' | 'fn';

export interface DataBinding<T = unknown> {
  kind: DataBindingKind;
  target: string;      // e.g. 'value', 'label', 'icon'
  path?: string;       // for kind === 'path' ("uploadProgress", "hud.health")
  staticValue?: T;     // for kind === 'static'
  fn?: (data: any) => T; // for kind === 'fn' (developer-only)
}
```

**How it unifies current systems:**
- Overlay's string property paths (`"uploadProgress"`, `"remoteUrl"`) → `kind: 'path'`
- HUD's game-state-driven bindings (quest flags, location, time-of-day) → `kind: 'path'` with richer sources
- Static values (hardcoded text, numbers) → `kind: 'static'`
- Developer-provided functions → `kind: 'fn'`

**Benefits:**
- Both editors render the same binding UI primitives
- Easy to extend with new binding kinds (computed, derived, etc.)
- Serializable (except `fn` kind, which requires developer code)
- Type-safe resolution at runtime

**Migration path:**
- Current Overlay implementation in `apps/main/src/lib/dataBinding/` is feature-complete but Overlay-specific
- Extract core types and resolution logic to `editing-core/dataBinding.ts`
- Update Overlay to use the unified types
- Extend HUD to support the same binding model

#### 3. Refactor HUD Editor into Modular Components
**Priority: MEDIUM**

Break down the 1258-line monolith:

```
apps/main/src/components/hud-editor/
  ├── HudEditor.tsx              // Main orchestrator (< 200 lines)
  ├── RegionAssignment.tsx       // Region/order controls
  ├── VisibilityConditions.tsx   // Complex visibility UI
  ├── ProfileManager.tsx         // Profile switching
  └── ViewModeConfig.tsx         // View mode customization
```

**Benefits:**
- Easier testing
- Reusable components
- Clearer separation of concerns

#### 4. Shared Preset Storage Layer
**Priority: MEDIUM**

Unify preset management:

```typescript
// apps/main/src/lib/presets/PresetStore.ts

export interface PresetStore<T> {
  save(name: string, config: T): Promise<void>
  load(name: string): Promise<T>
  list(): Promise<string[]>
  delete(name: string): Promise<void>
  import(json: string): Promise<T>
  export(config: T): string
}

// Implementations for both systems
export class OverlayPresetStore implements PresetStore<OverlayConfiguration> {}
export class HudPresetStore implements PresetStore<HudConfiguration> {}
```

---

### Long-Term (Full Consolidation)

#### Option A: Merge into Single Unified Editor
**Complexity: HIGH | Impact: HIGH**

Combine both editors into one flexible system:

```
apps/main/src/components/unified-editor/
  ├── Editor.tsx                 // Main editor supporting both modes
  ├── PositioningMode.tsx        // Switch anchor/region modes
  ├── VisibilityTiers.tsx        // Simple + advanced visibility
  └── WidgetRegistry.tsx         // Register HUD tools + overlays
```

**Pros:**
- Single source of truth
- Maximum code reuse
- Consistent UX

**Cons:**
- High migration cost
- Risk of breaking existing configs
- Complex transition period

#### Option B: Keep Separate but Aligned (RECOMMENDED)
**Complexity: MEDIUM | Impact: MEDIUM**

Maintain two specialized editors (Overlay + HUD) but require that **all new editable-UI features go through a shared "Editable UI Core"**:

```
apps/main/src/lib/editing-core/       // Shared architecture
  ├── types/                          // UnifiedWidgetConfig, DataBinding, Preset types
  ├── hooks/                          // useUndoRedo, usePresetStore, useBindingEditor
  ├── utils/                          // position, visibility, validation, migration
  └── registry/                       // widget + component registries

apps/main/src/components/
  ├── overlay-editor/                 // Uses editing-core + overlay-specific widgets
  └── hud-editor/                     // Uses editing-core + HUD-specific widgets
```

**Rule of thumb:**
- New position/visibility/styling/binding/preset logic → `editing-core`
- Editor-specific layout and game-specific UX → `overlay-editor` or `hud-editor`

**Pros:**
- Lower migration risk than full merge
- Preserves specialized features for each use case
- Incremental improvement without disruptive rewrites
- Clear contract for where shared code lives
- Future editors automatically benefit from shared core

**Cons:**
- Still some duplication in editor UI code (acceptable)
- Need to maintain alignment (mitigated by shared types)

---

## Action Items for AI Agents

When working on editable UI features, consider:

### 1. Before Adding New Features

**Check both systems:**
```bash
# Search in overlay editor
grep -r "feature_name" apps/main/src/components/overlay-editor/
grep -r "feature_name" apps/main/src/lib/overlay/

# Search in HUD editor
grep -r "feature_name" apps/main/src/components/game/HudLayoutEditor.tsx
```

**Questions to ask:**
- Does this feature exist in the other system?
- Should this be shared functionality?
- Which system is the right home for this?

### 2. When Refactoring

**Extraction candidates:**
- Any component > 300 lines
- Duplicated logic between editors
- Hardcoded values that should be configurable

**Target locations:**
- Shared controls → `apps/main/src/components/ui-controls/`
- Shared logic → `apps/main/src/lib/editing-core/`
- Shared types → `apps/main/src/lib/editing-core/types.ts`

### 3. When Fixing Bugs

**Apply fixes to both systems if relevant:**
1. Identify if bug exists in both systems
2. Fix in shared utility if possible
3. Otherwise, apply fix to both independently
4. Document in this file if workaround needed

---

## File Reference Quick Links

### Overlay Editor System
- Main: `apps/main/src/components/overlay-editor/OverlayEditor.tsx`
- Controls: `apps/main/src/components/overlay-editor/*.tsx`
- Types: `apps/main/src/lib/overlay/types.ts`
- Utils: `apps/main/src/lib/overlay/utils/*.ts`
- Widgets: `apps/main/src/lib/overlay/widgets/*.tsx`
- Presets: `apps/main/src/lib/overlay/presets/`
- Preset manager: `apps/main/src/lib/overlay/presets/presetManager.ts`

### HUD Editor System
- Main: `apps/main/src/components/game/HudLayoutEditor.tsx` (1258 lines)
- Visibility Conditions: `HudLayoutEditor.tsx:888-994`
- Undo/Redo: `HudLayoutEditor.tsx:765-788`
- Preset System: `HudLayoutEditor.tsx:508-633`

### Gameplay UI Core (HUD-specific layer)
**Location:** `apps/main/src/lib/gameplay-ui-core/`

**Purpose:** HUD/gameplay-specific configuration layer built on top of editing-core

**Implementation Status:** ✅ **COMPLETE** (Types and converters fully implemented)
**Integration Status:** ⚠️ **PARTIAL** (HudLayoutEditor has imports but not yet refactored to use)

#### What This Layer Provides

This module serves as a **bridge between legacy HudToolPlacement types and the unified Editable UI Core architecture**. It enables:

1. **Gradual Migration**: HudLayoutEditor can continue using legacy types internally while gaining access to unified features
2. **Interoperability**: HUD configs can be converted to/from unified formats for preset sharing, import/export, and cross-editor compatibility
3. **Type Safety**: Strong typing for HUD-specific metadata (size variants, profiles, view modes) while conforming to unified schema
4. **Game-Specific Visibility**: Advanced visibility conditions (quest/location/time-based) that map cleanly to `UnifiedVisibility.advanced`

#### Key Files

##### `hudConfig.ts` (274 lines) - ✅ Complete
**HUD-specific config types:**
- `HudWidgetConfig` - Extends `UnifiedWidgetConfig` with HUD metadata
  - Adds `toolId`, `size`, `groupId`, `viewMode`, `profileId`, `defaultCollapsed`
  - Position uses `mode: 'region'` with HUD regions (top/bottom/left/right/overlay)
  - Visibility maps to `UnifiedVisibility` (simple + advanced)
- `HudSurfaceConfig` - Extends `UnifiedSurfaceConfig` with HUD metadata
  - Enforces `componentType: 'hud'`
  - Adds `profileId`, `viewMode`, `worldId`, `isWorldPreset`, `inheritFrom`

**Bidirectional converters (legacy ↔ unified):**
- `fromHudToolPlacement()` - Converts single HudToolPlacement → HudWidgetConfig
- `toHudToolPlacement()` - Converts HudWidgetConfig → HudToolPlacement (for backwards compatibility)
- `fromHudToolPlacements()` - Converts HudToolPlacement[] → HudSurfaceConfig
- `toHudToolPlacements()` - Converts HudSurfaceConfig → HudToolPlacement[]
- `toUnifiedSurfaceConfig()` - Strips HUD metadata to get generic config (for cross-editor sharing)
- `fromUnifiedSurfaceConfig()` - Enriches generic config with HUD metadata

**Why these converters matter:**
- Current HudLayoutEditor uses `HudToolPlacement[]` everywhere
- These converters enable **incremental refactoring** without breaking existing code
- Can convert to `HudSurfaceConfig` for export/import, then convert back for internal use
- Eventually HudLayoutEditor should use `HudSurfaceConfig` natively (see Migration Path below)

##### `hudVisibility.ts` (292 lines) - ✅ Complete
**Advanced visibility condition types:**
- `HudVisibilityCondition` - Game-specific visibility rules
  - 8 condition kinds: `capability`, `flag`, `session`, `location`, `time`, `quest`, `relationship`, `composite`
  - Time-based: day of week, hour range (24-hour)
  - Relationship-based: minimum NPC relationship level (0-100)
  - Composite: AND/OR logic for combining conditions
  - Maps to `AdvancedVisibilityCondition` from editing-core

**Bidirectional converters:**
- `toAdvancedVisibilityCondition()` - HudVisibilityCondition → generic AdvancedVisibilityCondition
- `fromAdvancedVisibilityCondition()` - AdvancedVisibilityCondition → HudVisibilityCondition

**Runtime evaluation:**
- `evaluateHudVisibility()` - Full implementation for all 8 condition kinds
- `evaluateHudVisibilityConditions()` - Evaluates multiple conditions (AND by default)
- Uses `WorldToolContext` for game state (session, flags, location, time, relationships)

**Helper builders:**
- `HudVisibilityHelpers.requireSession()` - Session-only visibility
- `HudVisibilityHelpers.atLocation(id)` - Location-based
- `HudVisibilityHelpers.duringHours(start, end, day?)` - Time-based
- `HudVisibilityHelpers.whenQuestActive(id)` - Quest-based
- `HudVisibilityHelpers.whenRelationship(npc, minLevel)` - Relationship-based
- `HudVisibilityHelpers.whenFlagSet(path)` - Flag-based
- `HudVisibilityHelpers.and(...)` / `.or(...)` - Composite conditions

##### `index.ts` - Module exports
Exports all types and functions from `hudConfig` and `hudVisibility`.

#### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ editing-core (generic, ✅ COMPLETE)                          │
│ - UnifiedWidgetConfig, UnifiedSurfaceConfig                 │
│ - UnifiedPosition (mode: anchor | region | absolute)        │
│ - UnifiedVisibility (simple + advanced)                     │
│ - DataBinding<T> (static | path | fn)                       │
│ - useUndoRedo<T> hook                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓ extends/wraps
┌─────────────────────────────────────────────────────────────┐
│ gameplay-ui-core (HUD-specific, ✅ COMPLETE)                 │
│ - HudWidgetConfig, HudSurfaceConfig                         │
│ - HudVisibilityCondition (8 kinds)                          │
│ - Converters: legacy ↔ unified                              │
│ - Runtime: evaluateHudVisibility()                          │
└─────────────────────────────────────────────────────────────┘
                            ↓ used by (imports only, not yet refactored)
┌─────────────────────────────────────────────────────────────┐
│ HudLayoutEditor (UI, ⚠️ PARTIAL INTEGRATION)                │
│ - Currently: Uses HudToolPlacement[] internally             │
│ - TODO: Refactor to use HudSurfaceConfig natively           │
│ - TODO: Modularize into smaller components                  │
│ - Already imports: HudSurfaceConfig, converters             │
└─────────────────────────────────────────────────────────────┘
```

#### Current Integration Status

**What's Done:**
- ✅ Full type definitions for HUD-specific config layer
- ✅ Complete bidirectional converters (legacy ↔ unified)
- ✅ Full visibility evaluation logic (all 8 condition kinds)
- ✅ Helper builders for common visibility patterns
- ✅ HudLayoutEditor imports the new types (added in last commit)

**What's NOT Done:**
- ❌ HudLayoutEditor still uses `HudToolPlacement[]` internally (not refactored yet)
- ❌ No actual usage of converters in HudLayoutEditor (just imports)
- ❌ No preset import/export using unified format yet
- ❌ No cross-editor config sharing implemented yet
- ❌ HudLayoutEditor not yet modularized (still 1258-line monolith)

#### Migration Path for HudLayoutEditor

**Current State:**
```typescript
// HudLayoutEditor.tsx - current internal state
const [tools, setTools] = useState<HudToolPlacement[]>([]);
```

**Target State:**
```typescript
// HudLayoutEditor.tsx - after refactor
const [hudConfig, setHudConfig] = useState<HudSurfaceConfig>({
  id: 'hud-layout',
  componentType: 'hud',
  widgets: [],
  version: 1,
});
```

**Incremental Steps:**
1. **Keep internal state as HudToolPlacement[]** (backwards compatible)
2. **Add conversion layer** for export/import:
   ```typescript
   function exportLayout(): HudSurfaceConfig {
     return fromHudToolPlacements(tools, { profileId, viewMode, worldId });
   }

   function importLayout(config: HudSurfaceConfig) {
     setTools(toHudToolPlacements(config));
   }
   ```
3. **Gradually migrate state** to HudSurfaceConfig (breaking change, requires migration)
4. **Remove legacy types** once all code uses unified types

**Benefits of Migration:**
- Unified preset format (can share HUD layouts like overlay configs)
- Access to editing-core features (undo/redo, validation, schema migrations)
- Interoperability with other editable UI systems
- Type-safe visibility conditions via HudVisibilityCondition

#### Dependencies

**Requires from editing-core** ✅ **ALL VERIFIED AND COMPLETE**:
- ✅ `UnifiedWidgetConfig` - Base widget config type (unifiedConfig.ts:117)
- ✅ `UnifiedSurfaceConfig` - Base surface config type (unifiedConfig.ts:152)
- ✅ `UnifiedPosition` - Position with mode: 'region' support (unifiedConfig.ts:41)
- ✅ `UnifiedVisibility` - Visibility with advanced conditions (unifiedConfig.ts:73)
- ✅ `AdvancedVisibilityCondition` - Generic advanced visibility type (unifiedConfig.ts:65)
- ✅ `useUndoRedo<T>` - Generic undo/redo hook (hooks/useUndoRedo.ts:23)

**Verified files:**
- ✅ `apps/main/src/lib/editing-core/unifiedConfig.ts` (160 lines, complete)
- ✅ `apps/main/src/lib/editing-core/hooks/useUndoRedo.ts` (60 lines, complete)
- ✅ `apps/main/src/lib/editing-core/dataBinding.ts` (data binding system)

#### Next Steps (Recommended)

1. **Modularize HudLayoutEditor** (HIGH PRIORITY) - See Task 101
   - Extract into `components/hud-editor/` subfolder
   - Break 1258-line monolith into focused components:
     - `HudEditor.tsx` - Main orchestrator
     - `RegionAssignment.tsx` - Region/order controls
     - `VisibilityConditions.tsx` - Visibility UI
     - `ProfileManager.tsx` - Profile management
     - `ViewModeConfig.tsx` - View mode settings
   - Switch to using `useUndoRedo<HudSurfaceConfig>` from editing-core
   - Keep behavior identical (no UX changes)

2. **Add export/import to HudLayoutEditor** (HIGH PRIORITY) - Part of Task 101
   - Use `fromHudToolPlacements()` / `toHudToolPlacements()` for JSON export/import
   - Enable preset sharing across worlds/profiles
   - Test round-trip conversion (export → import should be lossless)
   - Add export/import buttons to HUD editor UI

3. **Document visibility condition examples** (MEDIUM PRIORITY)
   - Add examples of common HUD visibility patterns
   - Show how to use HudVisibilityHelpers
   - Document WorldToolContext requirements
   - Create tutorial/guide for designers

4. **Consider full state migration to HudSurfaceConfig** (LONG-TERM)
   - Change internal state from `HudToolPlacement[]` to `HudSurfaceConfig`
   - Use converters only for legacy persistence layer
   - Enables direct access to unified features
   - Requires careful migration and testing

**Used by:** `apps/main/src/components/game/HudLayoutEditor.tsx` (imports only, not yet integrated)

---

### Data Binding (Task 99 - Aligned with Editing Core)
- **Type contract (canonical):** `apps/main/src/lib/editing-core/dataBinding.ts`
  - `DataBinding<T>` - Simple binding model (kind: static/path/fn)
  - `resolveDataBinding` - Resolution functions
  - `createBindingFromValue` - Migration helper
- **Registry-based Task 51 system:** `apps/main/src/lib/dataBinding/`
  - `DataSourceBinding` - Registry-based binding model
  - Core types: `dataSourceRegistry.ts`, `dataResolver.ts`
  - React hooks: `useDataBindings.ts`
  - Store accessors: `storeAccessors.ts`, `coreDataSources.ts`
  - Used by Panel Builder (Task 51)
- **String property paths:** `apps/main/src/lib/overlay/utils/propertyPath.ts`
  - Used by Overlay widgets
  - Implements path resolution for `DataBinding<T>` with kind='path'
- **Documentation:**
  - `apps/main/src/lib/dataBinding/DATA_BINDING_GUIDE.md` (Task 51 system)
  - `docs/OVERLAY_DATA_BINDING.md`
  - `docs/OVERLAY_STRING_PATHS.md`

### Configuration Routes
- Overlay Config: `apps/main/src/routes/OverlayConfig.tsx`
- HUD Config: (lookup needed - likely in game routes)

---

## Migration Path (If Consolidating)

### Phase 1: Shared Foundation (2-3 weeks)
1. Extract shared types to `editing-core/types.ts`
2. Create unified preset storage interface
3. Extract reusable UI controls
4. Implement shared undo/redo hook

### Phase 2: Align Data Models (2-3 weeks)
1. Create unified configuration schema
2. Implement converters (Overlay ↔ HUD ↔ Unified)
3. Add schema validation
4. Test round-trip conversion

### Phase 3: Refactor Editors (3-4 weeks)
1. Refactor HUD editor into modular components
2. Update Overlay editor to use shared controls
3. Both editors consume unified schema
4. Migrate existing configurations

### Phase 4: Consolidate (Optional) (4-6 weeks)
1. Create unified editor component
2. Add mode switching (overlay/HUD)
3. Migrate users gradually
4. Deprecate old editors

---

## Conclusion

The current architecture has **two capable but parallel systems** that would benefit from a shared foundation. The **recommended approach is Option B: Keep Separate but Aligned** through an Editable UI Core.

### Recommended Path Forward

1. **Phase 1 (Immediate):** Create `lib/editing-core/` with:
   - Unified serializable types (`UnifiedWidgetConfig`)
   - Data binding abstraction (`DataBinding<T>`)
   - Preset storage interface (`PresetStore<T>`)
   - Undo/redo hook (`useUndoRedo<T>`)

2. **Phase 2 (Short-term):** Migrate both editors to use core:
   - Overlay: Convert to use `UnifiedWidgetConfig`, keep anchor positioning
   - HUD: Refactor into modules, adopt `UnifiedWidgetConfig`, keep region positioning
   - Both: Share undo/redo, preset storage, data binding

3. **Phase 3 (Medium-term):** Extract shared UI controls:
   - Position controls (support both anchor + region modes)
   - Visibility controls (tiered: simple + advanced)
   - Style controls (unified)
   - Preset management UI

4. **Phase 4 (Ongoing):** Maintain alignment:
   - All new editable UI features go through `editing-core`
   - No third system allowed without going through core
   - Shared widget registry for cross-editor compatibility

### Key Principle

**"Single Editable UI Core, Multiple Specialized Editors"**

This approach provides:
- ✅ Clear separation of concerns
- ✅ Incremental migration without disruption
- ✅ Shared benefits across all editors
- ✅ Flexibility for specialized features
- ✅ Prevention of future divergence

---

## Recent Updates

### 2025-11-28 (Commit 66c9b52 + Documentation Update)
**Added:** gameplay-ui-core module (HUD-specific layer)
- ✅ Complete implementation of HudWidgetConfig, HudSurfaceConfig types
- ✅ Bidirectional converters between legacy HudToolPlacement and unified types
- ✅ Full HudVisibilityCondition system (8 condition kinds with evaluation)
- ⚠️ HudLayoutEditor imports added but not yet refactored to use new types
- 📝 Documentation updated to reflect actual implementation status and migration path

**Verified:** editing-core dependencies (all complete)
- ✅ editing-core/unifiedConfig.ts - All unified types complete (160 lines)
- ✅ editing-core/hooks/useUndoRedo.ts - Generic undo/redo ready (60 lines)
- ✅ editing-core/dataBinding.ts - Data binding system complete
- ✅ All dependencies required by gameplay-ui-core verified and working

**Ready for:** Task 101 - HudLayoutEditor modularization and gameplay-ui-core integration

**Next:** Execute Task 101 - Modularize HudLayoutEditor, add export/import, switch to useUndoRedo

---

## Verification Status

### 2025-11-28 - Task 102 Comprehensive Verification ✅
**Report:** `claude-tasks/102-verification-report.md`

All systems verified and approved:
- ✅ Type consistency confirmed (single DataBinding type from editing-core)
- ✅ HUD components correctly use gameplay-ui-core types
- ✅ Overlay widgets correctly use editing-core DataBinding
- ✅ Dead code removed (1 unreferenced legacy file deleted)
- ✅ Circular dependencies audited and documented
  - gameplay-ui-core ↔ worldTools: Type-only re-export (resolved)
  - editing-core → overlay: Minor dependency on resolvePath (low impact)
- ✅ Config export/import verified (both HUD and Overlay functional)
- ✅ Documentation accuracy confirmed

**Fixes Applied (Task 102):**
1. ✅ Moved `resolvePath` to editing-core/utils (circular dependency resolved)
2. ✅ Added Overlay ↔ UnifiedSurfaceConfig converters (cross-editor presets enabled)
3. ✅ PresetManager now supports both legacy and unified formats

**Remaining Sharp Edges:**
1. HudEditor uses converters for import/export (works correctly as-is, future: use HudSurfaceConfig natively)
2. Overlay widget registry needed for full preset restoration (documented limitation)

---

**Last Updated:** 2025-11-28 (Task 102 verification complete)
**Status:** Phase 1 Complete - editing-core ✅, gameplay-ui-core ✅, HudLayoutEditor ✅, Verification ✅
**Recommended Approach:** Option B (Editable UI Core) - Infrastructure Complete, Integration Verified
