**Task: Central App Map Doc & Live App Map Dev Panel**

**Context**
- The project has multiple architectural docs (SYSTEM_OVERVIEW, PLUGIN_SYSTEM, APP_CAPABILITY_REGISTRY, etc.).
- There is a capability registry (`frontend/src/lib/capabilities`) and a plugin catalog (`frontend/src/lib/plugins/catalog.ts`).
- There are many plugin families and core systems (Game2D, Brain Lab, World Tools, Gallery Tools, Modules).
- It’s hard to get a single, up-to-date “mental map” of what exists and how it’s wired.

**Goal**
Create:
1. A central static doc `docs/APP_MAP.md` that acts as an architecture index and roadmap.
2. A live **App Map dev panel** that visualizes features, routes, and plugins using real data from the capability registry and plugin catalog.

This should NOT change any runtime behavior; it’s documentation + dev tooling.

---

## Part 1: `docs/APP_MAP.md` – Architecture Index

**Purpose**
- Provide one entry-point doc that orients a reader to:
  - Major subsystems (Capabilities, Plugins, Modules, Editor, Game).
  - Where to find detailed docs.
  - Where to find dev panels / live explorers.
  - High-level roadmap (with links to `claude-tasks/`).

**Structure (suggested)**

1. **Title & Overview**
   - `# App Map & Architecture Index`
   - 5–7 bullets summarizing:
     - Capability Registry (features/routes/actions/state).
     - Plugin Ecosystem (helpers, interactions, node types, gallery/world tools, UI plugins, generation UI plugins, future brain tools).
     - ModuleRegistry and feature modules.
     - Scene/Quest Editor (graph-based).
     - Game frontends (Game2D, NpcBrainLab, Simulation Playground).

2. **System Index (by concern)**
   - Subsections like:
     - **Capabilities & Modules**
       - Code: `frontend/src/lib/capabilities/`, `frontend/src/modules/`.
       - Docs: `docs/APP_CAPABILITY_REGISTRY.md`, `docs/CAPABILITY_HOOKS.md`.
       - Notes: how modules register features via `registerCoreFeatures`.
     - **Plugins**
       - Code: `frontend/src/lib/pluginLoader.ts`, `frontend/src/lib/plugins/`, `frontend/src/lib/registries.ts`, `frontend/src/lib/gallery/`, `frontend/src/lib/worldTools/`, `frontend/src/lib/providers/`.
       - Docs: `docs/PLUGIN_SYSTEM.md`, `docs/PLUGIN_REFERENCE.md`, `docs/INTERACTION_PLUGIN_MANIFEST.md`, `docs/GALLERY_TOOLS_PLUGIN.md`, `docs/PROVIDER_CAPABILITY_REGISTRY.md`.
     - **Graph / Scene Editor**
       - Code: `frontend/src/components/GraphPanel.tsx`, `frontend/src/components/inspector/InspectorPanel.tsx`, `frontend/src/modules/scene-builder`, `packages/types` (Scene/Node types).
       - Docs: `docs/NODE_EDITOR_DEVELOPMENT.md`, `docs/GRAPH_UI_LIFE_SIM_PHASES.md`.
     - **Game & Simulation**
       - Code: `frontend/src/routes/Game2D.tsx`, `frontend/src/routes/NpcBrainLab.tsx`, `frontend/src/lib/worldTools/`, (future `brainTools`), `frontend/src/routes/SimulationPlayground.tsx` when added.
       - Docs: `docs/HOTSPOT_ACTIONS_2D.md`, `docs/RELATIONSHIPS_AND_ARCS.md`.

3. **Plugin Kinds Overview**
   - A small table summarizing plugin kinds:
     - Columns: `Kind`, `Registry`, `Typical Location`, `Purpose`.
     - Include at least:
       - `session-helper`, `interaction`, `node-type`, `gallery-tool`, `world-tool`, `ui-plugin`, `generation-ui`, (future) `brain-tool`.

4. **Live Maps & Dev Panels**
   - List dev tools once implemented:
     - Capability Explorer (from CAPABILITY_HOOKS demo).
     - Plugin Explorer (from the catalog).
     - App Map Panel (below).
   - Link to routes/components, e.g. `/dev/app-map` once created.

5. **Roadmap / Next**
   - Short bullets linking to `claude-tasks/*`:
     - HUD Layout Designer.
     - Interaction Presets.
     - Graph Templates.
     - Per-world Themes & View Modes.
     - Simulation Playground.
   - Keep it short; no need to reproduce entire task specs.

**Implementation**
- Create `docs/APP_MAP.md` with the above structure.
- Reuse and link to existing docs; no need to duplicate content.

---

## Part 2: `AppMapPanel` – Live App Map Dev Panel

**Purpose**
- Provide a live, interactive view of:
  - Registered features/routes/actions (from capability registry).
  - Registered plugins (from plugin catalog).
- Help understand current state without digging into code.

