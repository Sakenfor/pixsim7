**Task: Workspace Panel System Enhancement**

> **For Agents (How to use this file)**
> - This task enhances the workspace panel system to be more flexible, composable, and user-configurable.
> - Implements in phases: consolidation → configuration → plugin architecture → visual builder
> - Each phase builds on the previous one and can be completed independently
> - Read these first:
>   - `apps/main/src/stores/workspaceStore.ts` – workspace state and panel management
>   - `apps/main/src/components/layout/DockviewWorkspace.tsx` – main panel container
>   - `apps/main/src/components/layout/FloatingPanelsManager.tsx` – floating panel system
>   - Analysis doc (from 2025-11-22): See comprehensive UI panel architecture analysis in conversation

---

## Context

The workspace panel system currently has:

### Strengths
- **Flexible 3-tier architecture**: Dockview workspace + Floating panels + Control cubes
- **Tree-based layout system**: Arbitrary nesting of splits with customizable ratios
- **Preset management**: Save/load/delete custom workspace layouts
- **Core workspace panels (11)**: gallery, scene, graph, inspector, health, game, providers, settings, gizmo-lab, npc-brain-lab, game-theming

### Pain Points
- **45 total panels** but only 10 integrated into workspace - 35 panels orphaned or route-specific
- **Redundancy**: Multiple panels for same concerns (4 scene panels, 3 graph panels, 5 game config panels)
- **No runtime customization**: Panels are hardcoded - can't add/modify without code changes
- **Limited composition**: Can't combine widgets from different panels into custom views
- **No user-defined panels**: Developers must edit code to add panels

### Recent Improvements (2025-11-22)
- ✅ Created **GameThemingPanel** - unified 4 game config panels (SessionOverride, DynamicRules, ThemePacks, UserPreferences)
- ✅ Enhanced **HealthPanel** - added compact mode (absorbed ValidationPanel pattern)
- ✅ Fixed legacy imports - pointed to correct panel locations

---

### Current Panel Inventory (2025-11-22)

#### Snapshot
- **Total panels**: 45 in codebase
- **Workspace-integrated panels (11)**: gallery, scene, graph, inspector, health, game, providers, settings, gizmo-lab, npc-brain-lab, game-theming
- **Non-integrated panels (~34)**: mix of route-specific tools, legacy panels, and experimental tooling

#### ✅ Workspace Panels (already integrated)
- gallery, scene, graph, inspector, health, game, providers, settings, gizmo-lab, npc-brain-lab, game-theming

#### ♻️ Redundant Panels (already consolidated)
- **GameThemingPanel** (new) ← `SessionOverridePanel` + `DynamicThemeRulesPanel` + `ThemePacksPanel` + `UserPreferencesPanel`
- **HealthPanel** (enhanced) ← now supports compact mode (absorbs `ValidationPanel` pattern)

#### 🎯 Panels Ready for Consolidation
- **SceneManagementPanel** (recommended next)
  - `SceneLibraryPanel` – browse/create/manage scenes
  - `SceneCollectionPanel` – organize into chapters/episodes
  - `ScenePlaybackPanel` – test scenes in editor

#### 📍 Route-Specific Panels (keep as-is for now)
These are correctly placed in dedicated routes, not in the workspace:
- ArcGraphPanel, InventoryPanel, NpcInteractionPanel, WorldToolsPanel, HudCustomizationPanel, AppMapPanel, BackendArchitecturePanel, CapabilityTestingPanel, DependencyGraphPanel, TemplateAnalyticsPanel, LocalFoldersPanel, BrainToolsPanel, GalleryToolsPanel, GatePreviewPanel, GenerationPreviewPanel, SocialContextPanel, ExportImportPanel, SimulationPluginsPanel

#### 🧱 Legacy Panels (keep until migration complete)
Located in `apps/main/src/components/legacy/`:
- `GraphPanel.tsx`, `SceneBuilderPanel.tsx`, `PluginCatalogPanel.tsx`, `PluginConfigPanel.tsx`, `ArcGraphPanel.tsx`

**Status:** Still imported by layout components. Do **not** delete until new panels are proven equivalent.

#### Consolidation & Migration Principles

