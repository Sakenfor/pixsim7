# Repository Map

High-level guide to the pixsim7 codebase. Use this as a starting point when you need to find code, docs, or assets.

## Top-Level Layout

| Path | Description |
| --- | --- |
| `apps/main/` | React front-end (panels, console, gizmos, stores, routing). |
| `packages/game/` | TypeScript game engine modules (narrative executor, scene integration, runtime plugins). |
| `packages/shared/` | Shared TypeScript definitions, configs, graph schemas. |
| `packages/scene/` | Scene/gizmo utilities shared between engine and UI. |
| `pixsim7/backend/` | Backend services (FastAPI), world scheduler, automation workers. |
| `docs/` | Living documentation, specs, system guides. |
| `docs/archive/` | Historical/legacy docs kept for reference. |
| `claude-tasks/` | Active task briefs and AI planning docs. |
| `scripts/` / `tools/` | Developer tooling, automation scripts. |

## Front-End (`apps/main/src`)

- `features/` â€” **Feature-first modules** (self-contained domains with components/lib/hooks/stores).
- `components/` â€” Shared UI components and legacy feature-specific UIs.
- `components/panels/` â€” Dockview panels (Model inspector, console, world tools).
- `lib/` â€” Front-end libraries (console namespace, gizmo registries, interaction stats logic).
- `stores/` â€” Zustand stores for editor/runtime state (tool configs, interaction stats, workspace layout).
- `routes/` â€” Top-level React routes (Simulation Playground, NPC labs, etc.).
- `plugins/` â€” Feature bundles that plug into the editor (world tools, ops panels).

### Import Hygiene & Barrel Exports

PixSim7 uses barrel exports (`index.ts`) to control public API surfaces and maintain clean import boundaries.

**ðŸ“– See Also:** [Frontend vs Backend Boundaries](./architecture/frontend-backend-boundaries.md) - Comprehensive guide on how backend data flows to frontend, API patterns, and architectural boundaries.

**Lib Aliases** (`@lib/*`) - All 29 lib modules now have barrels:

*Core Registries & Systems:*
- `@lib/core` - Core types, BrainState helpers, BaseRegistry, mock core
- `@lib/panels` - Panel registry and constants
- `@lib/shapes` - Shape rendering system
- `@lib/widgets` - Widget registry and composition
- `@lib/api` - API client and domain endpoints

*Infrastructure & Utilities:*
- `@lib/utils` - Shared utilities (logging, uuid, debugFlags, storage, time, validation, polling)
- `@lib/auth` - Authentication service and providers
- `@/hooks` - Shared React hooks
- `@lib/theming` - Theme system and tokens
- `@lib/game` - Game runtime adapters and session management
- `@lib/context` - Editor context and state derivation
- `@lib/assets` - Asset management actions
- `@lib/display` - Display space utilities
- `@lib/analyzers` - Code/data analysis constants

*Other Libs:*
All remaining lib directories have barrels: `capabilities`, `console`, `dataBinding`, `devtools`, `editing-core`, `gameplay-ui-core`, `gating`, `models`, `overlay`, `preview-bridge`, `providers`, `plugins`, `settings`.

**Feature Aliases** (`@features/*`):
All 13 features have barrel exports. Import from feature root, not nested paths.

**Feature Libs Reorganization:**
Feature-specific code has been moved from `lib/` to feature directories:
- `lib/graph/` + `lib/graphs/` â†’ `@features/graph/lib/` (editor, builders)
- `lib/gallery/` â†’ `@features/gallery/lib/core/` (surfaces, sources, tools)
- `lib/hud/` â†’ `@features/hud/lib/core/` (layout management)
- `lib/generation/` â†’ `@features/generation/lib/core/`
- `lib/simulation/` â†’ `@features/simulation/lib/core/`
- `lib/automation/` â†’ `@features/automation/lib/core/`
- `lib/gizmos/` â†’ `@features/gizmos/lib/core/`

**Import Rules**:
1. âœ… Import from barrels: `@lib/core`, `@features/graph`
2. âŒ Never deep import: `@lib/core/types`, `@features/graph/components/...`
3. âœ… Exception: Feature plugins/lib: `@features/worldTools/plugins/inventory`, `@features/worldTools/lib/hudPresets`
4. Enforced by ESLint `import/no-internal-modules` rule

