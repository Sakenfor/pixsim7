**Task: Central App Map Doc & Live App Map Dev Panel (Multi‑Phase)**

**Context**
- The project has multiple architectural docs (`SYSTEM_OVERVIEW`, `PLUGIN_SYSTEM`, `APP_CAPABILITY_REGISTRY`, etc.).
- There is a capability registry (`frontend/src/lib/capabilities`) and a plugin catalog (`frontend/src/lib/plugins/catalog.ts`).
- There are many plugin families and core systems (Game2D, Brain Lab, World Tools, Gallery Tools, Modules).
- It’s hard to get a single, up‑to‑date “mental map” of what exists and how it’s wired.

We want:
1. A central static doc `docs/APP_MAP.md` that acts as an architecture index and roadmap.
2. A live **App Map dev panel** that visualizes features, routes, and plugins using real data.

Below are 10 phases for App Map docs + dev tooling.

> **For agents:** Phases 1–2 are implemented. Use later phases to track further enhancements (graphs, health, testing).

### Phase Checklist

- [x] **Phase 1 – Static APP_MAP.md Architecture Index**
- [x] **Phase 2 – AppMapPanel Dev Route**
- [ ] **Phase 3 – Dependency Graph Visualization**
- [ ] **Phase 4 – Plugin Detail Drill‑Down**
- [ ] **Phase 5 – Capability Testing Panel**
- [ ] **Phase 6 – Export / Import App Map Data**
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
   - Live dev tools section (including App Map route).
2. Link `APP_MAP.md` from `README.md` and other core docs where appropriate.

---

### Phase 2 – AppMapPanel Dev Route

**Goal**  
Provide a live, interactive view of registered features, routes, actions, and plugins.

**Scope**
- Dev‑only route, behind authentication.

**Key Steps**
1. Implement:
   - `frontend/src/components/dev/AppMapPanel.tsx` – main panel.
   - `frontend/src/routes/AppMapDev.tsx` – route component.
   - `frontend/src/modules/app-map/index.ts` – module for feature registration.
2. Integrate with capability registry:
   - Register the App Map feature.
   - Add `/app-map` route under a protected area.
3. Panel features:
   - Features & Routes tab.
   - Plugin Ecosystem tab (kinds, origins, filters).
   - Statistics tab (feature/plugin counts, distribution).

---

### Phase 3 – Dependency Graph Visualization

**Goal**  
Visualize relationships between features, routes, and plugins as a graph.

**Scope**
- Read‑only, dev‑only visualization; no runtime dependencies on the graph.

**Key Steps**
1. Add a data‑model for dependencies (feature‑>route, feature‑>plugin, plugin‑>feature).
2. Create a small graph visualization (e.g. Cytoscape, custom SVG) showing nodes and edges.
3. Integrate as a tab in `AppMapPanel` (e.g. “Graph”).

---

### Phase 4 – Plugin Detail Drill‑Down

**Goal**  
Allow developers to drill down into plugin details directly from the App Map.

**Scope**
- For each plugin: show routes, hooks, source location, and related docs.

**Key Steps**
1. Extend plugin metadata with source hints (file path, kind, optional doc links).
2. In the plugin view, add a detail panel:
   - Hook registrations.
   - Consumed/provided features.
   - Links to docs and source (where applicable).
3. Optionally integrate with editor links (e.g. VSCode URI) for local use.

---

### Phase 5 – Capability Testing Panel

**Goal**  
Provide a dev‑only panel to exercise capabilities: trigger actions, navigate to routes, inspect feature state.

**Scope**
- Dev‑only; no behavior in production builds.

**Key Steps**
1. Add a “Testing” tab in `AppMapPanel`:
   - List actions (with descriptions).
   - Allow invoking actions with minimal input.
2. Provide quick navigation to routes (e.g. click route to open in a new tab).
3. Optionally show feature state snapshots (where safe).

---

### Phase 6 – Export / Import App Map Data

**Goal**  
Allow exporting the current feature/plugin map to JSON for analysis or inline docs, and importing recorded maps.

**Scope**
- Export is primary; import is dev‑only for comparison.

**Key Steps**
1. Define a JSON schema for the app map (features, routes, plugins, links).
2. Add “Export App Map” button that downloads current map.
3. Optionally add “Import App Map” to load a snapshot and compare it with the live one.

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
3. Display badges or warnings in the App Map UI (e.g. “metadata incomplete”, “deprecated”).

---

### Phase 9 – Performance / Load Metrics Integration

**Goal**  
Optionally integrate performance/load metrics to see which features/routes/plugins are “hot”.

**Scope**
- Light integration; data might come from mock or dev‑only instrumentation.

**Key Steps**
1. Define a minimal metric model (e.g. route load count, average render time).
2. Integrate with a dev‑only instrumentation layer or with external metrics where available.
3. Show metrics in the Statistics tab and near derived elements (routes/plugins).

---

### Phase 10 – Integration with Codegen & Scaffolding

**Goal**  
Leverage App Map data to drive code generation/scaffolding (e.g. new feature modules, plugin skeletons).

**Scope**
- Dev convenience only; no runtime behavior change.

**Key Steps**
1. Define templates for common artifacts (feature module, plugin, dev panel).
2. Add “Generate…” actions in `AppMapPanel` that:
   - Use app map data to pre‑fill IDs, names, and wiring.
   - Emit code into appropriate folders (with user confirmation).
3. Document how generated artifacts should be reviewed and integrated.