1. **Tabbed wrappers only**
   - Unified panels are thin, tabbed containers that **import and render existing panels**.
   - No code duplication; original panels remain source of truth.
2. **Code reuse by default**
   - Unified panels pass props/context down; they do not re-implement business logic.
   - Changes to original panels automatically flow into unified panels.
3. **Migration safety**
   - Keep legacy panels and wiring until:
     - New unified panel has 100% feature parity for primary workflows.
     - No remaining imports of the legacy panel in the codebase.
     - Basic user testing confirms equivalence.

#### Developer Workflow Notes

- **Adding panels (current state)**
  - Edit `PANEL_COMPONENTS` / `PANEL_TITLES` in `DockviewWorkspace.tsx`.
  - Edit `PANEL_MAP` in `FloatingPanelsManager.tsx`.
- **Adding panels (after Phase 50.3)**
  - Register panels via the panel registry / plugin system instead of hardcoding maps.
- **Adding panels (after Phase 50.4)**
  - Advanced users can create composed panels in the visual builder; developers can expose them as plugins if needed.
- **Modifying panels**
  - Edit the original standalone panels; unified wrappers inherit changes automatically.
- **Deleting legacy panels**
  - Only after the migration checklist above passes for each panel and no imports remain.

## Technical Design Overview

This section summarizes the core technical model that the later phases refine. Detailed type definitions live under Phases 50.2–50.4 and in `workspaceStore.ts`.

### Core Data Model (planned)

- Panel identity
  - `PanelId` remains the canonical identifier for workspace panels (see `workspaceStore.ts`).
  - `PanelDefinition` (Phase 50.3) describes metadata plus the React component for each panel.
- Panel instances
  - `PanelInstance` (Phase 50.2) represents a specific mounted instance of a panel, including:
    - `panelId` (definition reference)
    - `instanceId` (unique per instance)
    - `state` (instance-local state snapshot)
    - `position` (`docked` or `floating`)
    - `config` (merged default settings plus user overrides)
- Workspace layout
  - `LayoutNode<PanelId>` (current tree-based layout) remains the backing structure.
  - `WorkspaceProfile` (Phase 50.2) wraps:
    - `layout: LayoutNode<PanelId>`
    - `panelConfigs: PanelConfig[]`
    - `activeInstances: PanelInstance[]`
  - Existing presets in `workspaceStore` map directly to `WorkspaceProfile` entries over time.

### Configuration Storage and Versioning

- Storage locations
  - Short term: continue persisting via `workspaceStore` using `createBackendStorage('workspace')`.
  - Phase 50.2 extends this to include:
    - Per-panel `settings` (for example: compact mode, filters, refresh intervals).
    - Per-instance `state` where needed.
    - Named `WorkspaceProfile` objects.
- Versioning
  - Introduce a `schemaVersion` on stored workspace data (profiles, panel configs, composed panels).
  - On load, run migration steps when `schemaVersion` is older than the current implementation.
  - When a panel or plugin is missing:
    - Mark instances as inactive or missing rather than failing the whole layout.
    - Allow users to remove or replace missing panels via the configuration UI.

### Phase MVPs and Non-goals

- Phase 50.1 (Consolidation)
  - MVP: `SceneManagementPanel` as a tabbed wrapper around the three existing scene panels, integrated into workspace and floating panels.
  - Non-goals: No registry changes and no configuration UI changes beyond wiring the new panel ID.
- Phase 50.2 (Configuration UI)
  - MVP: Show/hide panels, basic per-panel settings, simple visual preset chooser, and the ability to save and load workspace profiles.
  - Non-goals: Full drag-and-drop panel composition (that belongs to Phase 50.4), remote sharing or marketplace flows.
- Phase 50.3 (Plugin Registry)
  - MVP: Internal plugin system that converts existing panels into registry-backed definitions and powers `DockviewWorkspace` plus `FloatingPanelsManager`.
  - Non-goals: Remote plugin marketplace, security sandboxing for untrusted third-party code.
- Phase 50.4 (Builder/Composer)
  - MVP: Grid-based builder with a small curated widget set (metrics, list/table, text/markdown, simple chart) plus simple store-based data binding.
  - Non-goals: Arbitrary JavaScript execution, a generic query language, or a full analytics DSL.

### Registry and Plugin Design Notes