**Example**:
```typescript
// GOOD
import { BrainState, getMood } from '@lib/core';
import { GraphEditorHost } from '@features/graph';
import { createPreset } from '@features/worldTools/lib/hudPresets'; // Advanced tooling OK

// BAD
import { BrainState } from '@/lib/core/types';
import { GraphEditorHost } from '@features/graph/components/graph/GraphEditorHost';
```

**Backend**: Domain modules have barrels. Import from `pixsim7.backend.main.domain.<domain>`, not deep paths.
```python
# GOOD
from pixsim7.backend.main.domain.stats import StatEngine
from pixsim7.backend.main.domain.stats.migration import migrate_world_meta_to_stats_config

# BAD
from pixsim7.backend.main.domain.stats.engine import StatEngine
```

### Feature-First Organization

New self-contained features should go under `apps/main/src/features/`:

```
features/
â”œâ”€â”€ intimacy/           # Intimacy composer, gating, playtesting
â”‚   â”œâ”€â”€ components/     # React components
â”‚   â”œâ”€â”€ lib/            # Business logic
â”‚   â”œâ”€â”€ hooks/          # React hooks (if any)
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ automation/         # Browser automation (devices, presets, loops)
â”‚   â”œâ”€â”€ components/     # Device, preset, loop, execution UIs
â”‚   â”œâ”€â”€ types.ts        # Automation-specific types
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ interactions/       # NPC interaction UI (menus, history, suggestions, editor)
â”‚   â”œâ”€â”€ components/     # InteractionMenu, MoodIndicator, ChainProgress, etc.
â”‚   â”œâ”€â”€ components/editor/ # InteractionEditor, TemplateSelector
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ prompts/            # Prompt/generation workbench (inspection, editing, quick generation)
â”‚   â”œâ”€â”€ components/     # PromptSegmentsViewer
â”‚   â”œâ”€â”€ hooks/          # usePromptInspection, useQuickGenerateController, etc.
â”‚   â”œâ”€â”€ lib/            # quickGenerateLogic
â”‚   â”œâ”€â”€ types.ts        # Prompt segment types
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ gallery/            # Gallery UI (surfaces, layout controls, tools panels)
â”‚   â”œâ”€â”€ components/     # GallerySurfaceHost, GallerySurfaceSwitcher, GalleryLayoutControls
â”‚   â”œâ”€â”€ components/panels/ # GalleryToolsPanel
â”‚   â”œâ”€â”€ hooks/          # useGallerySurfaceController, useCuratorGalleryController
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ scene/              # Scene browsing, playback, and management UI
â”‚   â”œâ”€â”€ components/panels/ # SceneManagementPanel, SceneLibraryPanel, ScenePlaybackPanel, etc.
â”‚   â”œâ”€â”€ components/player/ # PlaybackTimeline, MockStateEditor
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ hud/                # HUD layout builder, editor, and renderer
â”‚   â”œâ”€â”€ components/     # HudLayoutBuilder, HudRenderer, HudLayoutSwitcher, etc.
â”‚   â”œâ”€â”€ components/editor/ # HudEditor (main HUD configuration UI)
â”‚   â”œâ”€â”€ panels/         # RegionalHudLayout, HudCustomizationPanel, HudProfileSwitcher
â”‚   â”œâ”€â”€ stores/         # hudLayoutStore (HUD layout state management)
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ worldTools/         # World tools editor/debugging functionality
â”‚   â”œâ”€â”€ components/     # WorldToolsPanel, WorldVisualRolesPanel
â”‚   â”œâ”€â”€ plugins/        # World tool plugins (inventory, questLog, relationshipDashboard, etc.)
â”‚   â”œâ”€â”€ lib/            # World tools types, registry, HUD layout/profile management
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ brainTools/         # NPC Brain Lab and brain inspection tools
â”‚   â”œâ”€â”€ components/     # NpcBrainLab (main panel)
â”‚   â”œâ”€â”€ plugins/        # Brain tool plugins (traits, mood, social, memories, etc.)
â”‚   â”œâ”€â”€ lib/            # Registry, types
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ simulation/         # Simulation Playground (world/brain evolution testing)
â”‚   â”œâ”€â”€ components/     # SimulationPlayground, WorldStateOverview, ConstraintRunner, etc.
â”‚   â””â”€â”€ index.ts        # Barrel export (note: low-level libs remain in @/lib/simulation)
â”œâ”€â”€ generation/         # Generation workbench, queue, and status tracking
â”‚   â”œâ”€â”€ components/     # GenerationWorkbench, GenerationsPanel, GenerationHistoryButton
â”‚   â”œâ”€â”€ hooks/          # useGenerationWebSocket, useRecentGenerations, useMediaCardGenerationStatus, etc.
â”‚   â”œâ”€â”€ stores/         # generationsStore, generationQueueStore, generationSettingsStore
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ graph/              # Scene graph editing, arc/quest graphs, character graphs
â”‚   â”œâ”€â”€ components/     # GraphEditorHost, node renderers, graph surfaces, templates
â”‚   â”‚   â”œâ”€â”€ graph/      # Main graph editor (ActionBlockGraphSurface, node renderers, templates)
â”‚   â”‚   â”œâ”€â”€ arc-graph/  # ArcGraphPanel (arc/quest level graphs)
â”‚   â”‚   â”œâ”€â”€ character-graph/ # CharacterGraphBrowser, SceneCharacterViewer
â”‚   â”‚   â””â”€â”€ nodes/      # ArcNode, NodeGroup, NodePalette, SceneNode
â”‚   â”œâ”€â”€ stores/         # graphStore (scene graphs), arcGraphStore (arc/quest graphs)
â”‚   â”œâ”€â”€ hooks/          # useLineageGraph
â”‚   â””â”€â”€ index.ts        # Barrel export
â”œâ”€â”€ controlCenter/      # Control Center domain - docking panels and expandable cubes
â”‚   â”œâ”€â”€ components/     # ControlCenterDock, CubeFormationControlCenter, GenerationSettingsBar, etc.
â”‚   â”‚   â”œâ”€â”€ modules/    # Control center modules (Workspace, Gallery, Plugins)
â”‚   â”‚   â”œâ”€â”€ preset-operator/ # Preset operator components (AssetCard, Timeline, etc.)
â”‚   â”‚   â””â”€â”€ hooks/      # Component-specific hooks (useDockBehavior)
â”‚   â”œâ”€â”€ hooks/          # Feature hooks (useControlCenterLayout, useCubeDocking)
â”‚   â”œâ”€â”€ stores/         # Control center stores (controlCenterStore, controlCubeStore, cubeSettingsStore)
â”‚   â”œâ”€â”€ lib/            # Control center utilities
â”‚   â”‚   â”œâ”€â”€ cubes/      # Cube expansion registry, formations, registration
â”‚   â”‚   â”œâ”€â”€ api.ts      # Generation API wrapper (generateAsset)
â”‚   â”‚   â””â”€â”€ controlCenterModuleRegistry.ts # Module registry
â”‚   â””â”€â”€ index.ts        # Barrel export
â””â”€â”€ [future-feature]/
```

