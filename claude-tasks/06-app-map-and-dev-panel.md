**Task: Central App Map Doc & Live App Map Dev Panel**

**Context**
- The project has multiple architectural docs (SYSTEM_OVERVIEW, PLUGIN_SYSTEM, APP_CAPABILITY_REGISTRY, etc.).
- There is a capability registry (`frontend/src/lib/capabilities`) and a plugin catalog (`frontend/src/lib/plugins/catalog.ts`).
- There are many plugin families and core systems (Game2D, Brain Lab, World Tools, Gallery Tools, Modules).
- It's hard to get a single, up-to-date "mental map" of what exists and how it's wired.

**Goal**
Create:
1. A central static doc `docs/APP_MAP.md` that acts as an architecture index and roadmap.
2. A live **App Map dev panel** that visualizes features, routes, and plugins using real data from the capability registry and plugin catalog.

This should NOT change any runtime behavior; it's documentation + dev tooling.

---

## Part 1: `docs/APP_MAP.md` – Architecture Index

**Purpose**
- Provide one entry-point doc that orients a reader to:
  - Major subsystems (Capabilities, Plugins, Modules, Editor, Game).
  - Where to find detailed docs.
  - Where to find dev panels / live explorers.
  - High-level roadmap (with links to `claude-tasks/`).

**Status: ✅ COMPLETED**

Created comprehensive architecture index at `docs/APP_MAP.md` with:
- Overview of major subsystems
- System index by concern (Capabilities, Plugins, Graph/Scene Editor, Game & Simulation, Generation)
- Plugin kinds reference table
- Links to all relevant documentation
- Live dev tools section
- Roadmap linking to claude-tasks

---

## Part 2: `AppMapPanel` – Live App Map Dev Panel

**Purpose**
- Provide a live, interactive view of:
  - Registered features/routes/actions (from capability registry).
  - Registered plugins (from plugin catalog).
- Help understand current state without digging into code.

**Status: ✅ COMPLETED**

### Implementation Summary

**Files Created:**
1. `frontend/src/components/dev/AppMapPanel.tsx` - Main panel component
2. `frontend/src/routes/AppMapDev.tsx` - Route component
3. `frontend/src/modules/app-map/index.ts` - Module for feature registration

**Files Modified:**
1. `frontend/src/App.tsx` - Added `/app-map` route
2. `frontend/src/lib/capabilities/registerCoreFeatures.ts` - Added `registerAppMapFeature()`
3. `frontend/src/modules/index.ts` - Registered `appMapModule`

### Features Implemented

**AppMapPanel Component:**
- Three-tab interface: Features & Routes, Plugin Ecosystem, Statistics
- Features view:
  - List of all features grouped by category
  - Feature selection shows routes and actions
  - Route metadata display (path, protection status, navigation visibility)
  - Action metadata display (shortcuts, descriptions)
- Plugins view:
  - Complete plugin catalog with filtering
  - Filter by kind (session-helper, interaction, node-type, gallery-tool, world-tool, ui-plugin, generation-ui)
  - Filter by origin (builtin, plugins-dir, ui-bundle, dev)
  - Full-text search across plugin metadata
  - Expandable plugin cards showing:
    - Metadata (category, version, author, enabled status)
    - Tags
    - Feature dependencies (provides/consumes)
    - Source information
- Statistics view:
  - System overview (feature count, action count, plugin count)
  - Plugins by kind breakdown
  - Plugins by origin breakdown
  - Feature usage statistics (which features are used by plugins)
  - Plugin health metrics (metadata completeness, experimental/deprecated counts)

**Route Configuration:**
- Route: `/app-map`
- Protected: Yes (requires authentication)
- Registered in capability registry
- Shows in navigation with 🗺️ icon
- Action shortcut: `Ctrl+Shift+M`

### Technical Details

**Data Sources:**
- Capability registry hooks:
  - `useFeatures()` - All registered features
  - `useFeatureRoutes(featureId)` - Routes for specific feature
  - `useActions()` - All registered actions
- Plugin catalog functions:
  - `listAllPlugins()` - All plugins with metadata
  - `filterByKind()`, `filterByOrigin()` - Plugin filtering
  - `searchPlugins()` - Full-text search
  - `getPluginCounts()` - Statistics by kind
  - `getOriginCounts()` - Statistics by origin
  - `getPluginHealth()` - Health and completeness metrics
  - `getFeatureUsageStats()` - Feature dependency analysis

**UI Features:**
- Dark mode support
- Responsive layout
- Collapsible plugin cards
- Badge system for metadata (kind, origin, experimental, deprecated)
- Clean categorization and grouping
- Live updates (hooks into reactive capability store)

### Usage

**Accessing the App Map:**
1. Navigate to `/app-map` in the browser
2. Use the action shortcut `Ctrl+Shift+M`
3. Click "App Map" in the navigation (if navigation includes it)

**Features Tab:**
- Click on any feature in the left panel to view its details
- See all routes and actions associated with that feature

**Plugins Tab:**
- Use filters to narrow down plugins by kind and origin
- Search for specific plugins by name or description
- Click plugin cards to expand and see full metadata
- View feature dependencies to understand plugin integration

**Statistics Tab:**
- View system-wide metrics
- Analyze plugin distribution
- Check plugin health and metadata completeness

---

## Success Criteria

✅ `docs/APP_MAP.md` gives a clear index into the architecture and links to key docs and dev tools.

✅ Visiting `/app-map` shows:
- A list of features with their routes and actions.
- A list of plugins with kind/origin badges and filters.

✅ The panel updates automatically as features and plugins are registered in code.

---

## Future Enhancements

Potential improvements for future iterations:

1. **Dependency Graph Visualization**
   - Visual graph of feature dependencies
   - Plugin relationship diagrams
   - Interactive graph navigation

2. **Plugin Detail Drill-Down**
   - View plugin source code
   - Test plugin capabilities
   - Enable/disable plugins dynamically

3. **Capability Testing**
   - Test action execution
   - Navigate to routes directly
   - View state values in real-time

4. **Export/Import**
   - Export architecture documentation
   - Generate dependency reports
   - Plugin manifest validation

5. **Search Enhancement**
   - Global search across all capabilities
   - Advanced filtering and sorting
   - Saved search queries

---

## Documentation References

- [APP_MAP.md](../docs/APP_MAP.md) - Architecture index (this task's output)
- [APP_CAPABILITY_REGISTRY.md](../docs/APP_CAPABILITY_REGISTRY.md) - Capability system
- [CAPABILITY_HOOKS.md](../docs/CAPABILITY_HOOKS.md) - Hook API reference
- [PLUGIN_SYSTEM.md](../docs/PLUGIN_SYSTEM.md) - Plugin architecture
- [PLUGIN_REFERENCE.md](../docs/PLUGIN_REFERENCE.md) - Plugin API
