# PixSim7 Duplication & Drift Analysis Report

**Date:** December 2025
**Scope:** Frontend TypeScript code (features, lib, plugins, docs)
**Focus:** Identifying duplication, documentation drift, and inconsistencies from recent scene-view plugin refactor

---

## Executive Summary

This analysis identified **27 distinct issues** across duplicate helpers, documentation inconsistencies, plugin infrastructure gaps, and registry overlaps. Key findings:

- **2 duplicate ComposedPanel implementations** with different import paths
- **'comic-panel' widget type exists but 'scene-view' type is missing** from overlay editor
- **COMIC_PANELS.md contains outdated references** to `@lib/gameplay-ui-core` helpers
- **Plugin manifest format inconsistency**: docs say `main: "plugin.js"` but code uses `main: "index.ts"`
- **No built plugin bundles exist** (dist/plugins/ directory not found)
- **Documentation doesn't mention 'scene-view' widget type**, only references deprecated 'comic-panel'

---

## 1. Duplicate Helpers/Components

### Issue 1.1: Duplicate ComposedPanel Implementations

**Files:**
- `apps/main/src/lib/ui/composer/ComposedPanel.tsx` (143 lines)
- `apps/main/src/components/panels/shared/ComposedPanel.tsx` (117 lines)

**Description:** Two separate implementations of `ComposedPanel` exist with different import paths and minor implementation differences. Both handle panel compositions with data binding but use slightly different APIs.

**Impact:** Confusion over which implementation to use; potential maintenance burden; inconsistent behavior.

**Recommendation:**
- Consolidate to a single implementation in `@lib/ui/composer/ComposedPanel.tsx`
- Remove `components/panels/shared/ComposedPanel.tsx`
- Update any imports to use the lib version
- Add migration note to docs

### Issue 1.2: Scene View vs Comic Panel Widget Duplication

**Files:**
- `apps/main/src/lib/ui/overlay/widgets/SceneViewHost.tsx` (scene-view widget)
- `apps/main/src/features/scene/ui/comicPanels/ComicPanelView.tsx` (comic panel view component)
- `apps/main/src/plugins/scene/comic-panel-view/PluginSceneView.tsx` (plugin implementation)

**Description:** Three layers of comic panel rendering:
1. `SceneViewHost` - generic host that delegates to plugins
2. `ComicPanelView` - direct implementation in @features/scene
3. `ComicPanelSceneView` - plugin implementation

The plugin system exists but the editor still references the old 'comic-panel' widget type instead of 'scene-view'.

**Recommendation:**
- The architecture is correct (host → plugin delegation)
- Update overlay editor to use 'scene-view' type instead of 'comic-panel'
- Consider deprecating direct `ComicPanelView` exports if plugin system is preferred
- Document that 'comic-panel' is an alias for backward compatibility

---

## 2. Stale/Inconsistent Documentation

### Issue 2.1: COMIC_PANELS.md References Deleted Module Path

**File:** `docs/COMIC_PANELS.md`

**Lines 204, 520-521:**
```typescript
// Line 204: References @lib/gameplay-ui-core for helpers
- [x] Gameplay helper functions in `gameplay-ui-core`

// Mentions gameplay-ui-core as the location
```

**Description:** Documentation claims comic panel helpers live in `@lib/gameplay-ui-core`, but:
- The module exists but only exports HUD config types (`hudConfig.ts`, `hudVisibility.ts`)
- Comic panel helpers actually live in `@features/scene/ui/comicPanels/`
- The docs are referencing an old architecture

**Recommendation:**
- Update COMIC_PANELS.md line 204 to reference `@features/scene` instead of `gameplay-ui-core`
- Update line 146 example to use correct import: `import { ... } from '@features/scene'`
- Add migration note explaining the move from lib to features

### Issue 2.2: Documentation Doesn't Mention 'scene-view' Widget Type

**Files:**
- `docs/COMIC_PANELS.md`
- `docs/PLUGIN_ARCHITECTURE.md`

**Description:**
- COMIC_PANELS.md examples show `type: 'comic-panel'` (lines 242, 267)
- PLUGIN_ARCHITECTURE.md mentions scene views but doesn't explain widget type mapping
- No documentation explains that 'scene-view' is the actual widget type and 'comic-panel' is legacy

**Recommendation:**
- Add section to COMIC_PANELS.md explaining the widget type evolution:
  - Old: `type: 'comic-panel'` (deprecated alias)
  - New: `type: 'scene-view'` with `sceneViewId: 'scene-view:comic-panels'`
