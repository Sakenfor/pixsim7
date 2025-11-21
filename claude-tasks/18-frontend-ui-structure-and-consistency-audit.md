**Task: Frontend UI Structure & Consistency Audit (Agent‑Centric)**

> **For Agents (How to use this file)**
> - This is a **checklist-oriented task** for auditing and keeping the frontend UI structure coherent over time.
> - Use it when you:
>   - Add new UI sections/routes.
>   - Refactor or move components between folders.
>   - Suspect duplication or drift between `frontend/`, `packages/ui/`, and `packages/game-ui/`.
> - Read these first for context:
>   - `UI_CONSOLIDATION_COMPLETED.md` – previous consolidation work and decisions  
>   - `frontend/src/components/README.md` – component organization and conventions  
>   - `packages/ui/README.md` – shared UI components  
>   - `packages/game-ui/README.md` (if present) – game‑specific UI surfaces.
> - This task is **not** about adding new features; it’s about verifying that UI pieces live in the right place, follow conventions, and don’t re‑invent existing patterns.

---

> **Note:** This task was originally written against a `frontend/` + `packages/game-ui` layout. The unified frontend now lives under `apps/main/`, shared UI under `packages/shared/ui`, and game UI under `packages/game/components`. For current structure and route mappings, see `docs/APP_MAP.md` and `docs/frontend/COMPONENTS.md`.

## Context

The UI has grown to cover:

- Core app shell (home/workspace/assets/graph).
- Game/editor surfaces (scene graph, behavior editor, interaction tools).
- Shared UI library (`@pixsim7/ui`) and game‑focused UI (`@pixsim7/game-ui`).

You have already done one large consolidation pass:

- Centralized Toasts and ExecutionList into shared components (see `UI_CONSOLIDATION_COMPLETED.md`).
- Verified some “unused” components were in fact used.

But as new features land (NPC behavior tools, generations UI, plugin/workspace panels), there’s a risk of:

- Components drifting into ad‑hoc folders.
- Duplicate patterns emerging (e.g. multiple list/panel implementations).
- Mixed responsibilities (feature logic baked into generic UI, or vice versa).

**Goal:** Provide an **agent‑centric audit task** that:

- Gives a repeatable checklist for “is the UI still organized?”  
- Helps agents decide where new UI should live.  
- Surfaces obvious duplicates or inconsistencies early, without forcing over‑abstraction.

---

## Phase Checklist

- [x] **Phase 18.1 – Component & Route Inventory (High‑Level Map)** ✅ Completed 2025-11-19
- [x] **Phase 18.2 – Folder & Naming Consistency Check** ✅ Completed 2025-11-19
- [x] **Phase 18.3 – Shared vs Feature UI Boundaries (packages/ui, game-ui, frontend)** ✅ Completed 2025-11-19
- [x] **Phase 18.4 – Pattern Duplication & Consolidation Opportunities** ✅ Completed 2025-11-19
- [x] **Phase 18.5 – Agent‑Facing Conventions & Checklists** ✅ Completed 2025-11-19
- [x] **Phase 18.6 – Documentation & App Map Updates** ✅ Completed 2025-11-19

Each phase is designed to be run by an agent as a **short audit**; you can do 18.1–18.3 in one pass, then 18.4 if you see drift.

**Audit Summary (2025-11-19):**
- ✅ UI organization is **excellent** - clear naming conventions, proper folder structure
- ✅ Shared package boundaries are **clean** - no violations detected
- ✅ No significant duplication - previous consolidation work successful
- ✅ Comprehensive agent conventions documented for future development

---

## Phase 18.1 – Component & Route Inventory (High‑Level Map)

**Goal**  
Ensure there’s a **current, concise map** of major UI surfaces and where their components live.

**Scope**

- `frontend/src/routes/*`
- Top‑level directories under `frontend/src/components/*`
- Shared libraries: `packages/ui`, `packages/game-ui`.

**Agent Checklist**

1. **List routes**:
   - From `frontend/src/routes`, enumerate the key app pages (Home, Workspace, Assets, Graph, Game2D, NpcBrainLab, SimulationPlayground, PluginWorkspace, etc.).
2. **Map routes to component clusters**:
   - For each major route, note which component directories are primarily used (e.g. `Game2D` → `components/game`, `components/hotspots`, `packages/game-ui`).
3. **Update/validate component README**:
   - Ensure `frontend/src/components/README.md` has a short section that:
     - Lists the main component subfolders.
     - Mentions which routes use them.
4. **Result**:
   - A short, up‑to‑date bullet list at the bottom of this file or in the components README, e.g.:
     - `Home` → `components/navigation`, `components/layout`.
     - `Graph` → `components/graph`, `components/inspector`.
     - `Game2D` → `components/game`, `components/hotspots`, `packages/game-ui`.

**Status:** ✅ Completed 2025-11-19

### Results: Route → Component Cluster Map

**Primary Application Routes:**

- **Home** (`/`)
  - Uses: `@pixsim7/ui` (Button, Panel, ThemeToggle), navigation, layout
  - Purpose: Landing page with quick access links