- Start by backing `PANEL_COMPONENTS` and `PANEL_MAP` with a registry layer rather than replacing everything at once.
- Treat plugins in Phase 50.3 as internal bundles:
  - Panel definitions live in the monorepo and register themselves on startup.
  - External NPM or filesystem plugins are future work.
- Keep registry operations O(1): lookups by `panelId`, plus helpers for categories and search as sketched in Phase 50.3.

### Builder and Data Binding Guidelines

- First implementation should:
  - Use store selectors (for example `storeId` plus `path`) and a small library of pure transforms.
  - Avoid `eval`, dynamic imports, or arbitrary user-provided code.
  - Support preview with sample data to avoid hitting APIs on every configuration change.
- Reserve API-based and computed data sources for later iterations once internal usage patterns stabilize.

## Goals

1. **Consolidate redundant panels** into logical groupings
2. **Enable runtime panel configuration** - users customize without code changes
3. **Build plugin-based panel architecture** - register panels dynamically
4. **Create visual panel builder** - compose custom panels from widgets

This enables:
- **Content creators**: Customize workspace for their workflow
- **Developers**: Add panels via plugins, not core code edits
- **Advanced users**: Build custom panels without coding

---

## Phase Checklist

- [ ] **Phase 50.1 – Panel Consolidation (Quick Wins)** ⏳ In Progress
- [ ] **Phase 50.2 – Panel Configuration UI** 🔜 Next
- [ ] **Phase 50.3 – Plugin-based Panel Registry** 🔜 Planned
- [ ] **Phase 50.4 – Panel Builder/Composer** 🔜 Planned
- [ ] **Phase 50.5 – Advanced Features** 🔮 Future

**Overall Status:** 🚧 20% Complete (GameThemingPanel done, SceneManagementPanel pending)

---

## Phase 50.1 – Panel Consolidation (Quick Wins)

**Goal**: Combine redundant panels into unified components (like GameThemingPanel)

### ✅ Completed
- [x] **GameThemingPanel** - Unified 4 game config panels
  - `SessionOverridePanel` (temporary overrides)
  - `DynamicThemeRulesPanel` (automatic rules)
  - `ThemePacksPanel` (import/export)
  - `UserPreferencesPanel` (accessibility)
  - Location: `apps/main/src/components/game/GameThemingPanel.tsx`
  - Added to workspace as `'game-theming'` panel

- [x] **HealthPanel Enhancement** - Added compact mode
  - Supports full panel mode (default)
  - Supports compact badge/dropdown mode (like ValidationPanel)
  - Location: `apps/main/src/components/health/HealthPanel.tsx`

### 🔲 TODO
- [ ] **SceneManagementPanel** - Unified scene workflow
  - Combine 3 panels:
    - `SceneLibraryPanel` - Browse/create/manage scenes
    - `SceneCollectionPanel` - Organize into chapters/episodes
    - `ScenePlaybackPanel` - Test scenes in editor
  - Create: `apps/main/src/components/scene/SceneManagementPanel.tsx`
  - Add to workspace as `'scene-management'` panel
  - Use tabbed interface (like GameThemingPanel)

- [ ] **GraphEditorPanel** (Optional) - Unified graph editing
  - Decide: Keep separate ArcGraphPanel vs legacy GraphPanel?
  - Or: Create unified panel with graph type selector?
  - Note: ArcGraphPanel is route-based, may not need workspace integration

### Implementation Notes
- **Pattern**: Tabbed container that imports and reuses original panels
- **Code reuse**: Original panels MUST be kept - not duplicated
- **Props**: Parent panel passes props down to child panels via tabs
- **Example**: See `GameThemingPanel.tsx` for reference implementation

### Verification
- [ ] Original panels still work standalone
- [ ] Combined panel works in both docked and floating modes
- [ ] Tabs switch correctly
- [ ] Props propagate to child panels
- [ ] No TypeScript errors

---

## Phase 50.2 – Panel Configuration UI

**Goal**: Enable users to customize panels without code changes

### Features to Implement

#### A. Panel Visibility Controls
- [ ] **Panel Library Browser**
  - Show all available panels (integrated + non-integrated)
  - Toggle panel visibility on/off
  - Search/filter panels by category
  - Panel descriptions and previews