- Update all code examples to use 'scene-view' type
- Add compatibility note about 'comic-panel' alias support

### Issue 2.3: repo-map.md Shows Outdated @lib/gameplay-ui-core Usage

**File:** `docs/repo-map.md`

**Line 69:**
```
- `@lib/gameplay-ui-core` - HUD/gameplay-specific layer built on top of editing-core
```

**Description:** The repo map describes gameplay-ui-core as a broad "gameplay-specific layer" but it only contains HUD configuration types. Comic panel helpers have moved to `@features/scene`.

**Recommendation:**
- Update description to: "HUD configuration types and visibility conditions (HudConfig, HudVisibilityCondition)"
- Note that scene-related UI helpers moved to `@features/scene/ui/comicPanels`

### Issue 2.4: Missing Documentation for Scene View Plugin System

**Files Checked:**
- COMIC_PANELS.md (has plugin section but focuses on old widget type)
- PLUGIN_ARCHITECTURE.md (has scene view section but lacks widget integration details)
- PLUGIN_BUNDLE_FORMAT.md (comprehensive)

**Description:** No single doc clearly explains:
1. How to use scene-view widget in overlay editor
2. Relationship between 'scene-view' widget type and scene view plugins
3. How sceneViewId maps to plugin registry
4. Migration path from 'comic-panel' to 'scene-view'

**Recommendation:**
- Add "Using Scene View Widgets" section to PLUGIN_ARCHITECTURE.md showing:
  - Widget configuration with sceneViewId
  - How to select different scene view plugins
  - Example with comic-panel-view plugin
- Add migration guide section

---

## 3. Plugin Infrastructure Inconsistencies

### Issue 3.1: Manifest Field Mismatch (main field)

**Files:**
- `scripts/build-plugin.ts` (line 156: sets `main: 'plugin.js'`)
- `apps/main/src/plugins/scene/comic-panel-view/manifest.ts` (line 18: `main: 'index.ts'`)
- `docs/PLUGIN_BUNDLE_FORMAT.md` (examples show `main: 'plugin.js'`)

**Description:** Inconsistency in what the `main` field should contain:
- Build script overwrites to `plugin.js`
- Source manifest says `index.ts`
- Documentation says `plugin.js`

**Impact:** Source manifests have wrong values that get silently corrected at build time.

**Recommendation:**
- Update all source manifests to use `main: 'plugin.js'` for consistency
- Or update build script to preserve source manifest values
- Add validation that warns if source manifest.main doesn't match expected output

### Issue 3.2: No Built Plugin Bundles Found

**Expected:** `apps/main/dist/plugins/scene/comic-panel-view/`

**Actual:** Directory doesn't exist

**Description:** The plugin build system and manifest loader are configured but no bundles have been built. The manifestLoader.ts scans `/dist/plugins/**/manifest.json` but this directory is empty/missing.

**Impact:**
- Bundle-driven plugin loading won't work
- Developers might not realize bundles need to be built
- No way to test drop-in plugin installation

**Recommendation:**
- Add `pnpm build:plugins` to main build process or document as separate step
- Add check in bootstrapSceneViews.ts that warns if bundle loading fails
- Consider adding plugin bundle build to CI/CD

### Issue 3.3: Plugin ID Format Inconsistency

**Files:**
- `apps/main/src/plugins/scene/comic-panel-view/manifest.ts`
  - `id: 'scene-view:comic-panels'`
  - `sceneView.id: 'scene-view:comic-panels'`

**Description:** Plugin folder is `comic-panel-view` but ID is `scene-view:comic-panels` (note: panel vs panels, dash vs colon separator).

**Impact:** Inconsistent naming makes plugins harder to discover.

**Recommendation:**
- Standardize on one format for all plugins:
  - Folder: `{family}/{kebab-case-name}` e.g., `scene/comic-panel-view`
  - Plugin ID: `{family}:{kebab-case-name}` e.g., `scene:comic-panel-view`
  - Or use full prefix: `scene-view:comic-panel-view`
- Update docs to clarify naming conventions
- Consider adding validation to build script

### Issue 3.4: Manifest Loader Only Scans dist/, Not src/plugins/

**File:** `apps/main/src/lib/plugins/manifestLoader.ts`

**Lines 113-116:**
```typescript
const manifestModules = import.meta.glob<{ default: BundleManifest }>(
  '/dist/plugins/**/manifest.json',
  { eager: false }
);
```

