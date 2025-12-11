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
