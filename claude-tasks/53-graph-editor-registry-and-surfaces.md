**Task 53: Graph Editor Registry & Modular Surfaces**

> **For Agents (How to use this file)**
> - This task makes **graph editor UIs** (scene graph, arc graph, etc.) modular and registry-driven, similar to the workspace panel system.
> - It does **not** change the underlying node/edge model (that’s already modular via nodeTypeRegistry and plugins).
> - Focus is on *editor surfaces*: GraphPanel, ArcGraphPanel, future graph UIs.
> - Read these first:
>   - `apps/main/src/components/graph/*` – Current graph renderers and helpers
>   - `apps/main/src/components/arc-graph/ArcGraphPanel.tsx` – Modern arc graph editor
>   - `apps/main/src/components/legacy/GraphPanel.tsx` – Legacy scene graph editor
>   - `apps/main/src/stores/graphStore/index.ts` – Scene graph store
>   - `apps/main/src/lib/panels/panelRegistry.ts` – Panel registry pattern
>   - `apps/main/src/lib/plugins/pluginSystem.ts` – Unified plugin system
>   - `apps/main/src/lib/plugins/registryBridge.ts` – Bridges plugin system to existing registries

---

## Context

Current state:

- **Node model is modular**:
  - Node types via `nodeTypeRegistry` (`@pixsim7/shared.types`).
  - Node renderers via `nodeRendererRegistry` (`apps/main/src/lib/graph/nodeRendererRegistry.ts`).
  - Generation, relationships, and validation live in `@pixsim7/game.engine`.
- **Graph editor UIs are not modular**:
  - `GraphPanel` (legacy) and `ArcGraphPanel` (modern) are separate React components.
  - Different routes use different editors (`/ArcGraph` vs workspace panel).
  - There’s no registry or plugin way to add/replace a graph editor surface.

We want graph editors to behave more like panels:

- Multiple editor surfaces (scene graph, arc graph, progression graph, debug graphs).
- A registry that describes each editor’s capabilities and store.
- Optional plugin support for new graph editors.
- Workspace/panels can pick which graph editor surface to show.

This task introduces a **Graph Editor Registry** and connects it to the existing plugin + panel systems.

---

## Goals

1. **Define a GraphEditorRegistry** to register and look up graph editor surfaces.
2. **Register existing graph editors** (scene graph, arc graph) in the registry.
3. **Integrate with the panel system**: allow panels to choose a graph editor surface dynamically.
4. **Optionally bridge to the plugin system** so plugins can contribute graph editors.

Non-goals:
- No changes to the core graph store schema (`graphStore` types).
- No changes to node type or renderer registries.
- No new graph algorithms or features; focus is on *wiring and modularity*.

---

## Phase Checklist

- [ ] **Phase 53.1 – Graph Editor Definition & Registry**
- [ ] **Phase 53.2 – Register Existing Graph Editors**
- [ ] **Phase 53.3 – Panel & Workspace Integration**
- [ ] **Phase 53.4 – Plugin System Bridge (Optional)**
- [ ] **Phase 53.5 – UX & Docs**

**Overall Status:** Waiting – start after Task 50 (panel registry) is stable.

---

## Phase 53.1 – Graph Editor Definition & Registry

**Goal:** Define a canonical `GraphEditorDefinition` type and implement a registry with a similar pattern to `panelRegistry`.

### A. Types

Create a shared type for graph editors:

```typescript
export type GraphEditorId =
  | 'scene-graph-v2'
  | 'arc-graph'
  | string;

export interface GraphEditorDefinition {
  id: GraphEditorId;
  label: string;
  description?: string;
  icon?: string;
  category?: 'core' | 'world' | 'arc' | 'debug' | 'custom';

  /** React component that renders the editor surface */
  component: React.ComponentType<any>;

  /** Backing store ID, for diagnostics and binding */
  storeId: 'scene-graph-v2' | 'arc-graph' | string;

  /** Supported modes / features */
  supportsMultiScene?: boolean;
  supportsWorldContext?: boolean;
  supportsPlayback?: boolean;

  /** Optional: default route or panel ID that hosts this editor */
  defaultRoute?: string;
  defaultPanelId?: string;
}
```

### B. Registry API

Add a registry module:
- `apps/main/src/lib/graph/editorRegistry.ts`

API:

```typescript
import type { GraphEditorDefinition, GraphEditorId } from './types';

class GraphEditorRegistry {
  private editors = new Map<GraphEditorId, GraphEditorDefinition>();

  register(def: GraphEditorDefinition): void {
    this.editors.set(def.id, def);
  }

  unregister(id: GraphEditorId): void {
    this.editors.delete(id);
  }

  get(id: GraphEditorId): GraphEditorDefinition | undefined {
    return this.editors.get(id);
  }

  getAll(): GraphEditorDefinition[] {
    return [...this.editors.values()];
  }

  getByCategory(category: string): GraphEditorDefinition[] {
    return this.getAll().filter(e => e.category === category);
  }
}

export const graphEditorRegistry = new GraphEditorRegistry();
```

