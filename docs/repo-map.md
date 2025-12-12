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

- `features/` — **Feature-first modules** (self-contained domains with components/lib/hooks/stores).
- `components/` — Shared UI components and legacy feature-specific UIs.
- `components/panels/` — Dockview panels (Model inspector, console, world tools).
- `lib/` — Front-end libraries (console namespace, gizmo registries, interaction stats logic).
- `stores/` — Zustand stores for editor/runtime state (tool configs, interaction stats, workspace layout).
- `routes/` — Top-level React routes (Simulation Playground, NPC labs, etc.).
- `plugins/` — Feature bundles that plug into the editor (world tools, ops panels).

### Import Hygiene & Barrel Exports

PixSim7 uses barrel exports (`index.ts`) to control public API surfaces and maintain clean import boundaries.

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
- `@lib/hooks` - Shared React hooks
- `@lib/cubes` - Workspace cube system (expansion registry, formations)
- `@lib/theming` - Theme system and tokens
- `@lib/game` - Game runtime adapters and session management
- `@lib/control` - Control center module registry
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
- `lib/graph/` + `lib/graphs/` → `@features/graph/lib/` (editor, builders)
- `lib/gallery/` → `@features/gallery/lib/core/` (surfaces, sources, tools)
- `lib/hud/` → `@features/hud/lib/core/` (layout management)
- `lib/generation/` → `@features/generation/lib/core/`
- `lib/simulation/` → `@features/simulation/lib/core/`
- `lib/automation/` → `@features/automation/lib/core/`
- `lib/gizmos/` → `@features/gizmos/lib/core/`

