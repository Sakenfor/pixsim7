**Task: Central App Map Doc & Live App Map Dev Panel (Multi‑Phase)**

**Context**
- The project has multiple architectural docs (`SYSTEM_OVERVIEW`, `PLUGIN_SYSTEM`, `APP_CAPABILITY_REGISTRY`, etc.).
- There is a capability registry (`frontend/src/lib/capabilities`) and a plugin catalog (`frontend/src/lib/plugins/catalog.ts`).
- There are many plugin families and core systems (Game2D, Brain Lab, World Tools, Gallery Tools, Modules).
- It’s hard to get a single, up‑to‑date “mental map” of what exists and how it’s wired.

We want:
1. A central static doc `docs/APP_MAP.md` that acts as an architecture index and roadmap.
2. A live **App Map dev view** that visualizes features, routes, and plugins using real data.

Below are 10 phases for App Map docs + dev tooling.

> **For agents:** Phases 1–2 are partially implemented. Later phases track further enhancements (graphs, health, testing).

### Phase Checklist

- [x] **Phase 1 – Static APP_MAP.md Architecture Index**
- [x] **Phase 2 – App Map Dev View (via GraphPanel)**
- [x] **Phase 3 – Dependency Graph Visualization**
- [x] **Phase 4 – Plugin Detail Drill‑Down**
- [x] **Phase 5 – Capability Testing Panel**
- [x] **Phase 6 – Export / Import App Map Data**
- [ ] **Phase 7 – Enhanced Search & Filtering**
- [ ] **Phase 8 – Health Gating & Warnings**
- [ ] **Phase 9 – Performance / Load Metrics Integration**
- [ ] **Phase 10 – Integration with Codegen & Scaffolding**

---

### Phase 1 – Static APP_MAP.md Architecture Index

**Goal**  
Provide one entry‑point doc that orients a reader to major subsystems and where to find detailed docs and dev tools.

**Scope**
- Static documentation; no runtime behavior changes.

**Key Steps**
1. Create `docs/APP_MAP.md` with:
   - Overview of major subsystems.
   - System index by concern (Capabilities, Plugins, Graph/Scene Editor, Game & Simulation, Generation).
   - Plugin kinds reference table.
   - Links to relevant docs.
   - Live dev tools section (including any App Map routes or dev panels).
2. Link `APP_MAP.md` from `README.md` and other core docs where appropriate.

---

### Phase 2 – App Map Dev View (via GraphPanel)

**Goal**  
Provide a live, interactive view of registered features, routes, actions, and plugins.

**Scope**
- Dev‑only view, behind authentication.

**Current Implementation Notes (2025‑11‑19)**
- A **GraphPanel** component exists and is integrated into the `DockviewWorkspace`.
- The panel system includes:
  - `GraphPanel`, Scene Builder/Inspector, Health, Provider Settings, Assets, Game IFrame, etc.
- Layout persistence to `localStorage` is implemented.
- There is **no standalone `AppMapPanel.tsx`** file; app‑map‑style functionality is integrated into the Graph/Workspace tools instead.

**Next Steps for this Phase**
1. Decide whether to:
   - Treat the existing `GraphPanel` + workspace as the “App Map dev view”, or
   - Add a thin `AppMapDev` route that focuses the existing GraphPanel on app‑map data.
2. Ensure there is a discoverable dev entry point (e.g. `/dev/app-map`) that:
   - Loads the workspace with GraphPanel focused on routes/features/plugins, or
   - Embeds an App Map specific configuration on top of existing components.
3. Document this behavior in `APP_MAP.md` so developers know how to open the live map.

---

### Phase 3 – Dependency Graph Visualization ✅

**Goal**
Visualize relationships between features, routes, and plugins as a graph.

**Scope**
- Read‑only, dev‑only visualization; no runtime dependencies on the graph.

**Implementation (2025-11-19)**
- Created `DependencyGraphPanel.tsx` using ReactFlow
- Features displayed as blue nodes, plugins as purple nodes
- Edges show `consumesFeatures` (purple, animated) and `providesFeatures` (green)
- Integrated as "Dependency Graph" tab in App Map Panel
- Includes pan/zoom controls and minimap for navigation