- [ ] **Panel Settings Per-Panel**
  - Each panel can have configuration options
  - Stored in workspace state
  - Persisted to backend storage
  - Example: compact mode toggle, refresh intervals, filters

- [ ] **Custom Panel Groupings**
  - User-defined panel categories
  - Organize panels into collections
  - Quick-access favorites

#### B. Layout Customization UI
- [ ] **Enhanced Preset Manager**
  - Visual preset selector (not just dropdown)
  - Preset thumbnails/previews
  - Import/export presets as JSON
  - Share presets with team

- [ ] **Layout Editor**
  - Visual split configuration
  - Drag-drop panel reordering
  - Adjust split percentages via slider
  - Preview layout before applying

- [ ] **Panel Quick Actions**
  - Right-click context menu on panels
  - Duplicate panel
  - Move to new window (float)
  - Send to other monitor
  - Pin/unpin panel

#### C. Panel State Management
- [ ] **Panel Instance State**
  - Each panel instance can have unique state
  - Example: Two inspector panels showing different nodes
  - State persisted across sessions
  - State isolated per instance

- [ ] **Workspace Profiles**
  - Different workspace configs for different tasks
  - Example: "Writing Mode", "Testing Mode", "Dev Mode"
  - Quick-switch between profiles
  - Profile-specific panel visibility

### Technical Implementation

```typescript
// Panel configuration schema
interface PanelConfig {
  id: PanelId;
  enabled: boolean;
  settings: Record<string, any>; // Panel-specific settings
  category?: string;
  tags?: string[];
}

// Panel instance state
interface PanelInstance {
  panelId: PanelId;
  instanceId: string; // Unique per instance
  state: Record<string, any>; // Instance-specific state
  position: 'docked' | 'floating';
  config: PanelConfig;
}

// Workspace profile
interface WorkspaceProfile {
  id: string;
  name: string;
  layout: LayoutNode<PanelId>;
  panelConfigs: PanelConfig[];
  activeInstances: PanelInstance[];
}
```

### Files to Create/Modify
- [ ] `apps/main/src/components/settings/PanelConfigurationPanel.tsx` - UI for panel config
- [ ] `apps/main/src/components/settings/LayoutEditorPanel.tsx` - Visual layout editor
- [ ] `apps/main/src/components/settings/WorkspaceProfileManager.tsx` - Profile switcher
- [ ] `apps/main/src/stores/workspaceStore.ts` - Extend with new state
- [ ] `apps/main/src/stores/panelConfigStore.ts` - NEW: Panel configuration state

### Verification
- [ ] Panel visibility toggles persist across sessions
- [ ] Panel settings save/load correctly
- [ ] Workspace profiles switch cleanly
- [ ] No state leakage between panel instances
- [ ] Layout editor produces valid layout trees

---

## Phase 50.3 – Plugin-based Panel Registry

**Goal**: Allow panels to be registered dynamically (not hardcoded)

### Architecture

#### A. Panel Registry System
```typescript
// Panel definition for registry
interface PanelDefinition {
  id: string;
  title: string;
  component: React.ComponentType<any>;
  category: 'core' | 'development' | 'game' | 'custom';
  tags: string[];
  icon?: string;
  description?: string;
  defaultSettings?: Record<string, any>;

  // Visibility predicates
  showWhen?: (context: WorkspaceContext) => boolean;

  // Lifecycle hooks
  onMount?: () => void;
  onUnmount?: () => void;

  // Capabilities
  supportsCompactMode?: boolean;
  supportsMultipleInstances?: boolean;
  requiresContext?: boolean;
}

// Panel registry
class PanelRegistry {
  private panels = new Map<string, PanelDefinition>();

  register(definition: PanelDefinition): void;
  unregister(panelId: string): void;
  get(panelId: string): PanelDefinition | undefined;
  getAll(): PanelDefinition[];
  getByCategory(category: string): PanelDefinition[];
  search(query: string): PanelDefinition[];
}
```