**Key Data Sources**
- Capability registry:
  - `useCapabilityStore` (from `frontend/src/lib/capabilities/index.ts`).
  - Hooks from `CAPABILITY_HOOKS.md` and `frontend/src/lib/capabilities/hooks.ts`:
    - `useFeatures()`, `useFeatureRoutes(featureId)`, `useActions()`.
- Plugin catalog:
  - `frontend/src/lib/plugins/catalog.ts`:
    - `listAllPlugins()` returning `PluginMeta` with `kind`, `origin`, etc.

**Component Design**

Files to add:
- `frontend/src/components/dev/AppMapPanel.tsx`
- `frontend/src/routes/AppMapDev.tsx` (or similar dev route)

1. **`AppMapPanel` component**
   - Props: none.
   - Internal state:
     - `selectedFeatureId: string | null`.
     - Plugin filters: `kindFilter`, `originFilter`, `searchQuery`.
   - Data:
     - `const features = useFeatures();`
     - `const allActions = useActions();`
     - `const plugins = listAllPlugins();`
   - Layout (suggested):
     - Two-column or two-section layout:

       **Left: Features**
       - List of features:
         - Show name, id, category, icon.
         - Clicking sets `selectedFeatureId`.

       **Right: Detail & Plugins**
       - Top: Selected feature details:
         - Routes: use `useFeatureRoutes(selectedFeatureId)` or filter `getAllRoutes()` if needed.
         - Actions: `allActions.filter(a => a.featureId === selectedFeatureId)`.
       - Bottom: Plugin list:
         - Filters for plugin `kind` and `origin`.
         - Search by label/description.
         - Each plugin row shows:
           - Label, `kind` badge, `origin` badge.

   - Optionally, if a feature is selected, you can:
     - Highlight plugins that likely relate to that feature (e.g., world tools when `featureId === 'game'`, gallery tools when `featureId === 'assets'`).
     - This can be a simple heuristic; no deep modeling required.

2. **Dev Route**
   - Add `frontend/src/routes/AppMapDev.tsx`:
     ```tsx
     import { AppMapPanel } from '../components/dev/AppMapPanel';

     export function AppMapDevRoute() {
       return (
         <div className="p-6 space-y-4">
           <h1 className="text-2xl font-semibold">App Map (Live)</h1>
           <p className="text-sm text-neutral-600 dark:text-neutral-400">
             Live view of registered features, routes, actions, and plugins.
           </p>
           <AppMapPanel />
         </div>
       );
     }
     ```
   - Wire it into `App.tsx` as a dev-only route (e.g. `/dev/app-map`), possibly behind `ProtectedRoute`.

**Constraints**
- No backend changes.
- Read-only view; panel should not mutate state or capabilities.
- Keep UI simple and consistent with existing dev/config panels (`@pixsim7/ui`, Tailwind).

**Success Criteria**
- `docs/APP_MAP.md` gives a clear index into the architecture and links to key docs and dev tools.
- Visiting `/dev/app-map` (or the chosen route) shows:
  - A list of features with their routes and actions.
  - A list of plugins with kind/origin badges and filters.
- The panel updates automatically as features and plugins are registered in code.


---

## Phase 3: Interactive Architecture Visualization

Transform static documentation into interactive exploration tools.

**Phase 3 Goals**
- Build **3D architecture visualization** of system components.
- Add **dependency graph explorer** with filtering.
- Create **code flow tracer** for debugging.
- Implement **performance heatmaps** on architecture.

**Key Features**
- 3D visualization:
  - Component hierarchy in 3D space.
  - Data flow animations.
  - Zoom and rotation controls.
- Dependency analysis:
  - Import/export graphs.
  - Circular dependency detection.
  - Impact analysis.
- Performance overlay:
  - Render time heatmaps.
  - Memory usage visualization.
  - Network request tracking.

---

## Phase 4: Development Intelligence & Automation

Add AI-powered development assistance and automation.

**Phase 4 Goals**
- Implement **code generation** from architecture diagrams.
- Add **automated refactoring** suggestions.
- Create **architecture linting** rules.
- Build **development copilot** features.

**Key Features**
- Code generation:
  - Scaffold from diagrams.
  - Boilerplate automation.
  - Type generation.
- Refactoring engine:
  - Pattern detection.
  - Automated fixes.
  - Migration scripts.
- Architecture rules:
  - Dependency constraints.
  - Naming conventions.
  - Complexity limits.

---

## Phase 5: Enterprise Architecture Platform

Full architecture governance and team collaboration platform.

**Phase 5 Goals**
- Build **architecture review** workflow system.
- Add **compliance checking** for standards.
- Create **architecture metrics** dashboard.
- Implement **multi-project** architecture management.

**Key Features**
- Review system:
  - Change proposals.
  - Impact assessments.
  - Approval workflows.
- Compliance:
  - Security standards.
  - Performance budgets.
  - Accessibility requirements.
- Enterprise features:
  - Cross-project dependencies.
  - Shared component library.
  - Architecture roadmaps.