- **Workspace** (`/workspace`)
  - Uses: `components/layout` (DockviewWorkspace, WorkspaceToolbar)
  - Purpose: Dockable workspace for orchestrating panels

- **Assets** (`/assets`)
  - Uses: `components/media`, `components/layout` (MasonryGrid), `components/assets`, `components/gallery`
  - Purpose: Gallery/asset browser

- **Graph** (`/graph/:id`)
  - Uses: Minimal (stub route with basic hooks)
  - Purpose: Lineage graph viewer (stub)

- **Game2D** (`/game2d`)
  - Uses: `components/game` (DialogueUI, GameNotification, WorldToolsPanel, RegionalHudLayout, HudLayoutEditor, InteractionPresetEditor, HudCustomizationPanel, HudProfileSwitcher, UserPreferencesPanel)
  - Purpose: 2D game view with NPC interactions and HUD

- **SimulationPlayground** (`/simulation`)
  - Uses: `components/simulation` (LocationPresenceMap, TimelineScrubber, ScenarioComparison, WorldStateOverview, MultiRunComparison, ConstraintRunner, SimulationPluginsPanel, ExportImportPanel), `components/game` (WorldToolsPanel), `components/brain` (BrainToolsPanel)
  - Purpose: Simulation testing and constraint running

- **PluginWorkspace** (`/plugins`)
  - Uses: `components/plugins` (PluginBrowser), `components/capabilities` (CapabilityBrowser, CapabilityAutocomplete)
  - Purpose: Plugin and capability management

- **NpcBrainLab** (`/npc-brain`)
  - Uses: `components/brain` (BrainToolsPanel), `components/shapes` (BrainShape)
  - Purpose: NPC brain/behavior visualization

- **NpcPortraits** (`/npc-portraits`)
  - Uses: Top-level `NpcPreferencesEditor`
  - Purpose: NPC portrait and preference management

- **GizmoLab** (`/gizmo`)
  - Uses: `components/minigames` (SceneGizmoMiniGame), `components/gizmos` (InteractiveTool)
  - Purpose: Interactive gizmo testing

- **Automation** (`/automation`)
  - Uses: `components/automation` (DeviceList, PresetList, ExecutionList, LoopList)
  - Purpose: Automation device and preset management

**Top-Level Component Panels** (in `frontend/src/components/`):
- `GraphPanel.tsx`, `ArcGraphPanel.tsx` → Graph/scene editing
- `SceneBuilderPanel.tsx` → Scene property inspector
- `HotspotEditor.tsx`, `NpcSlotEditor.tsx`, `EdgeEffectsEditor.tsx` → Game element editors
- `PluginCatalogPanel.tsx`, `PluginConfigPanel.tsx`, `PluginManager.tsx` → Plugin management
- `SceneMetadataEditor.tsx`, `SessionStateViewer.tsx`, `WorldContextSelector.tsx` → Scene/world tools

**Component Directory Organization:**
- `automation/` → Device, preset, execution, loop management
- `brain/` → NPC brain/AI tools
- `capabilities/` → Capability browsing and selection
- `control/` → Control center, cube system, docking
- `game/` → Game HUD, dialogue, interactions, inventory, world tools
- `generation/` → Generation-related UI
- `gizmos/` → Interactive gizmo tools
- `graph/` → Graph node renderers, template wizards
- `inspector/` → Node property editors
- `interactions/` → Interaction menus, history, suggestions
- `layout/` → Workspace layout components
- `media/` → Media card components
- `minigames/` → Mini-game implementations
- `plugins/` → Plugin browser and testing
- `simulation/` → Simulation visualization and analysis
- `assets/`, `gallery/`, `navigation/`, `panels/`, `shapes/`, etc.

**Shared Package Exports:**
- `@pixsim7/ui`: Button, Badge, Dropdown, FormField, Input, Modal, Panel, ProgressBar, PromptInput, Select, StatusBadge, Table, Tabs, ThemeToggle, Toast, Tooltip, useTheme, useToast
- `@pixsim7/game-ui`: ScenePlayer, ReflexMiniGame (generic game UI, no frontend dependencies)

---

## Phase 18.2 – Folder & Naming Consistency Check

**Goal**  
Check that components live in **sensible, predictable folders** and follow naming conventions.

**Scope**

- `frontend/src/components/*` (top‑level and key subfolders).
- `frontend/src/routes/*` (to ensure route names align with component clusters).

**Agent Checklist**

1. **Scan component subfolders**:
   - `control`, `graph`, `inspector`, `game`, `simulation`, `plugins`, `navigation`, `layout`, etc.
   - Verify that:
     - “Control center” UI lives in `control/`.
     - Graph‑related components live in `graph/` or `inspector/`.
     - Plugin UIs live under `plugins/`.
2. **Check naming consistency**:
   - Components that behave like XPanel are suffixed `*Panel.tsx` (GraphPanel, PluginCatalogPanel).
   - Editors are `*Editor.tsx` (NpcPreferencesEditor, SceneMetadataEditor).
   - Lists and views follow existing patterns (e.g. `*List.tsx`, `*Detail.tsx`).