#### B. Plugin Integration
```typescript
// Panel plugin interface
interface PanelPlugin {
  id: string;
  name: string;
  version: string;
  panels: PanelDefinition[];

  // Plugin lifecycle
  initialize?: (registry: PanelRegistry) => void;
  cleanup?: () => void;

  // Dependencies
  requires?: string[]; // Other plugin IDs
  conflicts?: string[]; // Incompatible plugins
}

// Plugin manager
class PanelPluginManager {
  loadPlugin(plugin: PanelPlugin): Promise<void>;
  unloadPlugin(pluginId: string): Promise<void>;
  getLoadedPlugins(): PanelPlugin[];
  checkDependencies(plugin: PanelPlugin): boolean;
}
```

### Implementation Tasks

- [ ] **Create Panel Registry**
  - [ ] `apps/main/src/lib/panels/panelRegistry.ts` - Core registry
  - [ ] Register all existing panels in registry
  - [ ] Update DockviewWorkspace to use registry
  - [ ] Update FloatingPanelsManager to use registry

- [ ] **Create Plugin System**
  - [ ] `apps/main/src/lib/panels/panelPlugin.ts` - Plugin interface
  - [ ] `apps/main/src/lib/panels/pluginManager.ts` - Plugin manager
  - [ ] Plugin loading from filesystem
  - [ ] Plugin validation and dependency checking

- [ ] **Built-in Panels as Plugins**
  - [ ] Convert core panels to plugin format
  - [ ] Create plugin manifests for each category
  - [ ] Test loading/unloading plugins

- [ ] **Plugin Discovery UI**
  - [ ] `apps/main/src/components/settings/PluginBrowserPanel.tsx`
  - [ ] Browse available panel plugins
  - [ ] Install/uninstall plugins
  - [ ] Enable/disable panels from plugins

### Example Plugin

```typescript
// Example: Custom analytics panel plugin
const analyticsPlugin: PanelPlugin = {
  id: 'custom-analytics',
  name: 'Custom Analytics Panel',
  version: '1.0.0',
  panels: [
    {
      id: 'scene-analytics',
      title: 'Scene Analytics',
      component: SceneAnalyticsPanel,
      category: 'custom',
      tags: ['analytics', 'scenes', 'metrics'],
      icon: '📊',
      description: 'Visualize scene usage and performance metrics',
      supportsCompactMode: false,
      supportsMultipleInstances: true,
    },
  ],
  initialize(registry) {
    this.panels.forEach(panel => registry.register(panel));
  },
};
```

### Verification
- [ ] Registry correctly manages panel lifecycle
- [ ] Plugins load without errors
- [ ] Plugin dependencies enforced
- [ ] Unloading plugin removes its panels
- [ ] No memory leaks from plugin loading/unloading

---

## Phase 50.4 – Panel Builder/Composer

**Goal**: Visual tool to create custom panels from widgets

### Architecture

#### A. Widget System
```typescript
// Widget definition
interface WidgetDefinition {
  id: string;
  type: 'chart' | 'list' | 'form' | 'text' | 'grid' | 'custom';
  title: string;
  component: React.ComponentType<WidgetProps>;

  // Configuration
  configSchema: JSONSchema; // What settings does this widget have?
  defaultConfig: Record<string, any>;

  // Data binding
  dataSources?: string[]; // What data does it need?

  // Layout hints
  minWidth?: number;
  minHeight?: number;
  aspectRatio?: number;
}

// Panel composition
interface PanelComposition {
  id: string;
  name: string;
  layout: GridLayout; // Grid-based layout
  widgets: WidgetInstance[];
  dataSources: DataSourceConfig[];
  styles?: CSSProperties;
}

interface WidgetInstance {
  id: string;
  widgetType: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, any>;
  dataBindings: Record<string, DataBinding>;
}
```

#### B. Visual Builder UI
- [ ] **Widget Library**
  - Browse available widgets
  - Search/filter by category
  - Widget previews
  - Drag widgets onto canvas

- [ ] **Canvas Editor**
  - Grid-based layout system
  - Drag-drop widget placement
  - Resize/reposition widgets
  - Snap-to-grid alignment

- [ ] **Widget Configuration**
  - Property inspector per widget
  - Visual editors for common props
  - Data binding configuration
  - Preview widget with sample data

- [ ] **Data Binding System**
  - Connect widgets to data sources
  - Query builder for filtering
  - Transform/map data
  - Real-time preview

