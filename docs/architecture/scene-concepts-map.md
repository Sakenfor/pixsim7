# Scene Concepts Map (Scene Prep vs Scene Systems)

This repo currently contains multiple different "scene" concepts.

This document maps them so we do not accidentally merge unrelated domains when building features (especially around `Scene Prep`, generation workflows, and game scene authoring).

## Quick Summary

- `Scene Prep` is a **pre-generation composition/planning workspace**.
- `SceneArtifact` is a **non-game persisted scene artifact** for prep/runtime-adjacent iteration.
- `GameScene` / scene graph is an **interactive runtime/authored scene system**.
- `Scene View` plugins are **renderers/presenters** for scene content.
- Legacy `Scene`/`SceneAsset`/`SceneConnection` is an **older asset-graph concept**.

These should stay separate unless we add explicit bridge/export/import paths.

## Canonical Scene Domains

### 1. Scene Prep (new generation-oriented planning workspace)

Purpose:
- Pre-batch composition before running generation
- Select cast, refs, candidates, variants, stage (`explore/compose/refine`)
- Compile to template fanout generation requests
- Record provenance in `run_context`

Primary files:
- `apps/main/src/features/scenePrep/components/ScenePrepPanel.tsx`
- `apps/main/src/features/generation/lib/templateFanoutExecution.ts`
- `apps/main/src/features/characters/lib/scenePrepPrefill.ts`

Notes:
- Not a game scene editor
- Not a runtime scene graph
- Uses generation pipeline contracts + `run_context` metadata

### 1b. SceneArtifact (new non-game persisted scene layer)

Purpose:
- Persist scene prep state as reusable artifacts without coupling to `GameScene`
- Track prep-stage lifecycle (`draft/explored/composed/refined/published`)
- Hold candidate refs, variant plan, launch history, and handoff context

Primary files:
- `apps/main/src/domain/sceneArtifact/types.ts`
- `apps/main/src/domain/sceneArtifact/stores/sceneArtifactStore.ts`
- `apps/main/src/features/scenePrep/components/ScenePrepPanel.tsx` (save/load integration)

Notes:
- This is not `GameScene`; it is the persistent prep-side scene object
- Future direct connection can be modeled via optional `gameSceneId` reference on artifact

### 2. Game Scenes (active scene graph/runtime system)

Purpose:
- Author and run interactive scenes with nodes/edges
- Used by game runtime / playback / scene calls / branching logic

Backend models/API:
- `pixsim7/backend/main/domain/game/core/models.py` (`GameScene`, `GameSceneNode`, `GameSceneEdge`)
- `pixsim7/backend/main/api/v1/game_scenes.py`

Frontend/shared types:
- `apps/main/src/domain/sceneBuilder/index.ts` (`DraftScene`, `DraftSceneNode`)
- `packages/shared/types/src/sceneGraph.ts` (`Scene`, `SceneContentNode`, `SceneEdge`)
- `apps/main/src/features/graph/projectBundle/sceneGraphProjectExtension.ts`

Notes:
- This is the main authored/runtime "scene graph" system
- Distinct from Scene Prep generation planning

### 3. Scene Authoring/Management Panels (`@features/scene`)

Purpose:
- UI panels around scene authoring, library, collections, playback

Examples:
- `apps/main/src/features/scene/components/panels/SceneBuilderPanel.tsx`
- `apps/main/src/features/scene/components/panels/SceneCollectionPanel.tsx`
- `apps/main/src/features/scene/components/panels/SceneLibraryPanel.tsx`
- `apps/main/src/features/scene/components/panels/ScenePlaybackPanel.tsx`

Related store:
- `apps/main/src/domain/sceneCollection/stores/sceneCollectionStore.ts`

Notes:
- These are primarily game-scene ecosystem panels, not Scene Prep panels

### 4. Scene View Plugins (scene rendering/presentation)

Purpose:
- Render scene content in different UI surfaces (panel/overlay/hud/workspace)
- Select a suitable view plugin based on content type

Primary files:
- `apps/main/src/lib/plugins/sceneViewPlugin.ts`
- `apps/main/src/features/contextHub/domain/contracts/sceneView.ts`
- Example plugin: `apps/main/src/plugins/scene/comic-panel-view/PluginSceneView.tsx`

Notes:
- Presentation layer for scenes
- Not scene authoring and not Scene Prep

### 5. Legacy Asset-Collection Scenes (older backend scene concept)

> **Deprecated (March 2026).** Active scene runtime uses `GameScene` (`domain/game/core/models.py`). This model is still registered in `core_models` manifest and `domain/__init__.py` but is not used by any active authoring or runtime path. Plan removal separately.

Purpose:
- A scene as a container of connected assets (`Scene`, `SceneAsset`, `SceneConnection`)
- Sequence/branching assembly of assets

Primary file:
- `pixsim7/backend/main/domain/scene.py`

Notes:
- **Legacy — not the active scene system.** `GameScene` is the canonical runtime/authoring model.
- Still imported via `core_models` manifest — removal requires a dedicated cleanup pass.

### 6. Character Scene Manifests (character requirements for scenes)

Purpose:
- Attach required/optional characters + roles to a scene
- Validate a scene has required characters/capabilities