**Import Rules**:
1. ✅ Import from barrels: `@lib/core`, `@features/graph`
2. ❌ Never deep import: `@lib/core/types`, `@features/graph/components/...`
3. ✅ Exception: Feature plugins/lib: `@features/worldTools/plugins/inventory`, `@features/worldTools/lib/hudPresets`
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
├── intimacy/           # Intimacy composer, gating, playtesting
│   ├── components/     # React components
│   ├── lib/            # Business logic
│   ├── hooks/          # React hooks (if any)
│   └── index.ts        # Barrel export
├── automation/         # Browser automation (devices, presets, loops)
│   ├── components/     # Device, preset, loop, execution UIs
│   ├── types.ts        # Automation-specific types
│   └── index.ts        # Barrel export
├── interactions/       # NPC interaction UI (menus, history, suggestions, editor)
│   ├── components/     # InteractionMenu, MoodIndicator, ChainProgress, etc.
│   ├── components/editor/ # InteractionEditor, TemplateSelector
│   └── index.ts        # Barrel export
├── prompts/            # Prompt/generation workbench (inspection, editing, quick generation)
│   ├── components/     # PromptSegmentsViewer
│   ├── hooks/          # usePromptInspection, useQuickGenerateController, etc.
│   ├── lib/            # quickGenerateLogic
│   ├── types.ts        # Prompt segment types
│   └── index.ts        # Barrel export
├── gallery/            # Gallery UI (surfaces, layout controls, tools panels)
│   ├── components/     # GallerySurfaceHost, GallerySurfaceSwitcher, GalleryLayoutControls
│   ├── components/panels/ # GalleryToolsPanel
│   ├── hooks/          # useGallerySurfaceController, useCuratorGalleryController
│   └── index.ts        # Barrel export
├── scene/              # Scene browsing, playback, and management UI
│   ├── components/panels/ # SceneManagementPanel, SceneLibraryPanel, ScenePlaybackPanel, etc.
│   ├── components/player/ # PlaybackTimeline, MockStateEditor
│   └── index.ts        # Barrel export
├── hud/                # HUD layout builder, editor, and renderer
│   ├── components/     # HudLayoutBuilder, HudRenderer, HudLayoutSwitcher, etc.
│   ├── components/editor/ # HudEditor (main HUD configuration UI)
│   ├── panels/         # RegionalHudLayout, HudCustomizationPanel, HudProfileSwitcher
│   ├── stores/         # hudLayoutStore (HUD layout state management)
│   └── index.ts        # Barrel export
├── worldTools/         # World tools editor/debugging functionality
│   ├── components/     # WorldToolsPanel, WorldVisualRolesPanel
│   ├── plugins/        # World tool plugins (inventory, questLog, relationshipDashboard, etc.)
│   ├── lib/            # World tools types, registry, HUD layout/profile management
│   └── index.ts        # Barrel export
├── brainTools/         # NPC Brain Lab and brain inspection tools
│   ├── components/     # NpcBrainLab (main panel)
│   ├── plugins/        # Brain tool plugins (traits, mood, social, memories, etc.)
│   ├── lib/            # Registry, types
│   └── index.ts        # Barrel export
├── simulation/         # Simulation Playground (world/brain evolution testing)
│   ├── components/     # SimulationPlayground, WorldStateOverview, ConstraintRunner, etc.
│   └── index.ts        # Barrel export (note: low-level libs remain in @/lib/simulation)
├── generation/         # Generation workbench, queue, and status tracking
│   ├── components/     # GenerationWorkbench, GenerationsPanel, GenerationHistoryButton
│   ├── hooks/          # useGenerationWebSocket, useRecentGenerations, useMediaCardGenerationStatus, etc.
│   ├── stores/         # generationsStore, generationQueueStore, generationSettingsStore
│   └── index.ts        # Barrel export
├── graph/              # Scene graph editing, arc/quest graphs, character graphs
│   ├── components/     # GraphEditorHost, node renderers, graph surfaces, templates
│   │   ├── graph/      # Main graph editor (ActionBlockGraphSurface, node renderers, templates)
│   │   ├── arc-graph/  # ArcGraphPanel (arc/quest level graphs)
│   │   ├── character-graph/ # CharacterGraphBrowser, SceneCharacterViewer
│   │   └── nodes/      # ArcNode, NodeGroup, NodePalette, SceneNode
│   ├── stores/         # graphStore (scene graphs), arcGraphStore (arc/quest graphs)
│   ├── hooks/          # useLineageGraph
│   └── index.ts        # Barrel export
└── [future-feature]/
```

**When to use `features/`:**
- Self-contained domains without a shared package
- Cohesive functionality spanning components + logic + state
- New features that don't fit existing `lib/` or `components/` patterns

**When NOT to use `features/`:**
- Code that already has a shared package (e.g., gizmos → `@pixsim7/scene.gizmos`)
- Pure utilities or shared components
- Existing aliased domains (`@/gizmos`, `@/narrative`, etc.)

## Game Engine (`packages/game/engine/src`)

- `narrative/` — Narrative runtime (ConditionEvaluator, EffectApplicator, executor, integration hooks, scene bridge).
- `world/` — Runtime plugins, game profile definitions, runtime types.
- `scenarios/` — Scenario scripts/tests for engine behaviors.
- `runtime/` — Game runtime typings/hooks used by front-end runtime integration.

## Shared Packages

- `packages/shared/types/` — Canonical DTOs (GameSession, NPC zones, graph schemas) referenced by both front-end and backend.
- `packages/scene/gizmos/` — Core gizmo types, registries, NPC preferences, zone utilities (shared by engine + UI).

### Gizmo Architecture

Gizmos follow a **package/app split**:

| Layer | Location | Alias | Purpose |
|-------|----------|-------|---------|
| **Core** | `packages/scene/gizmos/` | `@pixsim7/scene.gizmos` | Types, registry, NPC preferences, zone utils, video generation manager |
| **App UI** | `apps/main/src/lib/gizmos/` | `@/gizmos` | Surface registry, console integration, tool overrides, interaction stats |
| **Components** | `apps/main/src/components/gizmos/` | — | React components (BodyMapGizmo, InteractiveTool, etc.) |

The core package is UI-agnostic and shared across engine/UI layers. The app layer adds presentation-specific code. Import from `@pixsim7/scene.gizmos` in shared libraries, use `@/gizmos` in app code.

## Backend (`pixsim7/backend`)

- `main/api/` — FastAPI routes for game worlds, assets, automation.
- `main/services/simulation/` — World scheduler, context, automation loop (tick-based backend simulation).
- `main/services/automation/`, `main/domain/` — Automation loops, scenario runners, shared domain models.
- `main/services/scenarios/` — Scenario runner used for deterministic tests.

## Documentation

- `docs/` — Current specs (architecture, engine layering, subsystem plans). Use `docs/README.md` or this map to locate topics.
- `docs/archive/` — Completed plans and historical references. Subfolders grouped by theme (meta, launcher, completed, etc.).
- `claude-tasks/` — Task briefs and AI planning notes. Active work (e.g., Model Inspector plan, path alias refactor) lives here until completed.

## How to Explore

1. **Features** — Start in `apps/main/src/components/panels/...` or `apps/main/src/features/...` for UI; jump to matching engine modules under `packages/game/engine/src/...`.
2. **Narrative/Scene** — `packages/game/engine/src/narrative/` for logic, `apps/main/src/lib/console/modules/tools.ts` + `apps/main/src/lib/gizmos/` for UI integration.
3. **Scheduler/Simulation** — Look under `pixsim7/backend/main/services/simulation/` and `docs/behavior_system/`.
4. **Docs** — Use `/docs` for current specs, `/docs/archive` for historical context. Active tasks live in `claude-tasks/`.

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
| `@shared/types/*` | `packages/shared/types/src/*` | Shared DTOs and interfaces used by engine + backend |
| `@shared/types` | `packages/shared/types/src/index.ts` | Shared types barrel export |
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
import type { GameSessionDTO } from '@shared/types';
import { interactionStats } from '@/gizmos/interactionStats';
```

**Barrel imports (recommended for public API):**
```typescript
import {
  NarrativeExecutor,
  createProgramProvider,
  createNodeHandlerRegistry
} from '@/narrative';

import type { GameSessionDTO, SceneNode, SceneEdge } from '@shared/types';

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
         "@shared/types/*": ["packages/shared/types/src/*"],
         "@shared/types": ["packages/shared/types/src/index.ts"]
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
         '@shared/types': path.resolve(__dirname, '../../packages/shared/types/src'),
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
- **`@shared/types`**: Shared DTOs including game sessions, scene graphs, narrative definitions, npc zones (used by engine + backend)

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