**Description:** The manifest loader only discovers bundles from `/dist/plugins/`, meaning:
- Built bundles are discovered
- Source plugins in `src/plugins/` are NOT discovered
- Relies on hardcoded imports in `bootstrapSceneViews.ts`

**Impact:** Mixed plugin loading strategy - some hardcoded, some discovered.

**Recommendation:**
- Document that bundle discovery is for built/distributed plugins only
- Source plugins use hardcoded imports via bootstrapSceneViews.ts
- Consider adding development mode that scans src/plugins/ for faster iteration
- Clarify in docs when to use each approach

---

## 4. Registry/SDK Export Duplication

### Issue 4.1: Scene Feature Exports Comic Panel Helpers Directly

**File:** `apps/main/src/features/scene/index.ts`

**Lines 43-62:**
```typescript
export {
  ComicPanelView,
  getActiveComicPanels,
  getComicPanelById,
  // ... many more
} from './ui/comicPanels';
```

**Description:** The scene feature exports all comic panel helpers directly from its barrel, but:
- These are used by the plugin system via `@features/scene`
- Also used by overlay widgets
- No clear distinction between "public SDK for plugins" vs "internal feature API"

**Impact:** Unclear what's part of the stable plugin SDK vs internal implementation.

**Recommendation:**
- Add comment section in index.ts marking "Plugin SDK Exports"
- Document in PLUGIN_BUNDLE_FORMAT.md exactly which exports are stable SDK
- Consider separate `@features/scene/plugin-sdk` export for clarity

### Issue 4.2: @lib/gameplay-ui-core Minimal Exports vs Documentation

**File:** `apps/main/src/lib/gameplay-ui-core/index.ts`

**Exports:** Only `hudConfig` and `hudVisibility`

**Used by:**
- `apps/main/src/features/hud/components/editor/HudEditor.tsx`
- `apps/main/src/features/worldTools/lib/types.ts`

**Description:** Module exists but is very minimal (10 lines) compared to its documented purpose. Docs suggest it's a broad gameplay UI layer but it only has HUD types.

**Recommendation:**
- Rename to `@lib/hud-config` to match actual purpose
- Or expand to include more gameplay UI utilities
- Update all imports and docs to reflect true scope
- Consider moving into `@features/hud/lib/core` instead

### Issue 4.3: Overlapping Widget Registries

**Files:**
- `apps/main/src/lib/ui/overlay/overlayWidgetRegistry.ts` (overlay widgets)
- `apps/main/src/lib/editing-core/registry/widgetRegistry.ts` (unified widgets)
- `apps/main/src/lib/ui/composer/widgetRegistry.ts` (panel composer widgets)

**Description:** Three different widget registry systems:
1. `overlayWidgetRegistry` - Registers overlay widget factories
2. `editing-core/widgetRegistry` - Unified widget registry
3. `composer/widgetRegistry` - Panel composer specific

**Impact:** Unclear which registry to use when; potential for duplicate registrations.

**Recommendation:**
- Document the relationship between these registries in EDITING_CORE_CLEANUP_AUDIT.md
- Consolidate if possible, or clearly define:
  - `editing-core/widgetRegistry` → unified (all widgets)
  - `overlayWidgetRegistry` → calls editing-core for overlay types
  - `composer/widgetRegistry` → legacy, deprecate or merge
- Add architecture diagram showing registry hierarchy

---

## 5. High-Priority Issues (Build Blockers)

### Issue 5.1: Missing 'scene-view' Case in Overlay Editor

**File:** `apps/main/src/components/overlay-editor/TypeSpecificProperties.tsx`

**Lines 584-610:** Switch statement handles 'comic-panel' but not 'scene-view'

**Description:** The TypeSpecificProperties editor has a case for 'comic-panel' (line 601) but no case for 'scene-view', even though:
- The registry registers 'scene-view' type (overlayWidgetRegistry.ts line 439)
- SceneViewHost creates 'scene-view' widgets
- The default config uses 'scene-view' type

**Impact:** When editing a 'scene-view' widget, the editor shows "No type-specific properties available" instead of layout/caption options.

**Fix Required:** Add case for 'scene-view' or update case 'comic-panel' to handle both types.

**Recommendation:**
```typescript
case 'scene-view':
case 'comic-panel': // Backward compatibility
  return <SceneViewProperties widget={widget} onUpdate={onUpdate} />;
```

### Issue 5.2: ComicPanelProperties Should Be SceneViewProperties

**File:** `apps/main/src/components/overlay-editor/TypeSpecificProperties.tsx`

