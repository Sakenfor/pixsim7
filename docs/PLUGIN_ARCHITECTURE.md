# Plugin Architecture

This document describes the standardized plugin architecture for PixSim7, covering infrastructure, implementation patterns, and registration mechanisms.

## Table of Contents

- [Overview](#overview)
- [Source Layout vs Runtime Layout](#source-layout-vs-runtime-layout)
- [Current State Audit](#current-state-audit)
- [Standard Plugin Pattern](#standard-plugin-pattern)
- [Registration & Discovery Rules](#registration--discovery-rules)
- [How to Add a New Plugin](#how-to-add-a-new-plugin)
- [Incremental Refactor Plan](#incremental-refactor-plan)

---

## Overview

PixSim7 uses a plugin architecture to extend functionality in a modular, maintainable way. The system follows two key principles:

1. **Global infrastructure lives in `@lib/plugins`** - Core types, catalog, activation management, and registry bridge
2. **Plugin implementations live close to their features** - `features/*/plugins/` directories

### Source Layout vs Runtime Layout

It is important to distinguish between how plugins are organized **in this repo (source)** and how they are treated **at runtime (installed/downloaded)**:

- **Source (monorepo) layout**
  - Plugin implementations live under their owning feature:
    - `apps/main/src/features/worldTools/plugins/*`
    - `apps/main/src/features/scene/plugins/*` (e.g. scene view / comic panel plugins)
    - `apps/main/src/features/brainTools/plugins/*`
    - Other feature-local plugin folders following the same pattern.
  - Each feature owns:
    - Its plugin contracts in `features/<feature>/lib/types.ts`
    - Its local registry in `features/<feature>/lib/registry.ts`
    - A `builtIn<FeatureName>Plugins` list in `features/<feature>/plugins/index.ts`.

- **Runtime layout (what the launcher/app sees)**
  - All plugins are surfaced through a **single logical plugin catalog** driven by `@lib/plugins`.
  - Downloaded/installed plugins share a unified storage location (for example a `plugins/` directory on disk or a plugins table in the database), but are distinguished by a `featureKind` and manifest metadata.
  - The global plugin manager is responsible for:
    - Loading manifests from runtime storage
    - Validating plugin kinds and versions
    - Dispatching plugins to the appropriate feature registries.

This lets us keep **feature-first ownership in the codebase**, while still having a **single place** for users to browse, download, and manage plugins at runtime.

### Key Components

```
apps/main/src/lib/plugins/
├── types.ts              # Legacy UI plugin types (PluginManifest, PluginAPI)
├── pluginSystem.ts       # Unified catalog: PluginMetadata, PluginCatalog
├── registryBridge.ts     # Bridges feature registries → global catalog
├── catalog.ts            # Legacy catalog abstraction (deprecated)
├── PluginManager.ts      # UI plugin installation/management
├── PluginHost.tsx        # Generic plugin host UI component
├── loader.ts             # Plugin loading utilities
└── sandbox.ts            # Plugin sandboxing for user code
```

---

## Source Layout vs Runtime Layout

It is important to distinguish between how plugins are organized **in this repo (source)** and how they are treated **at runtime (installed/downloaded)**:

### Source (Monorepo) Layout

Plugin implementations live under their owning feature:

```
apps/main/src/features/worldTools/plugins/*
apps/main/src/features/brainTools/plugins/*
apps/main/src/features/scene/plugins/*      (e.g., scene view / comic panel plugins)
apps/main/src/features/gallery/plugins/*    (future)
```

Each feature owns:
- Its **plugin contracts** in `features/<feature>/lib/types.ts`
- Its **local registry** in `features/<feature>/lib/registry.ts`
- A **`builtIn<FeatureName>Plugins`** list in `features/<feature>/plugins/index.ts`

### Runtime Layout (What the App Sees)

All plugins are surfaced through a **single logical plugin catalog** driven by `@lib/plugins`:

- **Downloaded/installed plugins** share a unified storage location (e.g., a `plugins/` directory on disk or a plugins table in the database), but are distinguished by a `featureKind` and manifest metadata.
- The **global plugin manager** (`PluginManager.ts`) is responsible for:
  - Loading manifests from runtime storage
  - Validating plugin kinds and versions
  - Dispatching plugins to the appropriate feature registries

### Why This Separation Matters

| Aspect | Source Layout | Runtime Layout |
|--------|---------------|----------------|
| **Purpose** | Developer experience, maintainability | User experience, discoverability |
| **Organization** | Feature-first (ownership boundaries) | Unified (single browse/manage UI) |
| **Location** | `features/*/plugins/` | `plugins/` directory or database |
| **Registry** | Feature-local registries | Global `pluginCatalog` |

This lets us keep **feature-first ownership in the codebase**, while still having a **single place** for users to browse, download, and manage plugins at runtime.

---

## Current State Audit

### Plugin Kinds Summary

| Kind | Interface Source | Implementations Location | Registration Path |
|------|-----------------|-------------------------|-------------------|
| **world-tool** | `features/worldTools/lib/types.ts` | `features/worldTools/plugins/*` | worldToolRegistry → registryBridge → catalog |
| **brain-tool** | `features/brainTools/lib/types.ts` | `features/brainTools/plugins/*` | brainToolRegistry (standalone) |
| **gallery-tool** | `features/gallery/lib/core/types.ts` | `features/gallery/plugins/*` | galleryToolRegistry → registryBridge → catalog |
| **gizmo-surface** | `features/gizmos/lib/core/surfaceRegistry.ts` | `features/gizmos/plugins/*` | gizmoSurfaceRegistry → registryBridge → catalog |
| **workspace-panel** | `lib/ui/panels/panelRegistry.ts` | Various (components, features) | panelRegistry → registryBridge → catalog |
| **dev-tool** | `lib/devtools/types.ts` | `features/devtools/plugins/*` | devToolRegistry → registryBridge → catalog |
| **scene-view** | `lib/plugins/sceneViewPlugin.ts` | `plugins/scene/*` | sceneViewRegistry (standalone) |
| **session-helper** | `@pixsim7/game.engine` | `plugins/`, `lib/game/customHelpers.ts` | sessionHelperRegistry → registryBridge → catalog |
| **interaction** | `lib/game/interactions/types.ts` | `lib/game/interactions/` | interactionRegistry → registryBridge → catalog |
| **node-type** | `@pixsim7/shared.types` | `lib/plugins/*Node.ts`, features/graph | nodeTypeRegistry → registryBridge → catalog |
| **renderer** | `features/graph/lib/editor/nodeRendererRegistry` | `features/graph/components/graph/*Renderer` | nodeRendererRegistry → registryBridge → catalog |
| **graph-editor** | `features/graph/lib/editor/editorRegistry.ts` | `features/graph/` | graphEditorRegistry → registryBridge → catalog |
| **ui-plugin** | `lib/plugins/types.ts` | User-uploaded bundles | PluginManager → catalog |
| **generation-ui** | `features/providers/` | `features/providers/` | generationUIPluginRegistry → catalog |

### Pattern Analysis

**Following standard pattern:**
- `worldTools` - Clean separation: `lib/types.ts` → `lib/registry.ts` → `plugins/index.ts`
- `brainTools` - Similar pattern, consistent structure
- `gallery` - Uses `plugins/` folder with `builtInGalleryTools` export
- `gizmos` - Surface definitions in `plugins/surfaces.ts` with `builtInGizmoSurfaces` export
- `devtools` - Tool definitions in `features/devtools/plugins/` with `builtInDevTools` export

**Needs improvement:**
- `workspace-panel` - Implementations scattered across components/features

---

## Standard Plugin Pattern

### Recommended Folder Structure

```
apps/main/src/lib/plugins/         # Global infrastructure
├── types.ts                       # Base Plugin, PluginKind, PluginMeta types
├── pluginSystem.ts                # PluginCatalog, PluginActivationManager
├── registryBridge.ts              # Bridges feature registries → catalog
├── PluginHost.tsx                 # Generic plugin host UI
└── index.ts                       # Re-exports

apps/main/src/features/{featureName}/
├── lib/
│   ├── types.ts                   # {FeatureName}Plugin interface
│   └── registry.ts                # {featureName}Registry + auto-registration
├── plugins/
│   ├── index.ts                   # Exports all plugins + builtIn{FeatureName}Plugins array
│   ├── {pluginName1}.tsx
│   └── {pluginName2}.tsx
└── index.ts                       # Feature public API
```

### Interface Pattern

Each plugin kind should define:

```typescript
// features/{featureName}/lib/types.ts

export interface {FeatureName}Plugin {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description?: string;

  /** Icon (emoji or icon name) */
  icon?: string;

  /** Category for grouping */
  category?: '{category1}' | '{category2}' | 'custom';

  /** Visibility predicate */
  whenVisible?: (context: {FeatureName}Context) => boolean;

  /** Render the plugin UI */
  render: (context: {FeatureName}Context) => ReactNode;

  /** Lifecycle hooks */
  onMount?: (context: {FeatureName}Context) => void | Promise<void>;
  onUnmount?: () => void | Promise<void>;
}
```

### Registry Pattern

```typescript
// features/{featureName}/lib/types.ts

export class {FeatureName}Registry {
  private plugins = new Map<string, {FeatureName}Plugin>();

  register(plugin: {FeatureName}Plugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`{FeatureName} plugin "${plugin.id}" already registered. Overwriting.`);
    }
    if (!plugin.id || !plugin.name || !plugin.render) {
      throw new Error('{FeatureName} plugin must have id, name, and render properties');
    }
    this.plugins.set(plugin.id, plugin);
  }

  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  get(id: string): {FeatureName}Plugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): {FeatureName}Plugin[] {
    return Array.from(this.plugins.values());
  }

  getByCategory(category: string): {FeatureName}Plugin[] {
    return this.getAll().filter(p => p.category === category);
  }

  getVisible(context: {FeatureName}Context): {FeatureName}Plugin[] {
    return this.getAll().filter(p => {
      if (!p.whenVisible) return true;
      try { return p.whenVisible(context); }
      catch { return false; }
    });
  }

  clear(): void {
    this.plugins.clear();
  }
}

export const {featureName}Registry = new {FeatureName}Registry();
```

### Auto-Registration Pattern

```typescript
// features/{featureName}/lib/registry.ts

import { {featureName}Registry } from './types';
import { builtIn{FeatureName}Plugins } from '../plugins';

// Auto-register built-in plugins
builtIn{FeatureName}Plugins.forEach(plugin => {
  {featureName}Registry.register(plugin);
});

export { {featureName}Registry };
```

### Plugin Index Pattern

```typescript
// features/{featureName}/plugins/index.ts

import { examplePlugin1 } from './examplePlugin1';
import { examplePlugin2 } from './examplePlugin2';

// Named exports for individual use
export { examplePlugin1, examplePlugin2 };

// Array export for bulk registration
export const builtIn{FeatureName}Plugins = [
  examplePlugin1,
  examplePlugin2,
];
```

---

## Registration & Discovery Rules

### Plugin Identification

Every plugin must have:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (kebab-case, e.g., `"relationship-dashboard"`) |
| `name` | Yes | Human-readable display name |
| `description` | Recommended | Short description of functionality |
| `category` | Recommended | Category for grouping/filtering |
| `icon` | Optional | Emoji or icon name |
| `version` | Optional | Semantic version (e.g., `"1.0.0"`) |

### Registration Approach

**Recommended:** Feature-level registries as single source, with `registryBridge.ts` importing them.

```
Feature Registry (authoritative)
       ↓
  registryBridge.ts
       ↓
  pluginCatalog (unified view)
```

**Why this approach:**
1. **Non-breaking** - Existing registries remain authoritative
2. **Incremental** - Easy to add new plugin kinds
3. **Decoupled** - Features don't depend on global catalog
4. **Unified** - Global catalog provides cross-cutting queries

### Registration Flow

1. **Feature defines plugins** in `features/*/plugins/*.tsx`
2. **Feature exports array** via `features/*/plugins/index.ts`
3. **Feature registry auto-registers** via `features/*/lib/registry.ts`
4. **registryBridge syncs** to global catalog (if needed for cross-cutting features)

### Discovery

The global catalog provides discovery utilities:

```typescript
import { pluginCatalog } from '@lib/plugins/pluginSystem';

// Get all plugins
const all = pluginCatalog.getAll();

// Get by family
const worldTools = pluginCatalog.getByFamily('world-tool');

// Get by origin
const builtins = pluginCatalog.getByOrigin('builtin');

// Get active plugins
const active = pluginCatalog.getActive();
```

---

## How to Add a New Plugin

### Example: Adding a World Tool Plugin

1. **Create the plugin file:**

```typescript
// features/worldTools/plugins/myNewTool.tsx

import type { WorldToolPlugin, WorldToolContext } from '../lib/types';

export const myNewTool: WorldToolPlugin = {
  id: 'my-new-tool',
  name: 'My New Tool',
  description: 'A helpful tool that does something useful',
  icon: '🛠️',
  category: 'utility',

  whenVisible: (ctx: WorldToolContext) => {
    // Only show when there's an active session
    return ctx.session !== null;
  },

  render: (ctx: WorldToolContext) => {
    return (
      <div className="p-4">
        <h3>My New Tool</h3>
        <p>Current location: {ctx.location?.name ?? 'Unknown'}</p>
      </div>
    );
  },

  onMount: (ctx) => {
    console.log('My tool mounted');
  },

  onUnmount: () => {
    console.log('My tool unmounted');
  },
};
```

2. **Register in plugins/index.ts:**

```typescript
// features/worldTools/plugins/index.ts

import { myNewTool } from './myNewTool';
// ... other imports

export { myNewTool };
// ... other exports

export const builtInWorldTools = [
  // ... existing tools
  myNewTool,
];
```

3. **That's it!** The tool will be automatically registered via `lib/registry.ts`.

### Example: Adding a Brain Tool Plugin

```typescript
// features/brainTools/plugins/myBrainAnalyzer.tsx

import type { BrainToolPlugin, BrainToolContext } from '../lib/types';

export const myBrainAnalyzer: BrainToolPlugin = {
  id: 'my-brain-analyzer',
  name: 'Brain Analyzer',
  description: 'Analyzes NPC brain patterns',
  icon: '🧠',
  category: 'debug',

  whenVisible: (ctx: BrainToolContext) => {
    return ctx.brainState !== null;
  },

  render: (ctx: BrainToolContext) => {
    const { brainState, npcId } = ctx;
    return (
      <div className="p-4">
        <h3>Brain Analysis for NPC #{npcId}</h3>
        {brainState && (
          <pre>{JSON.stringify(brainState.stats, null, 2)}</pre>
        )}
      </div>
    );
  },
};
```

Then add to `features/brainTools/plugins/index.ts` in the same pattern.

---

## Incremental Refactor Plan

This plan moves the codebase toward the standard pattern without big-bang changes.

### Phase 1: Documentation (This Document)

- [x] Create `docs/PLUGIN_ARCHITECTURE.md`
- [x] Document current state
- [x] Define standard pattern
- [x] Provide examples

### Phase 2: Standardize Reference Plugin Kind (World Tools) ✅

World tools already follow the recommended pattern:

```
features/worldTools/
├── lib/
│   ├── types.ts        ✅ WorldToolPlugin interface + WorldToolRegistry class
│   ├── registry.ts     ✅ Auto-registers builtInWorldTools
│   └── context.ts      ✅ WorldToolContext type
├── plugins/
│   ├── index.ts        ✅ Exports all plugins + builtInWorldTools array
│   └── *.tsx           ✅ Individual plugin files
└── index.ts            ✅ Public API
```

### Phase 3: Mirror Pattern for Brain Tools ✅

Brain tools also follow the pattern. No changes needed.

### Phase 4: Migrate Gallery Tools ✅

Gallery tools now follow the standard pattern:

```
features/gallery/
├── lib/
│   ├── core/types.ts   ✅ GalleryToolPlugin interface + registry
│   └── registry.ts     ✅ Auto-registers builtInGalleryTools
├── plugins/
│   ├── index.ts        ✅ Exports builtInGalleryTools array
│   └── bulkTagTool.tsx ✅ Individual plugin file
└── index.ts            ✅ Public API
```

### Phase 5: Migrate Gizmo Surfaces ✅

Gizmo surfaces now follow the standard pattern:

```
features/gizmos/
├── lib/core/
│   ├── surfaceRegistry.ts   ✅ GizmoSurfaceDefinition + registry
│   ├── registerGizmoSurfaces.ts ✅ Uses builtInGizmoSurfaces
│   └── registry-*.ts        (Unchanged - gizmo packs are configs, not plugins)
├── plugins/
│   ├── index.ts             ✅ Exports builtInGizmoSurfaces array
│   └── surfaces.ts          ✅ Individual surface definitions
└── index.ts                 ✅ Public API
```

Note: Gizmo *packs* (`registry-rings.ts`, `registry-romance.ts`, etc.) remain unchanged
as they define gizmo configurations, not UI plugins.

### Phase 6: Move Dev Tools to Features ✅

Dev tools now follow the standard pattern:

```
features/devtools/
├── plugins/
│   ├── index.ts        ✅ Exports builtInDevTools array (13 tools)
│   └── tools.ts        ✅ Individual tool definitions
└── index.ts            ✅ Feature entry point

lib/devtools/           (Infrastructure remains here)
├── types.ts            DevToolDefinition, DevToolId, DevToolCategory
├── devToolRegistry.ts  DevToolRegistry class + singleton
├── devToolContext.tsx  DevToolProvider and useDevToolContext
├── registerDevTools.ts Uses builtInDevTools from features/devtools/plugins
└── index.ts            Re-exports
```

### Phase 7: Add Consistency Checks ✅

A consistency check script verifies plugin structure:

```bash
node scripts/checkPluginStructure.js
```

Output:
```
Plugin Structure Consistency Check
==================================

✅ worldTools - plugins/index.ts exports builtInWorldTools
✅ brainTools - plugins/index.ts exports builtInBrainTools
✅ gallery    - plugins/index.ts exports builtInGalleryTools
✅ gizmos     - plugins/index.ts exports builtInGizmoSurfaces
✅ devtools   - plugins/index.ts exports builtInDevTools

Summary: 5/5 passing
```

The script checks:
- `features/{feature}/plugins/` directory exists
- `plugins/index.ts` file exists
- `index.ts` exports the expected `builtIn*Plugins` array

---

## Breaking Changes & Migration Notes

### No Breaking Changes Expected

The refactor plan is designed to be non-breaking:

1. **Existing imports continue to work** - Feature public APIs (`features/*/index.ts`) remain stable
2. **Registries remain authoritative** - No changes to how plugins are discovered at runtime
3. **Gradual migration** - Each phase can be done independently

### Migration Checklist for New Plugin Kinds

When adding a new plugin kind:

- [ ] Define `{FeatureName}Plugin` interface in `features/{featureName}/lib/types.ts`
- [ ] Define `{FeatureName}Context` interface for plugin render props
- [ ] Create `{FeatureName}Registry` class with standard methods
- [ ] Export singleton `{featureName}Registry`
- [ ] Create `features/{featureName}/plugins/index.ts` with plugin exports
- [ ] Create `features/{featureName}/lib/registry.ts` for auto-registration
- [ ] Add bridge function in `lib/plugins/registryBridge.ts` (if catalog integration needed)
- [ ] Add `PluginFamily` type to `lib/plugins/pluginSystem.ts` (if catalog integration needed)

---

---

## Scene View Plugins

Scene view plugins provide different presentation modes for scene content in overlays and HUD. They follow the standard plugin architecture but use a specialized registry for rendering scene data.

### Architecture

```
lib/plugins/
├── sceneViewPlugin.ts       # SceneViewRegistry, types
└── bootstrapSceneViews.ts   # Plugin loading

plugins/scene/               # Scene view plugin implementations
└── comic-panel-view/
    ├── manifest.ts          # Plugin metadata
    ├── PluginSceneView.tsx  # Render component
    ├── index.ts             # Entry point + registration
    └── README.md            # Plugin docs

lib/ui/overlay/widgets/
└── SceneViewHost.tsx        # Generic host widget
```

### SDK Surface

Scene view plugins import from these stable modules:

- `@features/scene` - Types and helpers:
  - `SceneMetaComicPanel`, `ComicPanelRequestContext`, `ComicPanelLayout`
  - `getActiveComicPanels`, `getComicPanelById`, `getComicPanelsByTags`
  - `ensureAssetRef`, `extractNumericAssetId`
- `@lib/assetProvider` - Asset resolution via `useAssetProvider`
- `@lib/plugins/sceneViewPlugin` - Plugin types and registry
- `@pixsim7/shared.types` - Canonical reference types

### Creating a Scene View Plugin

1. Create plugin folder under `plugins/scene/{plugin-name}/`

2. Define manifest:

```typescript
// manifest.ts
import type { SceneViewPluginManifest } from '@lib/plugins/sceneViewPlugin';

export const manifest: SceneViewPluginManifest = {
  id: 'scene-view:my-plugin',
  name: 'My Scene View',
  version: '1.0.0',
  type: 'ui-overlay',
  sceneView: {
    id: 'scene-view:my-plugin',
    displayName: 'My View',
    surfaces: ['overlay', 'hud'],
    default: false,
  },
};
```

3. Create render component:

```typescript
// PluginSceneView.tsx
import type { SceneViewRenderProps } from '@lib/plugins/sceneViewPlugin';

export function MySceneView({ panels, layout, showCaption }: SceneViewRenderProps) {
  // Render panels using SDK helpers and types
  return <div>{/* Custom rendering */}</div>;
}
```

4. Register on import:

```typescript
// index.ts
import { sceneViewRegistry } from '@lib/plugins/sceneViewPlugin';
import { manifest } from './manifest';
import { MySceneView } from './PluginSceneView';

export const plugin = {
  render: (props) => <MySceneView {...props} />,
};

sceneViewRegistry.register(manifest, plugin);
```

5. Add to bootstrap:

```typescript
// lib/plugins/bootstrapSceneViews.ts
await import('../../plugins/scene/my-plugin');
```

### Using Scene View Widgets

The `SceneViewHost` widget delegates to registered plugins:

```typescript
import { createSceneViewHost } from '@lib/ui/overlay/widgets/SceneViewHost';

const widget = createSceneViewHost({
  id: 'my-scene-widget',
  position: { anchor: 'center' },
  visibility: { trigger: 'always' },
  sceneViewId: 'scene-view:comic-panels', // Or omit for default
  layout: 'strip',
  showCaption: true,
});
```

The `comic-panel` widget type in overlay configs uses `SceneViewHost` internally.

---

## Bundle-Driven Plugin System

PixSim7 supports a bundle-driven plugin system that allows plugins to be built independently and loaded at runtime via manifest discovery. This is in addition to the traditional hardcoded import approach.

### Overview

The bundle system provides:
- **Drop-in plugins**: Place a bundle in the plugins directory and it's automatically loaded
- **Independent builds**: Each plugin can be built and versioned separately
- **Third-party plugins**: External developers can create plugins without modifying the main codebase
- **Hot reloading**: Plugins can be updated without rebuilding the entire application

### Bundle Structure

```
dist/plugins/{family}/{plugin-id}/
├── manifest.json    # Plugin metadata (JSON)
└── plugin.js        # Bundled ES module
```

### Building Plugin Bundles

Use the build script to create plugin bundles:

```bash
# Build a specific plugin
pnpm build:plugin scene/comic-panel-view

# Build all plugins
pnpm build:plugins
```

### Manifest Format

Plugin manifests are JSON files that describe the plugin:

```json
{
  "id": "scene-view:comic-panels",
  "name": "Comic Panel View",
  "version": "1.0.0",
  "type": "ui-overlay",
  "main": "plugin.js",
  "sceneView": {
    "id": "scene-view:comic-panels",
    "displayName": "Comic Panels",
    "surfaces": ["overlay", "hud", "panel"],
    "default": true
  }
}
```

### Loading Flow

1. **Bootstrap**: During app initialization, `pluginBootstrapModule` runs
2. **Hardcoded imports**: Traditional plugin imports are loaded first
3. **Bundle discovery**: `loadPluginBundles()` scans `dist/plugins/**/manifest.json`
4. **Dynamic loading**: Plugin bundles are loaded via ES module imports
5. **Registration**: Plugins are registered with appropriate registries

### Backward Compatibility

The bundle system is additive:
- Existing hardcoded plugin imports continue to work
- Bundle-loaded plugins are loaded in addition to hardcoded ones
- No breaking changes to existing plugin APIs

### Creating a Bundleable Plugin

1. Create plugin directory under `src/plugins/{family}/{plugin-id}/`
2. Add `manifest.ts` with plugin metadata
3. Add `index.tsx` as the entry point
4. Build with `pnpm build:plugin {family}/{plugin-id}`

See [Plugin Bundle Format](./PLUGIN_BUNDLE_FORMAT.md) for detailed documentation.

---

## Plugin Naming Conventions

To maintain consistency across the codebase and avoid duplication drift, follow these conventions when creating new plugins.

### Folder Structure

```
apps/main/src/plugins/{family}/{plugin-name}/
```

**Rules:**
- `{family}` - Plugin category (e.g., `scene`, `world`, `brain`)
- `{plugin-name}` - Kebab-case folder name (e.g., `comic-panel-view`, `relationship-tracker`)

**Examples:**
```
plugins/scene/comic-panel-view/
plugins/scene/storyboard-view/
plugins/world/location-browser/
```

### Plugin ID Format

Plugin IDs use the format: `{family}:{kebab-case-name}`

**Rules:**
- Family prefix matches the folder structure
- Use colon (`:`) separator
- Use kebab-case for the name portion
- IDs must be unique across all plugins

**Examples:**
```
scene-view:comic-panels
scene-view:storyboard-view
world-tool:location-browser
```

**Note:** The folder name and ID name don't have to match exactly (e.g., folder `comic-panel-view` vs ID `scene-view:comic-panels`), but consistency is recommended.

### Manifest Field Standards

Source manifests (`manifest.ts`) should use these values:

```typescript
export const manifest: SceneViewPluginManifest = {
  id: 'scene-view:my-plugin',           // Family:name format
  name: 'My Plugin',                     // Display name (title case)
  version: '1.0.0',                      // Semantic version
  type: 'ui-overlay',                    // Plugin type
  main: 'plugin.js',                     // Build output (not index.ts)
  // ... other fields
};
```

**Important:** The `main` field should reference the build output (`plugin.js`), not the source file (`index.ts`). The build script will bundle `index.ts` into `plugin.js`.

### Loading Strategy

PixSim7 uses two plugin loading mechanisms:

#### 1. Hardcoded Imports (Development)

Built-in plugins are loaded via hardcoded imports in bootstrap files:

```typescript
// lib/plugins/bootstrapSceneViews.ts
await import('../../plugins/scene/comic-panel-view');
```

**When to use:**
- Built-in plugins shipped with the application
- Plugins under active development
- Plugins that need to be available immediately

**Advantages:**
- Faster load times (bundled with main app)
- TypeScript type checking
- Hot module reloading in dev mode

#### 2. Bundle Discovery (Distribution)

Plugins can be built as bundles and discovered at runtime:

```typescript
// Scans dist/plugins/**/manifest.json
const bundles = await loadPluginBundles();
```

**When to use:**
- Third-party plugins
- Optional plugins
- Plugins that can be added/removed without rebuilding

**Advantages:**
- Drop-in installation
- Independent versioning
- Can be distributed separately

#### Loading Order

1. Hardcoded imports load first during app initialization
2. Bundle discovery runs after hardcoded plugins
3. Duplicate plugin IDs are detected and logged (first registration wins)

**Note:** Currently, built-in plugins use hardcoded imports. The bundle system is infrastructure for future third-party plugins. To build bundles for testing, run `pnpm build:plugin {family}/{plugin-name}` (requires dependencies installed).

---

## Using Scene View Widgets in Overlay Editor

Scene view widgets display scene content (comic panels, storyboards, etc.) in overlays and HUD. The `scene-view` widget type replaced the legacy `comic-panel` type.

### Widget Type Migration

| Old Type (Deprecated) | New Type | Notes |
|-----------------------|----------|-------|
| `comic-panel` | `scene-view` | Backward compatible alias |

**Recommended configuration:**

```typescript
{
  type: 'scene-view',
  sceneViewId: 'scene-view:comic-panels', // Which scene view plugin to use
  layout: 'strip',                         // single, strip, grid2
  showCaption: true,                       // Show/hide captions
  // ... other overlay widget fields
}
```

**Legacy configuration (still supported):**

```typescript
{
  type: 'comic-panel',  // Maps to scene-view internally
  layout: 'strip',
  showCaption: true,
}
```

### Selecting Different Scene Views

The `sceneViewId` field determines which plugin renders the content:

```typescript
// Use comic panel view
{ type: 'scene-view', sceneViewId: 'scene-view:comic-panels' }

// Use future storyboard view
{ type: 'scene-view', sceneViewId: 'scene-view:storyboard' }

// Use default view (first registered)
{ type: 'scene-view' } // sceneViewId defaults to first available
```

### Overlay Editor Support

The overlay editor provides type-specific properties for scene-view widgets:

- **Layout**: Choose between single panel, strip, or grid layouts
- **Show Captions**: Toggle caption display
- **Scene View ID**: (Future) Select which scene view plugin to use

**Implementation:**
- Component: `apps/main/src/components/overlay-editor/TypeSpecificProperties.tsx`
- Handler: `SceneViewProperties` (renamed from `ComicPanelProperties`)
- Supported types: Both `'scene-view'` and `'comic-panel'` (backward compat)

### Host-Plugin Architecture

Scene view widgets use a host-plugin delegation pattern:

```
SceneViewHost (Generic Widget)
      ↓
  sceneViewRegistry.get(sceneViewId)
      ↓
  Plugin Render Component
      ↓
  Scene Content (panels, etc.)
```

**Key files:**
- `apps/main/src/lib/ui/overlay/widgets/SceneViewHost.tsx` - Generic host widget
- `apps/main/src/lib/plugins/sceneViewPlugin.ts` - Plugin registry and types
- `apps/main/src/plugins/scene/comic-panel-view/` - Example plugin implementation

This architecture allows new scene view modes to be added as plugins without modifying the core widget system.

---

## Related Documentation

- [Plugin Bundle Format](./PLUGIN_BUNDLE_FORMAT.md)
- [Gallery Tools Plugin](./GALLERY_TOOLS_PLUGIN.md)
- [Graph Renderer Plugins](./GRAPH_RENDERER_PLUGINS.md)
- [Gizmo Surfaces and Debug Dashboards](./GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md)
- [Session Helper Reference](./SESSION_HELPER_REFERENCE.md)
- [Interaction Authoring Guide](./INTERACTION_AUTHORING_GUIDE.md)
- [App Capability Registry](./APP_CAPABILITY_REGISTRY.md)
- [Comic Panels System](./COMIC_PANELS.md)