3. **Flag anomalies**:
   - Components that clearly belong in a different folder (e.g. a plugin-specific panel sitting in `common/`).
   - New components that don’t follow suffix patterns.
4. **Document findings**:
   - Add a brief “UI Folder Notes” section to `frontend/src/components/README.md` or this doc, with bullets like:
     - “`Game2DStatusBar.tsx` currently lives in `components/common`; move to `components/game` on next pass.”

**Status:** ✅ Completed 2025-11-19

### Results: Naming Consistency & Folder Organization Analysis

**Naming Patterns - CONSISTENT ✓**

The codebase follows clear, predictable naming conventions:

- **`*Panel.tsx`** (30 files) - Panel-style components for toolbars, settings, inspectors
  - Examples: `GraphPanel`, `PluginCatalogPanel`, `WorldToolsPanel`, `InspectorPanel`
  - Well distributed across subdirectories: `game/`, `simulation/`, `control/`, `dev/`, etc.

- **`*Editor.tsx`** (25 files) - Property/configuration editors
  - Examples: `ChoiceNodeEditor`, `HotspotEditor`, `InteractionPresetEditor`
  - Mostly in `inspector/` for node editors, but also in feature directories

- **`*List.tsx`** (4 files) - List views, all in `automation/`
  - `DeviceList`, `PresetList`, `ExecutionList`, `LoopList`
  - Paired with corresponding `*Card.tsx` components

- **`*Card.tsx`** (6 files) - Card-based list items
  - `DeviceCard`, `PresetCard`, `ExecutionCard`, `LoopCard`, `MediaCard`, `AssetCard`
  - All in feature-specific directories (`automation/`, `media/`, `control/`)

- **`*Renderer.tsx`** (8 files) - Graph node renderers, all in `graph/`
  - `ChoiceNodeRenderer`, `ArcNodeRenderer`, `SeductionNodeRenderer`, etc.
  - Excellent consistency - all renderers in one place

- **`*UI.tsx`, `*View.tsx`, `*Viewer.tsx`** - Specialized UI/display components
  - `DialogueUI`, `TreeFolderView`, `SessionStateViewer`, `MediaViewerCube`

**Folder Organization - MOSTLY GOOD ✓ with notes**

**Well-Organized Directories:**
- ✅ `automation/` - All automation components properly grouped (lists, cards, builders)
- ✅ `graph/` - All node renderers together
- ✅ `inspector/` - All node editors together
- ✅ `simulation/` - All simulation tools together
- ✅ `game/` - Large collection of game-specific UI (19 files)
- ✅ `control/` - Control center and cube system components
- ✅ `dev/` - Development tools panels

**Top-Level Components (14 files in `frontend/src/components/`):**

These components are directly in the components directory, not in subdirectories:

1. **Workspace-Integrated Panels** (Used by DockviewWorkspace/FloatingPanelsManager):
   - ✅ `GraphPanel.tsx`, `ArcGraphPanel.tsx` - Major dockable panels, top-level is appropriate
   - ✅ `SceneBuilderPanel.tsx` - Major dockable panel, top-level is appropriate
   - ⚠️ `PluginCatalogPanel.tsx`, `PluginConfigPanel.tsx` - Could move to `components/plugins/`
   - ✅ `PluginManager.tsx`, `PluginOverlays.tsx` - Widely used across plugin system, top-level OK

2. **Feature Editors** (Route-specific usage):
   - ⚠️ `HotspotEditor.tsx` - Used by GameWorld route only → Consider moving to `components/game/`
   - ⚠️ `NpcSlotEditor.tsx` - Used by GameWorld route only → Consider moving to `components/game/`
   - ⚠️ `NpcPreferencesEditor.tsx` - Used by NpcPortraits route → Consider moving to `components/game/` or new `components/npc/`
   - ⚠️ `EdgeEffectsEditor.tsx` - Graph-related → Consider moving to `components/graph/` or `components/inspector/`
   - ⚠️ `SceneMetadataEditor.tsx` - Scene-related → Consider moving to `components/scene/` or with SceneBuilderPanel

3. **Multi-Purpose Components**:
   - ✅ `WorldContextSelector.tsx` - Used across multiple contexts, top-level is appropriate
   - ✅ `SessionStateViewer.tsx` - Debug/state viewer, top-level OK

**Minor Observations:**
- `common/` directory only contains `ErrorBoundary.tsx` - very clean, not being used as a dumping ground ✓
- `panels/` subdirectory only has `SceneLibraryPanel.tsx` - could potentially be merged elsewhere or expanded
- No obvious misplacements of components in wrong feature directories

**Recommended Actions (Optional):**

These are low-priority suggestions that could improve discoverability:

1. **Consider creating** `components/plugins/` structure:
   ```
   components/plugins/
     PluginBrowser.tsx (already here)
     PluginTestHarnesses.tsx (already here)
     PluginCatalogPanel.tsx (move from top-level)
     PluginConfigPanel.tsx (move from top-level)
   ```