**When to use `features/`:**
- Self-contained domains without a shared package
- Cohesive functionality spanning components + logic + state
- New features that don't fit existing `lib/` or `components/` patterns

**When NOT to use `features/`:**
- Code that already has a shared package (e.g., gizmos â†’ `@pixsim7/scene.gizmos`)
- Pure utilities or shared components
- Existing aliased domains (`@/gizmos`, `@/narrative`, etc.)

## Workspace & Dockview Architecture

The workspace uses **SmartDockview** as the single layout engine for all dockview-based panels. Layout persistence is handled via localStorage, not backend storage.

### Architecture Overview

| Component | Persistence | Pattern |
|-----------|-------------|---------|
| **DockviewWorkspace** | localStorage (`workspace-layout-v1`) | SmartDockview registry mode |
| **QuickGenerateDockview** | localStorage (`quickGenerate-dockview-layout:*`) | SmartDockview registry mode |
| **AssetViewerDockview** | localStorage (`asset-viewer-layout-v2`) | SmartDockview registry mode |

### Key Files

| File | Purpose |
|------|---------|
| `features/workspace/components/DockviewWorkspace.tsx` | Main workspace dockview + default layout |
| `features/workspace/stores/workspaceStore.ts` | Presets, floating panels, lock state |
| `lib/dockview/SmartDockview.tsx` | Unified dockview wrapper with localStorage persistence |
| `lib/dockview/useSmartDockview.ts` | Hook for layout persistence and tab visibility |
| `docs/architecture/dockview.md` | Snapshot of current SmartDockview/panel usage & props |
| `features/panels/lib/PanelManager.ts` | Panel metadata and visibility tracking |

