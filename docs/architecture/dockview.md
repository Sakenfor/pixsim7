## Dockview / Panel System Snapshot (Dec 2025)

### Goals
- One SmartDockview API for all spaces (workspace, control center, asset viewer, future widgets).
- Scopes seed defaults; allowlists optionally constrain what can be added.
- Context menus, scopes, and capabilities remain shared and optional.

### Current Usage
- **Workspace**: `scope="workspace"`, storage key `dockview:workspace:v4`, default layout defined inline in `features/workspace/components/DockviewWorkspace.tsx`.
- **Control Center**: passes an explicit `panels` array based on user-enabled modules, storage key `dockview:control-center:v5`.
- **Asset Viewer**: passes an explicit `panels` list, storage key `dockview:asset-viewer:v5`.

### SmartDockview Props (simplified)
- `scope?: string` — filter by panel `availableIn` (recommended for simple docks).
- `panels?: string[]` — explicit panel IDs (takes precedence over scope).
- `excludePanels?: string[]` — omit specific panels when using scope.
- `allowedPanels?: string[]` / `allowedCategories?: string[]` — limit what can be added via context menu (omit for “anywhere”).
- `storageKey?: string` — localStorage persistence.
- `defaultLayout?: (api, panelDefs) => void` — optional custom layout for scope/panels mode.
- `panelManagerId?: string` — ID for cross-dockview actions/context menu.
- `enableContextMenu?: boolean` — requires `ContextMenuProvider` at root.

### Behavior Highlights
- If no panels resolve and no registry/direct components are provided, SmartDockview shows an inline “No panels available” message.
- Context menu add-panel uses all allowed panels (respecting `allowed*`).
- Scope-based auto-wrapping and user-controlled Local/Global scopes still apply; scope provider registry untouched.
- Legacy registry mode remains for internal use but is discouraged.
- Dockview hosts are registered centrally and expose a shared `addPanel/isPanelOpen/focusPanel` API.

### Defaults & Storage Keys
- Workspace: `dockview:workspace:v4`
- Control Center: `dockview:control-center:v5`
- Asset Viewer: `dockview:asset-viewer:v5`

### Follow-ups (nice to have)
- Continue pruning legacy mentions of `globalPanelIds/includeGlobalPanels`.
- Consider merging panel settings stores per the “settings store simplification” proposal once the UI stabilizes.
- Add a short recipe for defining `availableIn` on new panels and how to opt into multiple scopes.

### Panel Authoring Checklist (use for new panels)
- Prefer `availability: { docks: [...] }` to declare where it should appear (workspace, control-center, asset-viewer, etc.).
- Prefer `instances: "single" | "multiple" | { max }` over `supportsMultipleInstances`.
- Set `category` for menu grouping.
- Prefer scope-based inclusion; use explicit `panels` only for custom stacks.
- Avoid registry mode for new docks (keep it internal/legacy).
- If a dock should restrict additions, use `allowedPanels`/`allowedCategories` instead of hard-coding.
