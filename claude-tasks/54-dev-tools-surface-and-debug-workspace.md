**Task 54: Dev Tools Surface & Debug Workspace**

> **For Agents (How to use this file)**
> - This task creates a **first-class Dev Tools surface** in the workspace, built on the same registry + panel architecture as panels and graph editors.
> - It unifies scattered debug tools (session viewer, plugin harnesses, dependency graphs, etc.) into a coherent, discoverable UX.
> - It should reuse existing panel, plugin, and builder infrastructure where possible; no new core models or backend schemas.
> - Read these first:
>   - `docs/APP_MAP.md` – High-level app map.
>   - `docs/SYSTEM_OVERVIEW.md` – Overall systems, including plugin & graph architecture.
>   - `claude-tasks/06-app-map-and-dev-panel.md` – App Map / dev view context.
>   - `claude-tasks/18-frontend-ui-structure-and-consistency-audit.md` – UI structure & dev tools notes.
>   - `apps/main/src/routes/PluginWorkspace.tsx` – Plugin dev workspace + harnesses.
>   - `apps/main/src/components/legacy/SessionStateViewer.tsx` – Session debug panel.
>   - `apps/main/src/components/dev/*` – Existing dev/diagnostic panels.

---

## Context

PixSim7 has a growing set of **developer-facing tools**:

- Plugin development:
  - `PluginWorkspaceRoute` (route) – plugin browser + local plugin projects + test harnesses.
  - Test harness components (interaction, node type, gallery tool, world tool) in `components/plugins/PluginTestHarnesses.tsx`.
- Session and world debugging:
  - `SessionStateViewer` in `components/legacy/SessionStateViewer.tsx`.
  - World context selectors, relationship previews, generation validators.
- Graph and architecture views:
  - Dev-focused graphs in `components/dev` (e.g. `DependencyGraphPanel`, App Map views).
  - Graph architecture docs and validation tasks (Tasks 43, 47, 48).

These tools are powerful but:
- Scattered across routes and legacy/unused components.
- Not integrated into the main workspace presets/profiles.
- Hard to discover and hard to keep consistent.

This task creates a **Dev Tools Surface**:

- A registry of dev tools (panels, routes, harnesses).
- A dedicated **Dev Workspace** preset (or set of presets).
- A small, coherent entry point (Dev menu / Dev panel) in the main workspace.

---

## Goals

1. **Define a DevTool registry** for developer/debug tools (sessions, plugins, graphs, metrics).
2. **Register existing dev tools** (session viewer, plugin workspace, dependency graphs) into that registry.
3. **Provide a Dev Workspace preset** with a curated layout for debugging.
4. **Expose a Dev Tools surface in the workspace** (panel + menu) for discovery and navigation.
5. Optionally, **integrate with the plugin system** so dev tools can be contributed as plugins.

Non-goals:
- No changes to backend schemas or game models.
- No new test harness frameworks beyond what already exists.
- No generic “run arbitrary code” surfaces beyond existing plugin harnesses.

---

## Phase Checklist

- [ ] **Phase 54.1 – Dev Tool Definition & Registry**
- [ ] **Phase 54.2 – Register Existing Dev Tools**
- [ ] **Phase 54.3 – Dev Workspace Presets & Navigation**
- [ ] **Phase 54.4 – Plugin Integration (Optional)**
- [ ] **Phase 54.5 – UX Polish & Docs**

**Overall Status:** Not started – greenfield, but builds heavily on existing panel & plugin registries.

---

## Phase 54.1 – Dev Tool Definition & Registry

**Goal:** Define a canonical `DevToolDefinition` type and implement a registry for dev tools, similar to `panelRegistry` and `graphEditorRegistry`.

### A. Types

Create a dev tool type definition:

```typescript
export type DevToolId =
  | 'session-state-viewer'
  | 'plugin-workspace'
  | 'dependency-graph'
  | 'app-map'
  | 'generation-debug'
  | string;

export interface DevToolDefinition {
  id: DevToolId;
  label: string;
  description?: string;
  icon?: string;
  category?: 'session' | 'plugins' | 'graph' | 'generation' | 'world' | 'debug' | 'misc';

  /** React component used when the tool is shown as a panel */
  panelComponent?: React.ComponentType<any>;

  /** Optional route for full-page dev tools */
  routePath?: string;

  /** Optional tags for filtering/search */
  tags?: string[];

  /** Whether this tool is safe for non-dev users (defaults to false) */
  safeForNonDev?: boolean;
}
```

### B. Registry API

Add a registry module:
- `apps/main/src/lib/devtools/devToolRegistry.ts`

API:

```typescript
export class DevToolRegistry {
  private tools = new Map<DevToolId, DevToolDefinition>();

  register(def: DevToolDefinition): void;
  unregister(id: DevToolId): void;
  get(id: DevToolId): DevToolDefinition | undefined;
  getAll(): DevToolDefinition[];
  getByCategory(category: string): DevToolDefinition[];
  search(query: string): DevToolDefinition[];
}

export const devToolRegistry = new DevToolRegistry();
```

### Files to Add/Modify

- [ ] `apps/main/src/lib/devtools/devToolRegistry.ts` – Dev tool registry.
- [ ] `apps/main/src/lib/devtools/types.ts` – `DevToolId` / `DevToolDefinition`.

### Verification

- [ ] Unit tests or a debug hook show registry can register and query tools.
- [ ] No dev tools are yet registered; that’s Phase 54.2.

---

## Phase 54.2 – Register Existing Dev Tools

**Goal:** Register existing dev tool components and routes into `devToolRegistry`.

### A. Identify Dev Tools

Core candidates:
- **Session & world state:**
  - `apps/main/src/components/legacy/SessionStateViewer.tsx`
- **Plugin development:**
  - `apps/main/src/routes/PluginWorkspace.tsx`
  - `apps/main/src/components/plugins/PluginTestHarnesses.tsx`
- **Architecture & graphs:**
  - Dependency graph / App Map panels in `apps/main/src/components/dev/*`
  - Graph architecture/debug panels referenced in Task 43 / 47 / 48
- **Generation & relationships debug:**
  - Any generation preview/validator UIs (e.g., a small wrapper around `GenerationNodeEditor` validation views).

### B. Registration

In a central initializer (e.g., `apps/main/src/lib/devtools/registerDevTools.ts`):

```typescript
import { devToolRegistry } from './devToolRegistry';
import { SessionStateViewer } from '../../components/legacy/SessionStateViewer';
import { PluginWorkspaceRoute } from '../../routes/PluginWorkspace';
import { DependencyGraphPanel } from '../../components/dev/DependencyGraphPanel';
// ...other imports as needed

export function registerDevTools(): void {
  devToolRegistry.register({
    id: 'session-state-viewer',
    label: 'Session State Viewer',
    description: 'Inspect GameSession flags, relationships, and world time',
    icon: '🧪',
    category: 'session',
    panelComponent: SessionStateViewer,
    tags: ['session', 'debug', 'state'],
  });

  devToolRegistry.register({
    id: 'plugin-workspace',
    label: 'Plugin Workspace',
    description: 'Develop and test plugins (UI, interactions, node types, tools)',
    icon: '🔌',
    category: 'plugins',
    routePath: '/dev/plugins',
    tags: ['plugins', 'dev'],
  });

  // ...similar entries for dependency graph, app map, generation debug, etc.
}
```

Initialize once on app startup (similar to `initializePanels` / `registerGraphEditors`).

### Files to Add/Modify

- [ ] `apps/main/src/lib/devtools/registerDevTools.ts`
- [ ] `apps/main/src/main.tsx` or `apps/main/src/components/layout/*` – call `registerDevTools()` at startup.

### Verification

- [ ] `devToolRegistry.getAll()` lists all expected tools.
- [ ] No behavior changes yet; existing routes/panels still work as before.

---

## Phase 54.3 – Dev Workspace Presets & Navigation

**Goal:** Create one or more **Dev Workspace profiles** and a clear entry point in the workspace UI.

### A. Dev Workspace Presets

Use `WorkspacePreset` in `workspaceStore.ts` to add presets like:

- `dev-default` – Graph + Session Viewer + Plugin Workspace + Health.
- `dev-plugins` – Plugin Workspace + harness panels.
- `dev-sessions` – Graph + Session Viewer + generation debug.

Example preset:

```typescript
const defaultPresets: WorkspacePreset[] = [
  // existing presets...
  {
    id: 'dev-default',
    name: 'Dev – Default Debug',
    description: 'Graph, session state, plugins, and health',
    icon: '🧪',
    isDefault: false,
    layout: {
      direction: 'row',
      first: 'graph',
      second: {
        direction: 'column',
        first: 'health',
        second: 'settings', // or a dedicated DevTools panel
        splitPercentage: 50,
      },
      splitPercentage: 60,
    },
    graphEditorId: 'scene-graph-v2',
  },
];
```

### B. Dev Tools Panel

Add a **Dev Tools panel** that lists dev tools from the registry:
- File: `apps/main/src/components/dev/DevToolsPanel.tsx`
- Features:
  - List dev tools by category and tags.
  - Allow opening tool panels (where `panelComponent` exists).
  - Provide “Open in Route” buttons for tools with `routePath`.

Register this panel in:
- `corePanelsPlugin.tsx` as e.g. `id: 'dev-tools'`.
- `panelConfigStore.ts` with an appropriate category (e.g. `'development'`).