### How It Works

1. **SmartDockview** owns layout persistence via `storageKey` prop
2. **Presets** are named snapshots stored in `workspaceStore.presets`
   - Save: `api.toJSON()` â†’ store in presets list
   - Load: `api.fromJSON(preset.layout)` directly
3. **Reset to default**: Clear localStorage + remount (via `resetDockviewLayout`)
4. **PanelManager** tracks panel metadata and open/close state (no layout)

### Adding a New Dockview Panel

1. Create a `LocalPanelRegistry` with panel entries
2. Create a `defaultLayout` function
3. Use `SmartDockview` with `registry`, `storageKey`, and `defaultLayout` props
4. Set `panelManagerId` if cross-dockview communication is needed

## Game Engine (`packages/game/engine/src`)

- `narrative/` â€” Narrative runtime (ConditionEvaluator, EffectApplicator, executor, integration hooks, scene bridge).
- `world/` â€” Runtime plugins, game profile definitions, runtime types.
- `scenarios/` â€” Scenario scripts/tests for engine behaviors.
- `runtime/` â€” Game runtime typings/hooks used by front-end runtime integration.

## Shared Packages

- `packages/shared/types/` â€” Canonical DTOs (GameSession, NPC zones, graph schemas) referenced by both front-end and backend.
- `packages/scene/gizmos/` â€” Core gizmo types, registries, NPC preferences, zone utilities (shared by engine + UI).

### Gizmo Architecture

Gizmos follow a **package/app split**:

| Layer | Location | Alias | Purpose |
|-------|----------|-------|---------|
| **Core** | `packages/scene/gizmos/` | `@pixsim7/scene.gizmos` | Types, registry, NPC preferences, zone utils, video generation manager |
| **App UI** | `apps/main/src/lib/gizmos/` | `@/gizmos` | Surface registry, console integration, tool overrides, interaction stats |
| **Components** | `apps/main/src/components/gizmos/` | â€” | React components (BodyMapGizmo, InteractiveTool, etc.) |

The core package is UI-agnostic and shared across engine/UI layers. The app layer adds presentation-specific code. Import from `@pixsim7/scene.gizmos` in shared libraries, use `@/gizmos` in app code.

## Backend (`pixsim7/backend`)

- `main/api/` â€” FastAPI routes for game worlds, assets, automation.
- `main/services/simulation/` â€” World scheduler, context, automation loop (tick-based backend simulation).
- `main/services/automation/`, `main/domain/` â€” Automation loops, scenario runners, shared domain models.
- `main/services/scenarios/` â€” Scenario runner used for deterministic tests.

**ðŸ“– See Also:** [Frontend vs Backend Boundaries](./architecture/frontend-backend-boundaries.md) - Details on backend API structure, domain modules, and how data flows to the frontend.

## Documentation

- `docs/` â€” Current specs (architecture, engine layering, subsystem plans). Use `docs/README.md` or this map to locate topics.
- `docs/architecture/` â€” Architectural decision records and system boundary documentation.
  - **[Frontend vs Backend Boundaries](./architecture/frontend-backend-boundaries.md)** â€” Comprehensive guide on API patterns, data flow, and architectural boundaries.
- `docs/archive/` â€” Completed plans and historical references. Subfolders grouped by theme (meta, launcher, completed, etc.).
- `claude-tasks/` â€” Task briefs and AI planning notes. Active work (e.g., Model Inspector plan, path alias refactor) lives here until completed.

## How to Explore

1. **Features** â€” Start in `apps/main/src/components/panels/...` or `apps/main/src/features/...` for UI; jump to matching engine modules under `packages/game/engine/src/...`.
2. **Narrative/Scene** â€” `packages/game/engine/src/narrative/` for logic, `apps/main/src/lib/console/modules/tools.ts` + `apps/main/src/lib/gizmos/` for UI integration.
3. **Scheduler/Simulation** â€” Look under `pixsim7/backend/main/services/simulation/` and `docs/behavior_system/`.
4. **Docs** â€” Use `/docs` for current specs, `/docs/archive` for historical context. Active tasks live in `claude-tasks/`.