### Files to Add/Modify

- [ ] `apps/main/src/lib/graph/editorRegistry.ts` – Registry implementation.
- [ ] `apps/main/src/lib/graph/types.ts` – `GraphEditorId` / `GraphEditorDefinition` (or co-locate with registry if simpler).

### Verification

- [ ] Able to register and retrieve definitions in unit tests or a small debug hook.
- [ ] Registry exposes all registered editors with `getAll`.

---

## Phase 53.2 – Register Existing Graph Editors

**Goal:** Register `GraphPanelWithProvider` and `ArcGraphPanel` in the new registry, with minimal behavioral changes.

### A. Scene Graph Editor (Legacy/Core)

Editor: `apps/main/src/components/legacy/GraphPanel.tsx`:
- The exported `GraphPanelWithProvider` is the wrapper currently used by the workspace panel system.

Register in `editorRegistry` (e.g., in a new initializer file or at module load time):

```typescript
import { graphEditorRegistry } from './editorRegistry';
import { GraphPanelWithProvider } from '../../components/legacy/GraphPanel';

graphEditorRegistry.register({
  id: 'scene-graph-v2',
  label: 'Scene Graph Editor',
  description: 'Multi-scene node editor for runtime scenes',
  icon: 'node-graph',
  category: 'core',
  component: GraphPanelWithProvider,
  storeId: 'scene-graph-v2',
  supportsMultiScene: true,
  supportsWorldContext: true,
  supportsPlayback: true,
  defaultPanelId: 'graph',
});
```

### B. Arc Graph Editor (Modern)

Editor: `apps/main/src/components/arc-graph/ArcGraphPanel.tsx`

Register:

```typescript
import { ArcGraphPanel } from '../../components/arc-graph/ArcGraphPanel';

graphEditorRegistry.register({
  id: 'arc-graph',
  label: 'Arc Graph Editor',
  description: 'Arc/quest progression editor',
  icon: 'arc-graph',
  category: 'arc',
  component: ArcGraphPanel,
  storeId: 'arc-graph', // or specific store if/when added
  supportsMultiScene: true,
  supportsWorldContext: true,
  supportsPlayback: false,
  defaultRoute: '/arc-graph',
});
```

### Files to Add/Modify

- [ ] `apps/main/src/lib/graph/registerEditors.ts` – Helper that registers built-in editors.
- [ ] `apps/main/src/modules/workspace/index.ts` or similar – Call `registerEditors()` on startup (similar to `initializePanels` / `initializeWidgets`).

### Verification

- [ ] `graphEditorRegistry.getAll()` returns both `scene-graph-v2` and `arc-graph`.
- [ ] No behavioral regression: routes and panels still render the same components as before.

---

## Phase 53.3 – Panel & Workspace Integration

**Goal:** Allow workspace panels to choose which graph editor surface to use via the registry, rather than hardcoding `GraphPanelWithProvider`.

### A. Graph Panel Using Editor Registry

Currently, the core workspace panel for graphs is registered via `corePanelsPlugin` with:

```ts
{
  id: 'graph',
  title: 'Graph',
  component: GraphPanelWithProvider,
  // ...
}
```

Update this to use a small **GraphEditorHost** that looks up the active editor:

- Add `GraphEditorHost.tsx`:

```typescript
import { useMemo } from 'react';
import { graphEditorRegistry } from '../../lib/graph/editorRegistry';

export interface GraphEditorHostProps {
  editorId?: string; // optional; defaults to 'scene-graph-v2'
}

export function GraphEditorHost({ editorId = 'scene-graph-v2' }: GraphEditorHostProps) {
  const editorDef = useMemo(() => graphEditorRegistry.get(editorId), [editorId]);

  if (!editorDef) {
    return (
      <div className="p-4 text-sm text-red-500">
        Unknown graph editor: <code>{editorId}</code>
      </div>
    );
  }

  const EditorComponent = editorDef.component;
  return <EditorComponent />;
}
```

- In `corePanelsPlugin.tsx`, register `GraphEditorHost` instead of `GraphPanelWithProvider`:

```ts
import { GraphEditorHost } from '../../components/graph/GraphEditorHost';

{
  id: 'graph',
  title: 'Graph',
  component: GraphEditorHost,
  // ...
}
```

### B. Future: Choose Editor Variant per Profile

Optionally (future enhancement):
- Add a setting in `panelConfigStore` or workspace profile config:
  - `graphEditorId?: GraphEditorId;`
- Pass that into `GraphEditorHost` via panel context or props so different profiles can use different editors (e.g., Scene Graph vs Arc Graph as default).

### Files to Add/Modify