### C. Navigation Entry

In the main workspace UI (e.g., some layout or navigation component):
- Add a **Dev** menu/dropdown entry:
  - “Open Dev Workspace” → loads `dev-default` preset.
  - “Dev Tools Panel” → opens `dev-tools` as a floating panel.

### Files to Add/Modify

- [ ] `apps/main/src/components/dev/DevToolsPanel.tsx`
- [ ] `apps/main/src/lib/panels/corePanelsPlugin.tsx` – register `dev-tools` panel.
- [ ] `apps/main/src/stores/panelConfigStore.ts` – default config for `dev-tools`.
- [ ] `apps/main/src/stores/workspaceStore.ts` – add dev-focused presets.
- [ ] Appropriate layout/nav components – link to Dev workspace / Dev panel.

### Verification

- [ ] Dev workspace presets are selectable and load expected layouts.
- [ ] Dev Tools panel shows all registered tools and opens them correctly.

---

## Phase 54.4 – Plugin Integration (Optional)

**Goal:** Allow dev tools themselves to be contributed via the plugin system.

### A. Plugin Family & Registry Bridge

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
  | 'graph-editor'
  | 'dev-tool';
```

Add metadata extension:

```ts
export interface PluginMetadataExtensions {
  // ...
  'dev-tool': {
    category?: string;
  };
}
```

In `registryBridge.ts`, add:

```ts
export function registerDevTool(
  def: DevToolDefinition,
  options: RegisterWithMetadataOptions = {}
): void {
  devToolRegistry.register(def);

  pluginCatalog.register({
    id: def.id,
    name: def.label,
    family: 'dev-tool',
    origin: options.origin ?? 'plugin-dir',
    activationState: options.activationState ?? 'active',
    canDisable: options.canDisable ?? true,
    category: def.category,
    ...options.metadata,
  } as ExtendedPluginMetadata<'dev-tool'>);
}
```

### B. Plugin Browser Integration

Update `PluginBrowserPanel` (Task 52) to:
- Show **Dev Tools** as a plugin category.
- Allow enabling/disabling dev tools (if supported).

### Files to Add/Modify

- [ ] `apps/main/src/lib/plugins/pluginSystem.ts` – add `'dev-tool'` family.
- [ ] `apps/main/src/lib/plugins/registryBridge.ts` – add `registerDevTool`.
- [ ] `apps/main/src/components/settings/PluginBrowserPanel.tsx` – show dev-tool plugins.

### Verification

- [ ] A sample dev-tool plugin can be registered and appears in Dev Tools panel.
- [ ] Enabling/disabling the plugin affects availability in `devToolRegistry`.

---

## Phase 54.5 – UX Polish & Docs

**Goal:** Make the Dev Tools experience discoverable, pleasant, and documented.

### UX Polish

- [ ] **Dev Workspace entry**
  - Clear “Dev” entry in workspace chrome (menu/toolbar).
  - Tooltip or small label indicating which dev preset is active (if any).

- [ ] **Tool discovery**
  - In DevToolsPanel, group dev tools by category (session, plugins, graph, generation, world).
  - Provide search/filter by id, label, tags.

- [ ] **Safe defaults**
  - Hide advanced or potentially dangerous tools behind a toggle (e.g., “Show experimental tools”).
  - Default Dev preset should not auto-open tools that can mutate data without user interaction.

### Docs

- [ ] Update `docs/SYSTEM_OVERVIEW.md`:
  - Add a short section “Dev Tools Surface & Debug Workspace”.
  - Link to Dev workspace presets and DevToolsPanel.

- [ ] Update `docs/APP_MAP.md`:
  - Add Dev Tools / Plugin Workspace to the app map.

- [ ] Optional: add `docs/DEVTOOLS_AND_DEBUG_WORKSPACE.md`:
  - Document available dev tools, how to open them, and when to use which.

### Verification

- [ ] From a cold start, a developer can:
  - Discover the Dev workspace entry.
  - Open the Dev Tools panel.
  - Find a specific tool (e.g., SessionStateViewer) via search/filter.
  - Optionally, open PluginWorkspace from Dev Tools.
- [ ] Docs accurately describe the final UX and link to relevant files.

---

## Success Criteria

- Dev tools are discoverable and organized via a **DevToolRegistry** and a **DevToolsPanel**.
- There is at least one **Dev Workspace preset** that makes debugging sessions, graphs, and plugins convenient.
- Existing dev tools (SessionStateViewer, PluginWorkspace, dependency graphs) are wired into the registry and usable without hunting for routes.
- Optional plugin integration allows new dev tools to be contributed with minimal core-code changes.
- Documentation clearly explains how to use and extend the Dev Tools surface.