---

## Path Aliases

The repository uses TypeScript path aliases to simplify imports and reduce coupling to physical file locations. This allows you to import from logical domains rather than using deep relative paths.

### Available Aliases

| Alias | Maps To | Purpose |
|-------|---------|---------|
| `@/narrative/*` | `packages/game/engine/src/narrative/*` | Narrative runtime engine, executor, node handlers, logging |
| `@/narrative` | `packages/game/engine/src/narrative/index.ts` | Main narrative barrel export |
| `@/scene/*` | `packages/game/engine/src/narrative/*` | Scene integration (playback, triggers, media coordination) |
| `@/scene` | `packages/game/engine/src/narrative/index.ts` | Scene-related exports from narrative |
| `@/gizmos/*` | `apps/main/src/lib/gizmos/*` | Gizmo surfaces, console integration, interaction stats |
| `@/gizmos` | `apps/main/src/lib/gizmos/index.ts` | Main gizmos barrel export |
| `@/types/*` | `apps/main/src/types/*` | Front-end specific types (automation, prompts, local helpers) |
| `@/types` | `apps/main/src/types/index.ts` | Main app types barrel export |
| `@pixsim7/shared.types/*` | `packages/shared/types/src/*` | Shared DTOs and interfaces used by engine + backend |
| `@pixsim7/shared.types` | `packages/shared/types/src/index.ts` | Shared types barrel export |
| `@features/intimacy/*` | `apps/main/src/features/intimacy/*` | Intimacy composer, gating, playtesting |
| `@features/intimacy` | `apps/main/src/features/intimacy/index.ts` | Intimacy barrel export |
| `@features/automation/*` | `apps/main/src/features/automation/*` | Browser automation components and types |
| `@features/automation` | `apps/main/src/features/automation/index.ts` | Automation barrel export |
| `@features/interactions/*` | `apps/main/src/features/interactions/*` | NPC interaction UI components |
| `@features/interactions` | `apps/main/src/features/interactions/index.ts` | Interactions barrel export |
| `@features/prompts/*` | `apps/main/src/features/prompts/*` | Prompt workbench components and hooks |
| `@features/prompts` | `apps/main/src/features/prompts/index.ts` | Prompts barrel export |
| `@features/gallery/*` | `apps/main/src/features/gallery/*` | Gallery UI components (surfaces, layout, tools) |
| `@features/gallery` | `apps/main/src/features/gallery/index.ts` | Gallery barrel export |
| `@features/scene/*` | `apps/main/src/features/scene/*` | Scene browsing, playback, and management UI |
| `@features/scene` | `apps/main/src/features/scene/index.ts` | Scene feature barrel export |
| `@features/hud/*` | `apps/main/src/features/hud/*` | HUD layout builder, editor, renderer, and customization |
| `@features/hud` | `apps/main/src/features/hud/index.ts` | HUD feature barrel export |
| `@features/worldTools/*` | `apps/main/src/features/worldTools/*` | World tools editor/debugging (panels, plugins, registry, HUD config) |
| `@features/worldTools` | `apps/main/src/features/worldTools/index.ts` | World tools feature barrel export |
| `@features/brainTools/*` | `apps/main/src/features/brainTools/*` | NPC Brain Lab and brain inspection tools |
| `@features/brainTools` | `apps/main/src/features/brainTools/index.ts` | Brain Tools feature barrel export |
| `@features/simulation/*` | `apps/main/src/features/simulation/*` | Simulation Playground UI components |
| `@features/simulation` | `apps/main/src/features/simulation/index.ts` | Simulation feature barrel export |
| `@features/controlCenter/*` | `apps/main/src/features/controlCenter/*` | Control Center domain - docking panels, expandable cubes, generation settings |
| `@features/controlCenter` | `apps/main/src/features/controlCenter/index.ts` | Control Center feature barrel export |

### Usage Examples

**Before (deep relative imports):**
```typescript
import { NarrativeExecutor } from '../../../packages/game/engine/src/narrative/executor';
import type { GameSessionDTO } from '@pixsim7/shared.types';
import { interactionStats } from '../../lib/gizmos/interactionStats';
```