2. **Consider creating** `components/scene/` for scene-related editors:
   ```
   components/scene/
     SceneMetadataEditor.tsx (move from top-level)
     (SceneBuilderPanel could stay top-level as it's a major dockable panel)
   ```

3. **Consider moving** game-specific editors to `components/game/`:
   ```
   components/game/
     HotspotEditor.tsx (move from top-level)
     NpcSlotEditor.tsx (move from top-level)
     NpcPreferencesEditor.tsx (move from top-level)
   ```

**However**, the current top-level organization is **not problematic** - it's clear that these are major, cross-cutting components. Moving them is optional and should be done incrementally to avoid breaking imports.

---

## Phase 18.3 – Shared vs Feature UI Boundaries

**Goal**  
Ensure that **truly generic UI** lives in `@pixsim7/ui` / `@pixsim7/game-ui`, and that feature‑specific logic stays in `frontend/`.

**Scope**

- `packages/ui/*`
- `packages/game-ui/*`
- Shared imports inside `frontend/src/components/*`.

**Agent Checklist**

1. **Scan `packages/ui` exports**:
   - Confirm they are generic (Buttons, Toasts, Tabs, StatusBadges, PromptInput, etc.).
   - Ensure no domain logic (no hardcoded “Graph” or “Game2D” concepts).
2. **Scan `packages/game-ui`** (if present):
   - Confirm it holds reusable game‑specific UI (scene player, HUD elements) but not world‑specific logic.
3. **Check frontend for duplication**:
   - Search for implementations of buttons/toasts/badges/etc. in `frontend/src/components/common` that should be using `@pixsim7/ui`.
   - If found, add to a small “Consolidation TODO” list at the bottom of this doc or in `UI_CONSOLIDATION_COMPLETED.md`.
4. **Ensure new components pick the right home**:
   - When adding new generic components, prefer `packages/ui` and import from there in frontend.

**Status:** ✅ Completed 2025-11-19

### Results: Shared Package Boundaries Analysis

**Package Integrity - EXCELLENT ✓✓✓**

The shared UI packages maintain clean architectural boundaries with no violations detected:

**`@pixsim7/ui` Analysis:**
- **Exports**: 16 generic UI components
  - Badge, Button, Dropdown, FormField, Input, Modal, Panel
  - ProgressBar, PromptInput, Select, StatusBadge, Table, Tabs
  - ThemeToggle, Toast, Tooltip
  - Hooks: useTheme, useToast
- **Generic Nature**: ✅ All components are domain-agnostic
  - No references to: graph, plugin, automation, npc, world, scene, game concepts
  - No hardcoded app-specific logic
- **Dependency Integrity**: ✅ No imports from `frontend/` or parent applications
- **Usage**: Widely imported across frontend (20+ files use Toast, Button, etc.)

**`@pixsim7/game-ui` Analysis:**
- **Exports**: 3 game-specific reusable components
  - ScenePlayer - Generic scene playback component
  - ReflexMiniGame - Generic reflex-based mini-game
  - MiniGameHost - Mini-game host/registry system
- **Generic Nature**: ✅ Game-specific but reusable across different games/worlds
  - No hardcoded world or character data
  - Accepts configuration via props
- **Dependency Integrity**: ✅ No imports from `frontend/` or parent applications
  - Only imports from: `@pixsim7/game-core`, `@pixsim7/types`, `@pixsim7/ui`, `react`
- **Usage**: Used in frontend Game2D route and gizmo implementations

**Frontend Component Usage - PROPER BOUNDARIES ✓**

**Appropriate Use of Shared Components:**
- ✅ Frontend extensively uses `@pixsim7/ui` components (Button, Modal, Panel, Toast, etc.)
- ✅ Frontend uses `@pixsim7/game-ui` for ScenePlayer and mini-games
- ✅ No duplicate Button/Modal/Toast implementations in frontend (previous consolidation successful)
- ✅ StatusBadge from `@pixsim7/ui` used for generic status indicators

**Appropriate Use of Custom Frontend Components:**
- ✅ Specialized game UI (InteractionMenu, DialogueUI) uses custom styling - appropriate
  - These are game-specific interfaces with unique UX needs
  - Using native `<button>` with custom CSS is correct for these specialized contexts
- ✅ Feature-specific editors/panels stay in frontend - appropriate
  - GraphPanel, PluginConfigPanel, etc. have app-specific logic
  - Correctly NOT moved to shared packages

**No Duplication Found ✓**

Checked for duplicate implementations:
- ✅ No custom Button implementations in `frontend/src/components/`
- ✅ No custom Modal/Toast systems (previous consolidation held)
- ✅ No badge/status implementations duplicating `@pixsim7/ui/StatusBadge`
- ✅ No generic form components duplicating `@pixsim7/ui` (Input, Select, FormField)