- [ ] **Panel Preview**
  - Live preview of composed panel
  - Test with real data
  - Responsive breakpoint testing
  - Export panel as plugin

### Built-in Widgets

#### Data Display
- [ ] `ChartWidget` - Charts (line, bar, pie, scatter)
- [ ] `ListWidget` - Sortable/filterable lists
- [ ] `TableWidget` - Data tables with pagination
- [ ] `MetricWidget` - Key metrics display
- [ ] `TextWidget` - Rich text content
- [ ] `MarkdownWidget` - Markdown renderer

#### Data Input
- [ ] `FormWidget` - Dynamic forms
- [ ] `SearchWidget` - Search interface
- [ ] `FilterWidget` - Filter controls
- [ ] `DateRangeWidget` - Date picker

#### Visualization
- [ ] `GraphWidget` - Node graphs (ReactFlow)
- [ ] `TreeWidget` - Tree views
- [ ] `TimelineWidget` - Timeline visualization
- [ ] `MapWidget` - Spatial/relationship maps

#### Interaction
- [ ] `ButtonGroupWidget` - Action buttons
- [ ] `TabsWidget` - Nested tab interface
- [ ] `AccordionWidget` - Expandable sections

### Data Sources

```typescript
// Data source interface
interface DataSource {
  id: string;
  type: 'store' | 'api' | 'computed' | 'static';

  // For Zustand stores
  store?: string; // Store name
  selector?: string; // Selector path

  // For API calls
  endpoint?: string;
  method?: 'GET' | 'POST';
  params?: Record<string, any>;

  // For computed
  compute?: (deps: any[]) => any;
  dependencies?: string[]; // Other data source IDs

  // Caching
  cache?: boolean;
  refreshInterval?: number;
}
```

### Implementation Files
- [ ] `apps/main/src/lib/panels/widgetRegistry.ts` - Widget registry
- [ ] `apps/main/src/lib/panels/panelComposer.ts` - Composition engine
- [ ] `apps/main/src/components/builder/PanelBuilderCanvas.tsx` - Visual editor
- [ ] `apps/main/src/components/builder/WidgetLibrary.tsx` - Widget browser
- [ ] `apps/main/src/components/builder/WidgetInspector.tsx` - Config editor
- [ ] `apps/main/src/components/builder/DataBindingEditor.tsx` - Bind data
- [ ] `apps/main/src/widgets/` - Built-in widget implementations

### Example: Composed Panel

```json
{
  "id": "my-scene-dashboard",
  "name": "My Scene Dashboard",
  "layout": {
    "type": "grid",
    "columns": 12,
    "rows": 8
  },
  "widgets": [
    {
      "id": "widget-1",
      "widgetType": "metric",
      "position": { "x": 0, "y": 0, "w": 3, "h": 2 },
      "config": {
        "title": "Total Scenes",
        "format": "number"
      },
      "dataBindings": {
        "value": { "source": "sceneStore", "path": "scenes.length" }
      }
    },
    {
      "id": "widget-2",
      "widgetType": "chart",
      "position": { "x": 0, "y": 2, "w": 6, "h": 4 },
      "config": {
        "type": "line",
        "title": "Scene Creation Over Time"
      },
      "dataBindings": {
        "data": { "source": "sceneHistory", "transform": "groupByDate" }
      }
    }
  ]
}
```

### Verification
- [ ] Widgets render correctly in composition
- [ ] Data binding updates in real-time
- [ ] Layout persists correctly
- [ ] Composed panels work in workspace
- [ ] Export/import composed panels
- [ ] No performance issues with many widgets

---

## Phase 50.5 – Advanced Features

**Goal**: Polish and advanced capabilities

### Features

#### A. Panel Communication
- [ ] **Event Bus**
  - Panels publish/subscribe to events
  - Cross-panel communication
  - Example: Inspector panel updates when graph selection changes

- [ ] **Shared Context**
  - Panels share context data
  - Context providers at workspace level
  - Scoped contexts per panel group

#### B. Panel Lifecycle
- [ ] **Lazy Loading**
  - Load panel code on-demand
  - Reduce initial bundle size
  - Prefetch commonly used panels

- [ ] **Panel Snapshots**
  - Save/restore panel state
  - Quick state snapshots
  - Undo/redo panel state changes