**Files Modified:**
- `frontend/src/components/dev/DependencyGraphPanel.tsx` (new)
- `frontend/src/components/dev/AppMapPanel.tsx` (integrated)

---

### Phase 4 – Plugin Detail Drill‑Down ✅

**Goal**
Allow developers to drill down into plugin details directly from the App Map.

**Scope**
- For each plugin: show routes, hooks, source location, and related docs.

**Implementation (Pre-existing + Enhanced)**
- Plugin cards are expandable in the "Plugin Ecosystem" tab
- Shows: metadata (category, version, author), tags, feature dependencies
- Displays `providesFeatures` (green badges) and `consumesFeatures` (blue badges)
- Source registry information shown for each plugin
- Experimental and deprecated flags clearly marked

**Status:** Fully implemented in existing `AppMapPanel.tsx` (PluginCard component)

---

### Phase 5 – Capability Testing Panel ✅

**Goal**
Provide a dev‑only panel to exercise capabilities: trigger actions, navigate to routes, inspect feature state.

**Scope**
- Dev‑only; no behavior in production builds.

**Implementation (2025-11-19)**
- Created `CapabilityTestingPanel.tsx` with three sections:
  1. **Routes:** Browse and navigate to any route with one click
  2. **Actions:** Invoke registered actions directly from the UI
  3. **State Inspection:** View all registered state values with JSON preview
- Search functionality for both routes and actions
- Shows action shortcuts, protected routes, and nav visibility
- Integrated as "Capability Testing" tab in App Map Panel

**Files Modified:**
- `frontend/src/components/dev/CapabilityTestingPanel.tsx` (new)
- `frontend/src/components/dev/AppMapPanel.tsx` (integrated)

---

### Phase 6 – Export / Import App Map Data ✅

**Goal**
Allow exporting the current feature/plugin map to JSON for analysis or inline docs, and importing recorded maps.

**Scope**
- Export is primary; import is dev‑only for comparison.

**Implementation (2025-11-19)**
- Added "Export JSON" button to App Map Panel header
- Exports comprehensive JSON with:
  - Version and timestamp
  - All features with routes and actions
  - All plugins with complete metadata
  - Statistics (counts, health metrics, feature usage)
- File named with current date: `app-map-YYYY-MM-DD.json`
- Import functionality deferred (can be added later if needed)

**Files Modified:**
- `frontend/src/components/dev/AppMapPanel.tsx` (export handler added)

---

### Phase 7 – Enhanced Search & Filtering

**Goal**  
Make it easier to find features/plugins/routes across a large app.

**Scope**
- Extend existing search/filter UX.

**Key Steps**
1. Add global search across features, routes, actions, and plugins (by id/name/description).
2. Add advanced filters (by kind, origin, feature ownership, tags).
3. Allow saving common filter sets (dev‑only).

---

### Phase 8 – Health Gating & Warnings

**Goal**  
Surface basic health information (missing metadata, deprecated plugins, experimental features) in the App Map.

**Scope**
- Read‑only health indicators; no automatic gating yet.

**Key Steps**
1. Extend plugin and feature metadata with flags (experimental, deprecated, missing docs).
2. Compute health scores or warnings in the app map data layer.
3. Display badges or warnings in the UI (e.g. “metadata incomplete”, “deprecated”).

---

### Phase 9 – Performance / Load Metrics Integration

**Goal**  
Optionally integrate performance/load metrics to see which features/routes/plugins are “hot”.

**Scope**
- Light integration; data might come from mock or dev‑only instrumentation.

**Key Steps**
1. Define a minimal metric model (e.g. route load count, average render time).
2. Integrate with a dev‑only instrumentation layer or with external metrics where available.
3. Show metrics in a Statistics tab and near derived elements (routes/plugins).

---

### Phase 10 – Integration with Codegen & Scaffolding

**Goal**  
Leverage App Map data to drive code generation/scaffolding (e.g. new feature modules, plugin skeletons).

**Scope**
- Dev convenience only; no runtime behavior change.

**Key Steps**
1. Define templates for common artifacts (feature module, plugin, dev panel).
2. Add “Generate …” actions in the dev view that:
   - Use app map data to pre‑fill IDs, names, and wiring.
   - Emit code into appropriate folders (with user confirmation).
3. Document how generated artifacts should be reviewed and integrated.