**Previous Consolidation Work (Reference):**
From `UI_CONSOLIDATION_COMPLETED.md` (2025-11-19):
- Toast system successfully consolidated from frontend → `@pixsim7/ui`
- 518 lines removed, 26 files updated
- Verified: Dropdown, StatusBadge, Tabs, ThemeToggle all properly used from shared package

**Recommendations:**

1. **Continue Current Approach** ✅
   - The boundaries are well-maintained
   - Frontend correctly uses shared components for generic UI
   - Frontend correctly keeps specialized UI local

2. **When Adding New Generic Components:**
   - Add to `@pixsim7/ui` if truly generic (buttons, inputs, badges, etc.)
   - Add to `@pixsim7/game-ui` if game-specific but reusable across worlds
   - Keep in `frontend/` if app-specific or tightly coupled to features

3. **Watch For:**
   - New button/input/modal implementations appearing in frontend
   - Domain logic creeping into `@pixsim7/ui`
   - Frontend dependencies in shared packages

**Overall Assessment**: Boundaries are **EXCELLENT** with no violations. The team is following proper package architecture.

---

## Phase 18.4 – Pattern Duplication & Consolidation Opportunities

**Goal**  
Identify **real** duplication (beyond what was already cleaned up) and decide whether to consolidate or leave as is.

**Scope**

- List‑like components (ExecutionList, DeviceList, LoopList, PresetList, etc.).
- Panel‑style components (various `*Panel.tsx`).
- Status/indicator widgets (Job/Generation status, plugin health indicators, etc.).

**Agent Checklist**

1. **Search for obvious duplicates**:
   - Components with similar names or structure across different folders.
2. **Compare behavior and props**:
   - If two lists/panels share **70%+** structure and differ only in data, consider extracting a shared presentational component or hook.
   - If they differ significantly (as noted in `UI_CONSOLIDATION_COMPLETED.md` for lists/panels), document that and leave them separate.
3. **Record decisions**:
   - Maintain a table in this doc, e.g.:

     | Pattern | Files | Decision | Notes |
     |--------|-------|----------|-------|
     | Status chips | `GenerationStatusDisplay`, `PluginHealthBadge` | Leave separate | Different data + semantics |
     | List pattern | `ExecutionList`, `PresetList` | Maybe later | Similar, but models differ |

4. **Only consolidate when it helps**:
   - Avoid premature abstraction; follow the same caution as in `UI_CONSOLIDATION_COMPLETED.md`.

**Status:** ✅ Completed 2025-11-19

### Results: Pattern Analysis & Consolidation Decisions

**Summary:** No significant new duplication found beyond what was already addressed in the November 2025 UI consolidation. Existing patterns show appropriate specialization.

#### Pattern Analysis Table

| Pattern | Files | Similarity | Decision | Rationale |
|---------|-------|------------|----------|-----------|
| **List + CRUD** | `PresetList`, `LoopList` | ~70% structural similarity | ✅ **Leave separate** | Different data models (Preset vs Loop), different business logic, premature abstraction. Already noted in UI_CONSOLIDATION_COMPLETED.md |
| **Simple Lists** | `DeviceList`, `ExecutionList` | ~40% similarity | ✅ **Leave separate** | DeviceList is simple view-only, ExecutionList has race-condition prevention via refs. ExecutionList already deduplicated (removed buggy _new version) |
| **Node Editors** | 11 files in `inspector/` | Shared structure | ✅ **Already consolidated** | Common logic extracted to `useNodeEditor` hook. Individual editors handle node-specific config. Excellent abstraction level. |
| **Panel Components** | 30 files across codebase | Functionally diverse | ✅ **Leave separate** | Each serves different purpose (GraphPanel, WorldToolsPanel, etc.). Too diverse to standardize without over-abstraction. |
| **Modal/Dialog** | `SavePresetDialog`, `TemplateWizardDialog` | Different implementations | ⚠️ **Minor opportunity** | SavePresetDialog uses `@pixsim7/ui/Modal` ✓. TemplateWizardDialog uses custom markup. Consider migrating TemplateWizardDialog to use shared Modal for consistency. |
| **Custom CSS Files** | 18 files (mostly gizmos, interactions) | Specialized styling | ✅ **Leave separate** | All for specialized UI (gizmos, interaction menus, brain shapes). Custom styling is appropriate for these unique interfaces. |
| **Builder Components** | `ActionBuilder`, `PresetPlaylistBuilder`, `SceneBuilderPanel` | Different domains | ✅ **Leave separate** | Each builds different entities with domain-specific logic. No shared abstraction would help. |
| **Status/Health Indicators** | `MoodIndicator`, `GenerationHealthView` | Different purposes | ✅ **Leave separate** | MoodIndicator is game UI, GenerationHealthView is dev tooling. Different contexts and data. |

#### Previous Consolidation Work (Reference)

From `UI_CONSOLIDATION_COMPLETED.md` (2025-11-19):
- ✅ Toast system consolidated → `@pixsim7/ui` (518 lines removed)
- ✅ ExecutionList deduplicated (removed buggy _new version)
- ✅ Verified Dropdown, StatusBadge, Tabs, ThemeToggle properly used from shared package