**After (using aliases):**
```typescript
import { NarrativeExecutor } from '@/narrative/executor';
import type { GameSessionDTO } from '@pixsim7/shared.types';
import { interactionStats } from '@/gizmos/interactionStats';
```

**Barrel imports (recommended for public API):**
```typescript
import {
  NarrativeExecutor,
  createProgramProvider,
  createNodeHandlerRegistry
} from '@/narrative';

import type { GameSessionDTO, SceneNode, SceneEdge } from '@pixsim7/shared.types';

import {
  calculateStatChanges,
  getZoneStatModifiers
} from '@/gizmos';
```

### Configuration

The aliases are configured in three places:

1. **TypeScript** (`tsconfig.base.json`):
   ```json
   {
     "compilerOptions": {
       "baseUrl": ".",
       "paths": {
         "@/narrative/*": ["packages/game/engine/src/narrative/*"],
         "@/narrative": ["packages/game/engine/src/narrative/index.ts"],
         "@/scene/*": ["packages/game/engine/src/narrative/*"],
         "@/scene": ["packages/game/engine/src/narrative/index.ts"],
         "@/gizmos/*": ["apps/main/src/lib/gizmos/*"],
         "@/gizmos": ["apps/main/src/lib/gizmos/index.ts"],
         "@/types/*": ["apps/main/src/types/*"],
         "@/types": ["apps/main/src/types/index.ts"],
         "@pixsim7/shared.types/*": ["packages/shared/types/src/*"],
         "@pixsim7/shared.types": ["packages/shared/types/src/index.ts"]
       }
     }
   }
   ```

2. **Vite** (`apps/main/vite.config.ts`, `apps/game/vite.config.ts`):
   ```typescript
   export default defineConfig({
     resolve: {
       alias: {
         '@/narrative': path.resolve(__dirname, '../../packages/game/engine/src/narrative'),
         '@/scene': path.resolve(__dirname, '../../packages/game/engine/src/narrative'),
         '@/gizmos': path.resolve(__dirname, './src/lib/gizmos'),
         '@/types': path.resolve(__dirname, './src/types'),
         '@pixsim7/shared.types': path.resolve(__dirname, '../../packages/shared/types/src'),
       },
     },
   });
   ```

3. **ESLint/other tools**: Inherit from `tsconfig.base.json`

### Barrel Exports

Each aliased domain has an `index.ts` barrel file that exports the public API:

- **`@/narrative`**: Exports narrative executor, node handlers, condition evaluator, effect applicator, logging, generation bridge, runtime integration, and scene integration
- **`@/gizmos`**: Exports surface registry, registration helpers, console integration, tool overrides, and interaction stats
- **`@/types`**: Front-end specific types (automation presets, prompt graphs, operations UI helpers)
- **`@pixsim7/shared.types`**: Shared DTOs including game sessions, scene graphs, narrative definitions, npc zones (used by engine + backend)

Barrel exports help maintain a stable public API and make it clear which modules are intended for external use.

### Best Practices

1. **Prefer barrel imports** for public APIs: `import { X } from '@/narrative'`
2. **Use specific imports** for internal/advanced usage: `import { X } from '@/narrative/executor'`
3. **Avoid barrel re-exports** in your own modules to prevent circular dependencies
4. **Use barrel imports in apps**, use workspace packages (`@pixsim7/*`) in libraries

### Future Domains

Potential future aliases as the codebase evolves:

- `@/simulation/*` - Core simulation logic and state management
- `@/automation/*` - Browser automation and provider integration
- `@/panels/*` - Reusable UI panel components
- `@/console/*` - Console framework and commands
- `@/stores/*` - Shared Zustand stores

---

## Keeping This Up to Date

- Add new domains/paths here when creating major features.
- When moving files, update both the alias map (tsconfig) and this repo map.
- If a section grows large, link out to a dedicated doc (e.g., `docs/narrative-runtime.md`).
- When adding new domains that would benefit from aliases:
  1. Add the path mapping to `tsconfig.base.json`
  2. Add the alias to all Vite configs
  3. Create or update the barrel export (`index.ts`)
  4. Document the alias in this file

