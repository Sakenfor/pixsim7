# Blocks, Template-Blocks, and Composition Runtime Findings

Date: 2026-02-21
Scope: backend/frontend implementation review for blocks, template-blocks, composition roles, quickgen "Each", and node/runtime tie-ins.

## Current Findings (Implementation)

1. Quickgen `Each` currently orchestrates sequential request submission, not sequential completion.
- Sequential loops:
  - `apps/main/src/features/generation/hooks/useQuickGenerateController.ts:455`
  - `apps/main/src/features/generation/hooks/useQuickGenerateController.ts:544`
- It waits for generation job creation response, not full completion of the prior generation.
- `run_context` is attached client-side:
  - `apps/main/src/features/generation/lib/api.ts:153`
- Backend persists run context in durable manifest records:
  - `pixsim7/backend/main/services/asset/_creation.py:299`
- Batch endpoints exist for generation workflows:
  - `pixsim7/backend/main/api/v1/generations.py:563`
  - `pixsim7/backend/main/api/v1/generations.py:646`

2. Scene graph `generation` node appears to be editor/scaffolding metadata, not active runtime behavior.
- Builtin node registration (hidden experimental):
  - `apps/main/src/features/graph/lib/nodeTypes/builtin.ts:353`
- `toRuntime` for generation node does not execute generation logic:
  - `apps/main/src/features/graph/lib/nodeTypes/builtin.ts:415`
  - `apps/main/src/features/graph/stores/graphStore/index.ts:67`
- Scene runtime/player has no generation-node execution branch:
  - `packages/game/components/src/components/ScenePlayer.tsx:157`
  - `packages/game/engine/src/scene/SceneExecutor.ts:100`

3. Narrative/action-block model includes generation-related schema, but backend runtime launch path is still incomplete.
- `ActionBlockNode` supports `launchMode` and `generationConfig`:
  - `packages/shared/types/src/narrative.ts:263`
- Node handlers surface those fields:
  - `packages/game/engine/src/narrative/nodeHandlers.ts:349`
- Runtime contains TODO where actual generation launch should happen:
  - `pixsim7/backend/main/services/narrative/runtime.py:385`

4. Generation hook model and narrative executor hook model are not yet wired together.
- Generation bridge returns `GenerationHooks`:
  - `packages/game/engine/src/narrative/generation/GenerationBridge.ts:104`
- Executor consumes `ExecutorHooks` lifecycle callbacks:
  - `packages/game/engine/src/narrative/executor.ts:676`
- No adapter layer was found to bridge these hook contracts.

5. Scene edge semantics for generation `success`/`failure` ports are not clearly enforced at runtime.
- Port config defines generation success/failure outputs:
  - `apps/main/src/domain/sceneBuilder/portConfig.ts:69`
- Runtime edge conversion mostly flattens edges; default status is inferred by `fromPort === "default"`:
  - `apps/main/src/features/graph/stores/graphStore/index.ts:99`
- Scene runtime traversal uses generic conditions/defaults, not explicit success/failure port semantics:
  - `packages/game/engine/src/scene/runtime.ts:70`
  - `packages/game/engine/src/scene/runtime.ts:149`

6. Strategy naming drift exists in generation node metadata.
- Builtin generation node settings include values such as `every-visit` / `on-demand`:
  - `apps/main/src/features/graph/lib/nodeTypes/builtin.ts:404`
- Canonical generation strategy naming elsewhere is `once`, `per_playthrough`, `per_player`, `always`.

7. Content packs are canonical for prompt blocks/templates/characters, but are separate from node/runtime generation execution.
- Prompt content packs:
  - `pixsim7/backend/main/content_packs/prompt`
- Loader/upsert/prune pipeline:
  - `pixsim7/backend/main/services/prompt/block/content_pack_loader.py:476`
- Watcher auto-reload:
  - `pixsim7/backend/main/services/prompt/block/content_pack_watcher.py:28`
- Startup seeding/watcher wiring:
  - `pixsim7/backend/main/startup.py:146`
  - `pixsim7/backend/main/main.py:186`

## Architectural Risk Themes

1. Canonical-source drift risk: generation behavior concepts are represented in multiple layers (UI metadata, scene runtime, narrative runtime) without one clear execution authority.
2. Partial plumbing risk: generation-capable schemas exist, but runtime execution paths are not fully implemented in scene/narrative pipelines.
3. Semantics mismatch risk: port-level outcomes and hook contracts are defined differently across modules, reducing reliability for orchestration and future node strategies.

## Recommended Next Focus (If Resuming)

1. Define one canonical runtime for generation orchestration (scene vs narrative vs shared service).
2. Introduce an explicit adapter between generation hooks and executor hooks.
3. Normalize strategy enums and port outcome semantics into shared types used by UI + runtime.
4. Add a minimal execution record model keyed by `run_context` to support future review/rating flows.

## Progress Update (2026-02-21)

Step 1 started: canonical run-context authority for active quick generation caller.

- Added a canonical frontend run-context contract + builders:
  - `apps/main/src/features/generation/lib/runContext.ts`
- Wired generation API helper to accept typed run context:
  - `apps/main/src/features/generation/lib/api.ts`
- Migrated quickgen `Burst` and `Each` paths to create run context through canonical builder instead of inline ad hoc objects:
  - `apps/main/src/features/generation/hooks/useQuickGenerateController.ts`
- Extended migration to other active generation entry points:
  - `apps/main/src/lib/assetProvider/providers/GeneratedAssetProvider.ts`
  - `apps/main/src/components/inspector/GenerationNodeEditor.tsx`
  - `apps/main/src/features/intimacy/lib/generationPreview.ts`
  - `apps/main/src/components/media/useGenerationCardHandlers.ts`
  - `apps/main/src/features/assets/hooks/useAssetsController.ts`
- Also aligned single quickgen submissions (`Generate`, `Generate with asset`) to the same canonical run-context builder:
  - `apps/main/src/features/generation/hooks/useQuickGenerateController.ts`

Effect:
- One code path now owns `run_context` shape generation (`mode`, `run_id`, `strategy`, `set_id`, `item_index`, `item_total`, `input_asset_ids`), which reduces drift for manifest tracking and future node/narrative callers.

Step 2 completed: narrative runtime immediate action-block launch now uses real generation creation with canonical run context.

- Runtime path now calls `GenerationService.create_generation` for `launch_mode = immediate`:
  - `pixsim7/backend/main/services/narrative/runtime.py:423`
- Canonical runtime tagging is added to backend-generated context:
  - `run_context.mode = narrative_runtime`
  - plus run/session/node/npc/block identifiers for tracking
- Action block preparation now also returns assembled prompt content for canonical prompt wiring:
  - `pixsim7/backend/main/domain/narrative/action_block_resolver.py:274`
- Added focused tests for launch success/failure behavior:
  - `pixsim7/backend/tests/services/narrative/test_runtime_generation_launch.py`