#### Detailed Findings

**Well-Abstracted Patterns ✓**

1. **Node Editors** (`inspector/` directory):
   - 11 editor components share `useNodeEditor` hook
   - Hook provides: form state management, load/save logic, apply handler
   - Individual editors handle node-specific configuration
   - **Assessment**: Excellent abstraction - shared logic via hooks, specialized UI per node type

2. **Automation Lists** (`automation/` directory):
   - DeviceList, PresetList, ExecutionList, LoopList
   - All follow similar patterns but with domain-specific data/actions
   - PresetList and LoopList both have list/create/edit views, CRUD operations, filters
   - **Assessment**: Similar structure is due to domain patterns, not copy-paste. Appropriate specialization.

3. **Card Components**:
   - DeviceCard, PresetCard, ExecutionCard, LoopCard paired with their respective lists
   - Each displays domain-specific data
   - **Assessment**: Appropriate - cards match their list's data model

**Minor Consolidation Opportunity ⚠️**

1. **TemplateWizardDialog** (frontend/src/components/graph/TemplateWizardDialog.tsx):
   - Currently uses custom dialog markup
   - Could migrate to `@pixsim7/ui/Modal` for consistency
   - **Impact**: Low priority, minor consistency improvement
   - **Effort**: Low (simple refactor)
   - **Recommendation**: Consider on next maintenance pass, not urgent

**Appropriate Specialization (NOT Duplication) ✅**

1. **Game UI Components**:
   - InteractionMenu, DialogueUI, NpcInteractionPanel use native `<button>` with custom CSS
   - These are specialized game interfaces with unique UX requirements
   - **Assessment**: Correct - these shouldn't use generic Button from @pixsim7/ui

2. **Gizmo Components**:
   - 6 gizmo CSS files for specialized interactive visualizations
   - Each has unique behavior and appearance
   - **Assessment**: Appropriate specialization for interactive demos/tools

3. **Builder/Wizard Components**:
   - ActionBuilder, PresetPlaylistBuilder, SceneBuilderPanel, TemplateWizardPalette
   - Each builds different domain entities
   - **Assessment**: Domain-specific, no useful abstraction available

#### No New Duplication Detected ✅

Scanned for:
- ✅ No duplicate Button/Modal/Toast implementations (previous consolidation held)
- ✅ No duplicate form input components
- ✅ No duplicate status badge implementations
- ✅ No copy-paste list implementations (verified as domain specialization)
- ✅ No duplicate CSS patterns (all specialized)

#### Recommendations

1. **Continue Current Approach** ✅
   - The codebase shows healthy specialization, not problematic duplication
   - Previous consolidation work (Toast, ExecutionList) was appropriate
   - Current "similar" patterns are due to domain alignment, not duplication

2. **Optional Minor Improvements**:
   - Consider migrating TemplateWizardDialog to use `@pixsim7/ui/Modal` on next maintenance pass

3. **Avoid Over-Consolidation**:
   - List components (PresetList, LoopList) are similar by design, not accident
   - Attempting to abstract them would create premature, fragile abstractions
   - Current approach allows domain-specific evolution

**Overall Assessment**: The codebase demonstrates **appropriate pattern usage** with no significant duplication concerns. The November 2025 consolidation was successful and boundaries remain clean.

---

## Phase 18.5 – Agent‑Facing Conventions & Checklists

**Goal**  
Codify **simple rules** agents should follow when adding/modifying UI to keep things tidy.

**Scope**

- Brief conventions referenced by other tasks and AGENTS docs.

**Agent Checklist (to document and then follow)**

Add a short “Agent UI Checklist” section either here or in `frontend/src/components/README.md`:

- When adding a **new screen**:
  - Put the route under `frontend/src/routes`.
  - Create a dedicated folder under `components` *if* the route has 2+ significant components (e.g. `components/game`, `components/simulation`).
  - Don’t put heavy logic in the route file; delegate to components.
- When adding a **new reusable UI element**:
  - Check `@pixsim7/ui` first; add there if generic and then import into frontend.
  - If game‑specific but reusable across worlds, consider `@pixsim7/game-ui`.
- When adding a **status/indicator widget**:
  - Prefer a `*Status` or `*Badge` naming convention.
  - Co‑locate with the feature area (`generations`, `plugins`, `game`) rather than `common` unless truly generic.
- Before writing a **new list/panel**:
  - Look for existing patterns (`ExecutionList`, `PresetList`, `*Panel.tsx`).
  - Align naming and basic structure with the closest existing pattern.

**Status:** ✅ Completed 2025-11-19

### Agent UI Development Checklist

**When adding a new screen/route:**

1. **Create the route file** in `frontend/src/routes/`
   - Name it descriptively: `Game2D.tsx`, `PluginWorkspace.tsx`, `SimulationPlayground.tsx`
   - Keep route files focused on layout and composition
   - Delegate complex logic to components

