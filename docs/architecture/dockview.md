## Dockview / Panel System Snapshot

> **Last reviewed:** March 2026. All dockview containers now use the unified `dockId` + `availableIn` pattern. Panel group system removed in favor of `layoutSpec` on `PanelHostDockview`.

### Goals
- One SmartDockview API for all spaces (workspace, control center, asset viewer, custom containers).
- Sub-panels declare `availableIn` — the single source of truth for discovery.
- Context menus, scopes, and capabilities remain shared and optional.

### Current Dockview Containers

All containers follow the same pattern: `dockId` on `PanelHostDockview`, sub-panels discovered via `availableIn`.

| Container | `dockId` | Layout | Storage Key |
|---|---|---|---|
| Workspace | `workspace` | inline function | `dockview:workspace:v4` |
| Control Center | `control-center` | persisted only | `dockview:control-center:v6` |
| Asset Viewer | `asset-viewer` | `createDefaultLayout()` | `dockview:asset-viewer:v5` |
| Gizmo Lab | `gizmo-lab` | `layoutSpec` | `gizmo-lab-dockview-layout:v1` |
| Prompt Authoring | `prompt-authoring` | `layoutSpec` | `dockview:prompt-authoring:v1` |

### PanelHostDockview Props (simplified)
- `dockId?: string` - filter sub-panels by `availableIn` (recommended).
- `panels?: string[]` - explicit panel IDs (takes precedence over dockId).
- `layoutSpec?: LayoutSpecEntry[]` - declarative default layout (see below).
- `defaultLayout?: (api) => void` - imperative layout function (overrides layoutSpec).
- `storageKey: string` - localStorage persistence key.
- `panelManagerId?: string` - ID for cross-dockview actions/context menu.
- `enableContextMenu?: boolean` - enable right-click panel menu.
- `resolvePanelTitle?` - custom title resolver (defaults to registry lookup).
- `resolvePanelPosition?` - position resolver for panels added after initial layout.

### Declarative Layout Spec

`layoutSpec` replaces hand-coded `defaultLayout` functions for most containers:

```typescript
const LAYOUT_SPEC: LayoutSpecEntry[] = [
  { id: 'my-navigator' },
  { id: 'my-editor', direction: 'right', ref: 'my-navigator' },
  { id: 'my-assets', direction: 'right', ref: 'my-editor' },
];

<PanelHostDockview
  dockId="my-dock"
  storageKey="dockview:my-dock:v1"
  layoutSpec={LAYOUT_SPEC}
/>
```

Panels are added in order; each positions relative to a `ref` panel via `direction` (`right`, `left`, `above`, `below`, `within`). Titles auto-resolve from the panel registry.

### Creating a New Dockview Container

1. Define the parent panel in `domain/definitions/my-container/index.ts` with `orchestration.type: 'dockview-container'`
2. Create sub-panel definitions in `domain/definitions/my-sub-panel/index.ts` with `availableIn: ['my-container']`
3. In the parent's component, render `<PanelHostDockview dockId="my-container" layoutSpec={[...]} />`
4. Done — sub-panels are auto-discovered, layout is declarative

### Panel Authoring Checklist
- Set `availableIn: ['dock-id']` to scope a sub-panel to a specific dock.
- Set `category` for menu grouping.
- Prefer `instances: "single" | "multiple" | { max }` over `supportsMultipleInstances`.
- Use `layoutSpec` for default layout; fall back to `defaultLayout` function for complex dynamic layouts.
- Panel titles auto-resolve from the registry — no need for custom `resolvePanelTitle` unless overriding.