Primary file:
- `pixsim7/backend/main/services/characters/scene_manifest.py`

Notes:
- Scene-linked character validation
- Closest to "Scene Prep" conceptually, but still targets authored scenes, not prep drafts

### 7. Generation Scene Snapshot (lightweight generation context)

Purpose:
- Small scene summary payload for generation requests (mood/location/summary)

Primary file:
- `packages/shared/generation/core/src/generationTypes.ts` (`SceneSnapshot`)

Notes:
- This is context metadata only, not a persisted scene model

## SceneArtifact vs ActionSelectionContext (Current Snapshot: March 2026)

These two types are adjacent but not the same layer:

- `SceneArtifact` is frontend prep persistence (saved Scene Prep draft state).
- `ActionSelectionContext` is backend runtime selection input for primitives resolution.

Current behavior in code:

- Scene Prep launch compiles template fanout requests and executes generation batches.
- Scene Prep launch writes `scene_prep_*` provenance into `run_context`.
- Scene Prep launch does not call `/api/v1/game/dialogue/actions/select` automatically.
- `ActionSelectionContext` is built in the game dialogue backend endpoint path and fed into `DynamicSlotPlanner -> compiler_v1 -> next_v1`.

Practical interpretation:

- `SceneArtifact` answers "what did the user prep and launch?"
- `ActionSelectionContext` answers "what runtime constraints should select primitives now?"

Bridge status:

- No canonical direct mapper exists yet from `SceneArtifact.prep` to `ActionSelectionContext`.
- Recommended bridge is a single deterministic mapper (not adapters everywhere) that projects:
  - scene/cast/guidance choices -> runtime context fields
  - stage/notes/candidates -> required or preferred tags
  - selected lead/partner cast rows -> `leadNpcId`/`partnerNpcId`

### Current Flow Diagram

```text
Scene Prep / Authoring Path (current)
------------------------------------
User -> ScenePrepPanel
     -> Save/Load SceneArtifact (frontend store)
     -> Launch Scene Prep Batch
     -> compileTemplateFanoutRequest
     -> executeTrackedTemplateFanoutRequest
     -> generation queue / outputs
        (run_context includes scene_prep_* provenance)


Runtime Selection Path (current)
--------------------------------
Game/Narrative Runtime or API caller
     -> POST /api/v1/game/dialogue/actions/select
     -> build ActionSelectionContext
     -> resolve_action_block_node(mode=query)
     -> DynamicSlotPlanner -> compiler_v1 -> next_v1
     -> selected primitive blocks/prompts/segments
     -> downstream generation (when invoked)


Bridge Status
-------------
SceneArtifact.prep
     - - - no canonical mapper yet - - ->
ActionSelectionContext
```

## Where Scene Prep Fits

`Scene Prep` should be treated as a separate pre-generation layer that can later bridge into scene systems.

Recommended positioning:
- Upstream of generation execution
- Adjacent to Character Reference/Slots and matrix discovery
- Separate from GameScene authoring/runtime

This means:
- Keep `scene_prep_*` names in `run_context` / local draft schema
- Treat `SceneArtifact` as the canonical persisted prep-side record (non-game)
- Do not overload `GameScene` or `DraftScene` with prep-only state
- Add explicit bridges instead of implicit coupling

## Safe Reuse Opportunities (Now)

### Reuse now

- `CharacterBindings` / role-based cast (already used in Scene Prep)
- Scene/comic panel concepts as inspiration for output review UX
- Scene view plugins only if we later render generated scene outputs as a scene presentation

### Reuse later (bridge features)

- Export Scene Prep outputs to `DraftScene.comicPanels`
- Create/append a `GameScene` from selected Scene Prep outputs
- Validate cast readiness against character manifests when targeting a real scene

## What Should Stay Separate (For Now)

- `Scene Prep` draft state vs `DraftScene` / `GameScene`
- Generation execution policies vs scene runtime traversal
- Scene view plugin selection vs Scene Prep composition/editor UI
- Legacy `Scene` asset graph until a migration/retirement decision is made

## Naming Guidance

Use explicit prefixes to avoid ambiguity:
- `scene_prep_*` for pre-generation planning/provenance
- `game_scene*` for authored/runtime scenes
- `scene_view*` for rendering plugins/presentation
- `scene_collection*` for library/organization features

## Recommended Next Follow-up (optional)

Create a small "bridge map" doc or ADR for:
- `Scene Prep -> comic panels`
- `Scene Prep -> GameScene`
- `Scene Prep -> tagging/provenance review flow`

That keeps future integration intentional instead of accidental.

## Terminology Migration TODO (defer)

`scene` is currently overloaded across multiple systems.

Potential future cleanup:
- Prefer `game_scene` terminology for the interactive runtime/authoring scene graph system in new docs/UI labels
- Keep `scene_prep` terminology for pre-generation planning
- Leave existing code/API identifiers stable for now unless a dedicated migration is planned

Suggested migration order (later):
1. Docs/UI labels (`Scene` -> `Game Scene` where appropriate)
2. Type aliases / compatibility names
3. Internal symbol renames
4. API contract renames only if compatibility strategy is defined