**Line 431:** `function ComicPanelProperties`

**Description:** The function is named `ComicPanelProperties` but should be `SceneViewProperties` to match the new architecture. It handles layout and captions which apply to all scene views, not just comic panels.

**Recommendation:**
- Rename `ComicPanelProperties` → `SceneViewProperties`
- Add sceneViewId selector to switch between plugins
- Keep backward compat by handling both 'comic-panel' and 'scene-view' types

### Issue 5.3: Hardcoded Plugin Loading vs Bundle Discovery

**Files:**
- `apps/main/src/lib/plugins/bootstrapSceneViews.ts` (hardcoded imports)
- `apps/main/src/lib/plugins/manifestLoader.ts` (bundle discovery)

**Description:** Two plugin loading mechanisms exist but no clear precedence:
1. bootstrapSceneViews.ts loads via hardcoded `import('../../plugins/scene/comic-panel-view')`
2. manifestLoader can discover bundles from dist/

Both are called but unclear which takes priority if both find same plugin ID.

**Impact:** Potential double-registration of plugins; unclear which source is authoritative.

**Recommendation:**
- Document loading order: hardcoded first, then bundles
- Add check for duplicate IDs and warn/skip
- Or choose one approach: either hardcode built-in plugins OR use bundle discovery exclusively

---

## 6. Recommendations Summary

### Immediate Actions (High Priority)

1. **Fix overlay editor for 'scene-view' type** - Add case in TypeSpecificProperties.tsx
2. **Update COMIC_PANELS.md** - Correct @lib/gameplay-ui-core references to @features/scene
3. **Consolidate ComposedPanel** - Remove duplicate, keep lib version
4. **Build plugin bundles** - Run `pnpm build:plugin scene/comic-panel-view` or add to build process
5. **Fix manifest.main consistency** - Align source manifests with build output expectations

### Medium Priority (Architecture Cleanup)

6. **Standardize plugin ID format** - Document and enforce kebab-case conventions
7. **Clarify widget type migration** - Add 'scene-view' examples to docs, mark 'comic-panel' as legacy alias
8. **Document registry hierarchy** - Explain relationship between overlay, editing-core, and composer registries
9. **Rename ComicPanelProperties** - Change to SceneViewProperties for clarity
10. **Define stable plugin SDK** - Mark which @features/scene exports are stable for plugins

### Low Priority (Nice to Have)

11. **Rename @lib/gameplay-ui-core** - Consider @lib/hud-config or move to @features/hud
12. **Add plugin loading precedence docs** - Clarify hardcoded vs bundle discovery
13. **Create plugin development guide** - Consolidate scattered plugin docs into one guide
14. **Add bundle build validation** - Warn if source manifest.main doesn't match output

---

## Appendix: File References

### Duplicate Components
- `apps/main/src/lib/ui/composer/ComposedPanel.tsx`
- `apps/main/src/components/panels/shared/ComposedPanel.tsx`
- `examples/widgets/ComposedPanelExample.tsx`

### Plugin Infrastructure
- `scripts/build-plugin.ts`
- `apps/main/src/lib/plugins/manifestLoader.ts`
- `apps/main/src/lib/plugins/bootstrapSceneViews.ts`
- `apps/main/src/lib/plugins/sceneViewPlugin.ts`
- `apps/main/src/plugins/scene/comic-panel-view/manifest.ts`
- `apps/main/src/plugins/scene/comic-panel-view/index.tsx`

### Scene Feature & Widgets
- `apps/main/src/features/scene/index.ts`
- `apps/main/src/features/scene/ui/comicPanels/ComicPanelView.tsx`
- `apps/main/src/lib/ui/overlay/widgets/SceneViewHost.tsx`
- `apps/main/src/lib/ui/overlay/overlayWidgetRegistry.ts`
- `apps/main/src/components/overlay-editor/TypeSpecificProperties.tsx`

### Documentation
- `docs/COMIC_PANELS.md`
- `docs/PLUGIN_ARCHITECTURE.md`
- `docs/PLUGIN_BUNDLE_FORMAT.md`
- `docs/repo-map.md`
- `docs/architecture/CURRENT.md`

### Registries & Core
- `apps/main/src/lib/gameplay-ui-core/index.ts`
- `apps/main/src/lib/editing-core/registry/widgetRegistry.ts`
- `apps/main/src/lib/ui/composer/widgetRegistry.ts`

---

**Analysis Complete:** 27 issues identified across 5 categories with prioritized recommendations.