2. **Organize components** based on scope:
   - **Single significant component?** → Keep it in the route file or top-level `components/`
   - **2+ significant components?** → Create a dedicated folder under `components/`
     - Example: `Game2D` route → `components/game/` directory
   - **Major dockable panel?** → Top-level is acceptable (e.g., `GraphPanel.tsx`, `SceneBuilderPanel.tsx`)

3. **Don't put heavy logic in route files** - extract to:
   - Component files in appropriate subdirectories
   - Hooks in `hooks/`
   - Business logic in `lib/`

**When adding a new UI component:**

1. **Choose the right package:**
   - ✅ **`@pixsim7/ui`** if:
     - Truly generic (Button, Input, Modal, Badge, etc.)
     - No domain knowledge (no references to graphs, plugins, NPCs, worlds, etc.)
     - Reusable across any application
   - ✅ **`@pixsim7/game-ui`** if:
     - Game-specific but reusable across different games/worlds
     - Generic game concepts (ScenePlayer, MiniGameHost)
     - No hardcoded world/character data
   - ✅ **`frontend/src/components/`** if:
     - App-specific or tightly coupled to features
     - Contains business logic or domain knowledge
     - Most components belong here

2. **Choose the right subdirectory** in `frontend/src/components/`:
   - `automation/` - Device, preset, execution, loop management
   - `game/` - Game HUD, dialogue, interactions, NPCs, world tools
   - `graph/` - Graph node renderers, template wizards
   - `inspector/` - Node property editors
   - `simulation/` - Simulation tools and visualization
   - `control/` - Control center, cube system
   - `plugins/` - Plugin browsing and management
   - `interactions/` - Interaction UI (menus, history, suggestions)
   - `layout/` - Workspace and layout components
   - `common/` - Only for truly cross-cutting utilities (currently just ErrorBoundary)
   - Top-level `components/` - For major panels used across routes (use sparingly)

3. **Follow naming conventions:**
   - **Panels**: `*Panel.tsx` (e.g., `GraphPanel`, `WorldToolsPanel`, `InspectorPanel`)
   - **Editors**: `*Editor.tsx` (e.g., `ChoiceNodeEditor`, `HotspotEditor`, `InteractionPresetEditor`)
   - **Lists**: `*List.tsx` (e.g., `DeviceList`, `PresetList`, `ExecutionList`)
   - **Cards**: `*Card.tsx` (e.g., `DeviceCard`, `PresetCard`) - pair with lists
   - **Renderers**: `*Renderer.tsx` (e.g., `ChoiceNodeRenderer`, `ArcNodeRenderer`)
   - **Viewers**: `*Viewer.tsx` (e.g., `SessionStateViewer`, `MediaViewerCube`)
   - **Builders**: `*Builder.tsx` (e.g., `ActionBuilder`, `PresetPlaylistBuilder`)
   - **Selectors**: `*Selector.tsx` (e.g., `WorldContextSelector`, `TemplateSelector`)

**When adding a status/indicator widget:**

1. **Prefer consistent naming:**
   - Use `*Status`, `*Badge`, or `*Indicator` suffix
   - Examples: `MoodIndicator`, `GenerationHealthView`

2. **Co-locate with feature area:**
   - Put in the relevant feature directory (`game/`, `plugins/`, `generation/`)
   - Only use `common/` if truly generic across the entire app
   - Use `@pixsim7/ui/StatusBadge` for simple generic status badges

**Before writing a new list/panel/editor:**

1. **Check for existing patterns:**
   - Lists: See `automation/` directory (DeviceList, PresetList, ExecutionList, LoopList)
   - Panels: 30+ panels across the codebase - each serves specific purpose
   - Editors: See `inspector/` directory - use `useNodeEditor` hook for node editors

2. **Align naming and structure:**
   - Follow the closest existing pattern in your feature area
   - Use shared hooks when available (`useNodeEditor`, `useToast`, `useConfirmModal`)
   - Use shared UI from `@pixsim7/ui` (Button, Modal, Panel, Input, etc.)

3. **Avoid premature abstraction:**
   - Similar structures across domains are OK (e.g., PresetList and LoopList)
   - Don't force consolidation unless there's clear, substantial duplication
   - Prefer composition and hooks over complex inheritance

**When writing custom styles:**

1. **Default to Tailwind utility classes**
   - Most components should use Tailwind
   - Consistent with the rest of the codebase

2. **Create CSS files only for specialized UI:**
   - Game interfaces (InteractionMenu, DialogueUI)
   - Interactive visualizations (gizmos, shapes)
   - Complex animations or layout needs
   - Co-locate CSS with component: `ComponentName.tsx` + `ComponentName.css`

3. **Specialized game UI can use native elements:**
   - It's OK to use `<button>` with custom CSS for game-specific interfaces
   - Not everything needs to use `@pixsim7/ui/Button`
   - Use judgment based on UX requirements

**Quick Decision Tree:**