- [ ] `apps/main/src/components/graph/GraphEditorHost.tsx`
- [ ] `apps/main/src/lib/panels/corePanelsPlugin.tsx` – use `GraphEditorHost` for `'graph'` panel.
- [ ] Optionally `panelConfigStore.ts` / `WorkspaceProfileManager.tsx` if adding a per-profile selector.

### Verification

- [ ] Workspace “Graph” panel still renders the scene graph editor by default.
- [ ] Swapping `editorId` in `GraphEditorHost` to `'arc-graph'` shows `ArcGraphPanel`.

---

## Phase 53.4 – Plugin System Bridge (Optional)

**Goal:** Allow plugins to contribute new graph editor surfaces via the existing unified plugin system.

### A. Plugin Family & Types

Extend `PluginFamily` in `apps/main/src/lib/plugins/pluginSystem.ts`:

```ts
export type PluginFamily =
  | 'world-tool'
  | 'helper'
  | 'interaction'
  | 'gallery-tool'
  | 'node-type'
  | 'renderer'
  | 'ui-plugin'
  | 'graph-editor';
```

Add metadata extension:

```ts
export interface PluginMetadataExtensions {
  // ...
  'graph-editor': {
    storeId?: string;
    category?: string;
  };
}
```

Define a `GraphEditorPlugin` type (e.g. under `lib/graph/types.ts` or `lib/plugins/types.ts`):

```ts
export interface GraphEditorPlugin {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  category?: string;
  storeId?: string;
  component: React.ComponentType<any>;
}
```

### B. Registry Bridge

Add bridge functions to `apps/main/src/lib/plugins/registryBridge.ts`:

```ts
import { graphEditorRegistry, type GraphEditorDefinition } from '../graph/editorRegistry';

export function registerGraphEditor(
  editor: GraphEditorDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  graphEditorRegistry.register(editor);

  pluginCatalog.register({
    id: editor.id,
    name: editor.label,
    family: 'graph-editor',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: editor.category,
    storeId: editor.storeId,
    ...options.metadata,
  } as ExtendedPluginMetadata<'graph-editor'>);
}
```

### C. Discovery / Plugin Loader

Add a discovery config for graph editors in `pluginSystem.ts` (similar to other families), if/when you want dynamic loading from `apps/main/src/plugins/graphEditors/*`.

### Files to Add/Modify

- [ ] `apps/main/src/lib/plugins/pluginSystem.ts` – add `graph-editor` family.
- [ ] `apps/main/src/lib/plugins/registryBridge.ts` – add `registerGraphEditor`.
- [ ] Optional: `apps/main/src/lib/plugins/pluginLoader.ts` – configure discovery for graph editor plugins.

### Verification

- [ ] A sample graph editor plugin can be registered and appears in `graphEditorRegistry`.
- [ ] PluginBrowserPanel (from Task 52) can show graph-editor plugins via the plugin catalog.

---

## Phase 53.5 – UX & Docs

**Goal:** Make graph editor selection discoverable and documented.

### UX

- [ ] **Graph Editor Selector (optional)**
  - In a dev-only or advanced workspace settings area, allow choosing the default graph editor surface:
    - “Scene Graph (v2)” (scene-graph-v2)
    - “Arc Graph”
    - Any plugin-provided graph editors (`graphEditorRegistry.getAll()`).
  - Store this preference at:
    - Workspace profile level, or
    - Global editor setting.

- [ ] **Panel Tooltip / Info**
  - For the Graph panel, show which editor is active in the header tooltip or small label:
    - e.g., “Graph – Scene Graph Editor” vs “Graph – Arc Graph Editor”.

### Docs

- [ ] Update `docs/NODE_EDITOR_DEVELOPMENT.md`:
  - Add a short section “Graph Editor Surfaces & Registry”.
  - Explain that node types/ports are separate from which editor surface is used.
- [ ] Update `docs/SYSTEM_OVERVIEW.md`:
  - Mention that graph editors are registry-driven and can be extended by plugins.
- [ ] Optional: add a small `docs/GRAPH_EDITOR_REGISTRY.md` focused on this system.

### Verification

- [ ] It’s clear from UI/docs how to:
  - Switch between Scene Graph and Arc Graph (where enabled).
  - Add new graph editor surfaces via plugins (if implemented).
- [ ] No confusion between node type registry (content) vs graph editor registry (UI).

---

## Success Criteria

- Graph editor surfaces (Scene Graph, Arc Graph, etc.) are registered in a **GraphEditorRegistry** analogous to the panel registry.
- Workspace and panel systems use a **GraphEditorHost** that resolves the editor via the registry instead of hardcoding a specific component.
- Optional plugin bridge allows plugins to contribute new graph editor surfaces without touching core code.
- No changes to core graph data structures or node/renderer registries; this is purely about **UI modularity** and **extensibility**.