#### C. Advanced Layout
- [ ] **Multi-monitor Support**
  - Panels on different monitors
  - Monitor-specific layouts
  - Restore panel positions per monitor

- [ ] **Panel Templates**
  - Save panel as template
  - Reuse across workspaces
  - Template marketplace/sharing

#### D. Developer Experience
- [ ] **Panel Dev Tools**
  - Debug panel state
  - Inspect panel registry
  - Performance profiling per panel

- [ ] **Hot Reload**
  - Panel hot reload during development
  - Update panels without full refresh

### Implementation
- TBD based on priorities after Phase 50.4

---

## Success Criteria

### Phase 50.1 (Consolidation)
- ✅ GameThemingPanel working in workspace
- ✅ HealthPanel supports compact mode
- ⏳ SceneManagementPanel created and integrated
- All original panels still functional

### Phase 50.2 (Configuration)
- Users can show/hide panels via UI
- Panel settings persist across sessions
- Workspace profiles switch cleanly
- Visual layout editor produces valid layouts

### Phase 50.3 (Plugin System)
- 3rd-party panels can be registered
- Plugin loading/unloading works
- No regression in core panels
- Plugin browser UI functional

### Phase 50.4 (Builder)
- Users can compose custom panels
- At least 10 built-in widgets available
- Data binding system working
- Export composed panels as plugins

### Overall Success
- Workspace is more flexible and customizable
- Users can customize without coding
- Developers can extend via plugins
- Advanced users can build custom panels
- Performance remains acceptable

---

## Notes

### Compatibility
- All changes must be backward compatible
- Existing workspace layouts must continue working
- Migration path for any breaking changes

### Performance
- Panel registry lookups: O(1)
- Plugin loading: Lazy, on-demand
- Widget rendering: Virtualized for large compositions
- State updates: Optimized with Zustand selectors

### Future Considerations
- Panel marketplace/sharing
- AI-assisted panel composition
- Panel templates for common workflows
- Integration with external tools (VS Code, Figma, etc.)

### Testing Strategy
- Add unit tests around:
  - Core layout operations in `workspaceStore` (including presets and future profile migrations).
  - Panel registry behavior (registration, lookup, search, category filters).
  - Composition utilities that transform builder config into renderable layouts.
- For React components:
  - Focus tests on wiring-heavy panels (`SceneManagementPanel`, configuration UI, plugin browser).
  - Ensure props and context are correctly forwarded from unified panels to underlying panels.

### Suggested Implementation Order

1. Stabilize core layout state in `workspaceStore`, keeping `LayoutNode<PanelId>` as the single source of truth and adding minimal scaffolding for `WorkspaceProfile` without changing behavior.
2. Complete Phase 50.1 by implementing `SceneManagementPanel` as a tabbed wrapper and wiring the new `scene-management` panel into `workspaceStore`, `DockviewWorkspace`, and `FloatingPanelsManager`.
3. Implement Phase 50.2 by adding panel visibility controls, basic per-panel settings, and profile-aware preset management persisted via `createBackendStorage('workspace')` with a clear schema version.
4. Introduce an internal registry layer in Phase 50.3 behind `PANEL_COMPONENTS` and `PANEL_MAP`, then convert existing core panels into registry-backed definitions and add basic plugin browser UI.
5. Ship a narrow vertical slice of the builder in Phase 50.4 with a small widget set and simple store-based data binding before expanding to more advanced widgets and data sources.

---

## Related Tasks

- **Task 33**: Repo Pruning & Legacy Sweep (cleared unused panels)
- **Task 04**: Per-world UI Themes (theming system that panels use)
- **Task 01**: World HUD Layout Designer (similar composition concept)

---

## Questions to Resolve

1. Should panel plugins be filesystem-based or database-stored?
2. Widget data binding: GraphQL-style queries or simple selectors?
3. Panel versioning: How to handle breaking changes in panel APIs?
4. Security: Sandboxing for 3rd-party panels?
5. Distribution: NPM packages or built-in marketplace?

---

**Status Legend**
- ✅ Complete
- 🚧 In Progress
- 🔜 Next Up
- ⏳ Waiting
- 🔮 Future
- ❌ Blocked