```
Need a new UI component?
│
├─ Is it a Button/Modal/Input/Badge/etc?
│  └─ Use @pixsim7/ui component ✓
│
├─ Is it generic game UI (ScenePlayer, MiniGame)?
│  └─ Add to @pixsim7/game-ui
│
├─ Is it a major dockable panel used across routes?
│  └─ Add to top-level components/ (e.g., GraphPanel)
│
└─ Is it feature-specific?
   └─ Add to appropriate components/ subdirectory:
      ├─ Automation? → components/automation/
      ├─ Game feature? → components/game/
      ├─ Graph-related? → components/graph/ or components/inspector/
      ├─ Simulation? → components/simulation/
      └─ Other? → components/{feature-name}/
```

**Don'ts:**

- ❌ Don't create duplicate Button/Modal/Toast/Input implementations
- ❌ Don't put domain logic in `@pixsim7/ui` (keep it generic)
- ❌ Don't import from `frontend/` in shared packages
- ❌ Don't dump everything in `components/common/`
- ❌ Don't create abstractions for 2 similar components (wait for 3+)
- ❌ Don't create new top-level component files unless truly cross-cutting

---

## Phase 18.6 – Documentation & App Map Updates

**Goal**  
Keep docs in sync so humans and agents can quickly see how the UI is organized.

**Scope**

- `UI_CONSOLIDATION_COMPLETED.md`
- `frontend/src/components/README.md`
- `docs/APP_MAP.md` (if it covers UI flows).

**Agent Checklist**

1. After completing an audit pass (18.1–18.4):
   - Update `frontend/src/components/README.md` with any new component categories or notable changes.
   - If you add/remove major UI surfaces, update `docs/APP_MAP.md` to reflect new routes/panels.
2. If you do real consolidation work:
   - Append a short “Delta” section to `UI_CONSOLIDATION_COMPLETED.md` or create a `UI_CONSOLIDATION_2025-XX-YY.md` follow‑up to avoid losing historical context.
3. Mark phases as completed here with a date and a short note, e.g.:
   - `[x] Phase 18.1 – Completed 2025‑11‑21 (see components/README.md for current map)`

**Status:** ✅ Completed 2025-11-19

### Documentation Updates Summary

**Updated Files:**

1. **`claude-tasks/18-frontend-ui-structure-and-consistency-audit.md`** (this file)
   - ✅ Completed all 6 phases with detailed findings
   - ✅ Documented route → component cluster map (Phase 18.1)
   - ✅ Documented naming consistency analysis (Phase 18.2)
   - ✅ Documented shared package boundary analysis (Phase 18.3)
   - ✅ Documented pattern duplication analysis (Phase 18.4)
   - ✅ Created comprehensive agent UI development checklist (Phase 18.5)

2. **`frontend/src/components/README.md`**
   - Already up-to-date with component organization
   - Documents GraphPanel, SceneBuilderPanel, and WorldContextSelector
   - References architecture docs (NODE_EDITOR_DEVELOPMENT.md, GRAPH_UI_LIFE_SIM_PHASES.md)

**No Updates Needed:**

- **`UI_CONSOLIDATION_COMPLETED.md`** - Recent (2025-11-19), already documents consolidation work
- **`packages/game-ui/README.md`** - Up-to-date with current exports and architecture principles
- **`docs/APP_MAP.md`** - Already covers major UI routes and systems at appropriate level (GraphPanel, Game2D, NpcBrainLab, etc.)

**Key Findings to Remember:**

1. **UI Organization**: Well-structured with clear naming conventions
   - 30 Panel components, 25 Editors, 8 Renderers - all consistently named
   - Component subdirectories properly scoped (automation/, game/, graph/, inspector/, etc.)

2. **Shared Package Boundaries**: Excellent with zero violations
   - `@pixsim7/ui`: 16 generic components, no domain logic
   - `@pixsim7/game-ui`: 3 reusable game components, no frontend dependencies
   - Frontend properly uses shared components

3. **No Significant Duplication**: Previous consolidation work (Nov 2025) successful
   - Toast system consolidated, ExecutionList deduplicated
   - Current similar patterns are appropriate domain specialization

4. **Agent Conventions**: Comprehensive checklist created for future development
   - Clear decision tree for component placement
   - Naming conventions documented
   - Don'ts list to avoid common mistakes

**Recommendations for Future Audits:**

- Run this audit periodically (every few feature branches)
- Watch for new Button/Modal/Toast implementations in frontend
- Ensure new components follow naming conventions (*Panel, *Editor, *List, etc.)
- Verify shared packages remain free of domain logic

---

## Success Criteria

When this task is run periodically (e.g. every few feature branches), you should have:

- A current, concise map of:
  - Routes → component clusters.
  - Shared vs feature UI boundaries.
- Clear agent conventions for:
  - Where to put new UI code.
  - How to name panels/lists/editors.
  - When to use `@pixsim7/ui` vs local components.
- Identified, documented points of duplication:
  - Some deliberately left as‑is (with reasoning).
  - Some marked as future consolidation candidates.
- No major surprises like:
  - New toast/list/button implementations in random folders.
  - Feature‑specific UIs leaking into `@pixsim7/ui`.
