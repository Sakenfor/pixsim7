**Task: Narrative Runtime & Action Block Unification (Big Refactor)**

> **For Agents (How to use this file)**
> - This is a **large, multi-phase refactor** to unify dialogue, action blocks, and generation-driven narrative into a single narrative runtime.
> - Only start this once Tasks 09–10 (intimacy & generation), 13 (behavior), 17 (interaction layer), and 19 (NPC ECS components) are reasonably stable.
> - Read these first for context and constraints:  
>   - `docs/DYNAMIC_GENERATION_FOUNDATION.md` – generation nodes & pipeline  
>   - `docs/INTIMACY_AND_GENERATION.md` – intimacy + social context  
>   - `docs/behavior_system/README.md` – NPC behavior overview  
>   - `docs/INTERACTION_AUTHORING_GUIDE.md` – authoring interactions & chains  
>   - `docs/INTIMACY_SCENE_COMPOSER.md` – intimacy scene composer  
>   - `pixsim7_backend/domain/narrative/*` – current narrative engine / action blocks  
>   - `pixsim7_backend/api/v1/game_dialogue.py` (if present) – dialogue APIs  
>   - `pixsim7_backend/api/v1/action_blocks.py` – action block APIs.
> - **Key constraint:** as with other tasks, do **not** add new DB tables/columns lightly. Prefer:
>   - Existing tables (`action_blocks`, `prompt_versions`, `generations`, `GameScene`, `GameWorld` meta).  
>   - JSON-backed schemas in `GameWorld.meta`, `GameScene.meta`, and ECS components.

---

## Context & Pain Points

Current narrative stack is powerful but fragmented:

- **Action Blocks**:
  - `pixsim7_backend/domain/narrative/action_blocks/*`, `action_blocks` table, `/api/v1/action_blocks`.
  - Provide reusable prompt fragments and transition logic.
- **Dialogue Programs / Narrative Engine**:
  - `pixsim7_backend/domain/narrative/engine.py`, `context.py`, `programs.py`.
  - Build dialogue requests from narrative context, including relationship and world state.
- **Generation Pipeline**:
  - `/api/v1/generations` + `GenerationNodeConfig`.
  - Intimacy-aware prompts, social context, mood integration.
- **Interactions & Chains**:
  - `packages/game-core/src/interactions/*` for interaction definitions, chains, suggestions.
  - `interaction_execution.prepare_generation_launch` builds dialogue/action-block requests and stores pending dialogue/action-block jobs in `session.flags`.
- **Intimacy Scene Composer**:
  - `frontend/src/components/intimacy/*`, `frontend/src/lib/intimacy/*`.
  - Builds scene graphs, progression arcs, and generation previews for intimate scenes.

Pain points:

- Multiple ways to “ask for narrative content”:
  - Direct dialogue API, narrative engine, action block selection, generation nodes.
- No single notion of a **narrative program** that:
  - Encapsulates dialogue, choices, visual beats, and action block usage.  
  - Is versioned, inspectable, and composable.
- Interactions, behavior events, and scene graphs each have their own “glue” logic for:
  - Building prompts, picking action blocks, launching scenes.
  - Tracking narrative state (what’s been said, which branches taken).

**Goal:** Introduce a unified **Narrative Runtime** that:

- Treats dialogue, action blocks, generation prompts, and scene transitions as parts of one program model.
- Integrates with:
  - NPC ECS components (relationship/mood state, behavior context).  
  - Interaction layer (player choices and NPC-initiated events).  
  - Generation pipeline (for LLM/video content).
- Provides clear, authorable building blocks for:
  - Intimate scenes, quests, character arcs, daily conversations.

---

## High-Level Design

### Narrative Program Model

Define a single, versioned `NarrativeProgram` concept:

- **Program** (TS + Pydantic):
  - `id`, `version`, `kind` (`dialogue`, `scene`, `quest_arc`, `intimacy_scene`, etc.).
  - `nodes`: typed nodes representing dialogue lines, choices, conditions, actions, scene transitions, and generation requests.
  - `edges`: directed edges with conditions and effects.
  - `metadata`: tags, content rating, associated characters/roles, etc.
- **Runtime state**:
  - Per NPC/session, tracked in ECS `components["narrative"]`:
    - Current program ID + node ID.  
    - Call stack for nested programs (e.g., interrupting events).  
    - History of visited nodes/choices.

Conceptually:

- Similar to a simple **graph-based state machine** with:
  - Dialogue nodes (text or LLM-based).  
  - Choice nodes.  
  - Action nodes (apply state changes or enqueue generation).  
  - Block nodes (action block references).  
  - Scene nodes (scene intent transitions).

### Action Blocks as First-Class Nodes

Action blocks become one type of **NarrativeNode**:

- `ActionBlockNode`:
  - References one or more `action_blocks` by ID.  
  - Specifies how to combine them (sequence, layered, merged).  
  - Optional conditions (mood, relationship, tags).
- The runtime:
  - Resolves the node into a sequence of blocks, using existing action block DB + search APIs.  
  - Produces either:
    - A generation prompt (for video/visual content).  
    - A direct call to generation pipeline (if desired).

### Integration Points

- **NPC ECS & metrics**:
  - Narrative runtime reads from ECS components (`core`, `romance`, `behavior`) to decide branches.
  - Writes effects into components (`romance`, `quest`, `interactions`) via ECS helpers.
- **Interaction layer**:
  - Interactions can launch a narrative program, not just fire off an ad-hoc generation request.
  - Interaction outcomes become “execute program X starting from node Y” instead of raw action block lists.
- **Behavior system**:
  - Behavior hooks can emit narrative intents (“play greeting program”) that the runtime consumes.
- **Intimacy Scene Composer**:
  - Exports programs in the canonical `NarrativeProgram` format; runtime executes them in-game.

---

## Phase Checklist

- [ ] **Phase 20.1 – Inventory Narrative Systems & Data Flows**
- [ ] **Phase 20.2 – Narrative Program Schema (TS + Pydantic)**
- [ ] **Phase 20.3 – Runtime State & ECS Component Integration**
- [ ] **Phase 20.4 – Action Block Node Integration**
- [ ] **Phase 20.5 – Execution Engine & Step API**
- [ ] **Phase 20.6 – Integration with Interactions, Behavior, and Intimacy Composer**
- [ ] **Phase 20.7 – Migration of Legacy Dialogue Paths & Backward Compatibility**
- [ ] **Phase 20.8 – Tooling & Authoring Support**

---

## Phase 20.1 – Inventory Narrative Systems & Data Flows

**Goal**  
Get a precise map of how narrative content is currently requested, built, and executed.

**Scope**

- `pixsim7_backend/domain/narrative/*` (engine, programs, context, action blocks).
- `pixsim7_backend/api/v1/game_dialogue.py` (if present) and related routes/plugins.
- `pixsim7_backend/api/v1/action_blocks.py` and action block services.
- `interaction_execution.prepare_generation_launch` and its use of `NarrativeEngine` / action blocks.
- Intimacy scene composer flows (`frontend/src/lib/intimacy/*`, `docs/INTIMACY_SCENE_COMPOSER.md`).

**Key Steps**

1. Enumerate all paths that result in:
   - Dialogue generation.  
   - Action block selection.  
   - Scene transitions + generation.  
2. Document:
   - Inputs required (NPC, world, relationship, arc state).  
   - Where prompts are built and with what templates.  
   - How results are returned and where they are stored in `flags`/`relationships`.
3. Add an “Inventory Summary” section at the bottom of this file with a simple table mapping:
   - System → Entry point → Output (dialogue/action blocks/scene/generation).

**Status:** ☐ Not started

---

## Phase 20.2 – Narrative Program Schema (TS + Pydantic)

**Goal**  
Define the canonical `NarrativeProgram` and node/edge types, shared between frontend, game-core, and backend.

**Scope**

- New TS module, e.g. `packages/types/src/narrative.ts`.  
\- New Pydantic models, e.g. `pixsim7_backend/domain/narrative/schema.py`.

**Key Steps**

1. Design core node types:
   - `DialogueNode`: static text or template + optional LLM program ID.  
   - `ChoiceNode`: list of choices with conditions and effects.  
   - `ActionNode`: state effects (relationship deltas, flag changes, ECS component updates).  
   - `ActionBlockNode`: references to one or more `action_blocks`.  
   - `SceneNode`: scene intent or scene ID + role bindings.  
   - `ExternalCallNode` (advanced): call into plugins or external systems.
2. Define `NarrativeProgram`:
   - `id`, `version`, `kind`, `nodes`, `edges`, `entryNodeId`, `metadata`.
3. Provide TypeScript and Pydantic validation:
   - Unique node IDs.  
   - Valid edge references.  
   - Content rating tags/intimacy vs world schemas (hook into existing validation where possible).
4. Decide storage:
   - Primary: `GameWorld.meta.narrative.programs` (JSON), keyed by program ID.  
   - Optional: continue using `action_blocks` table for reusable block content (unchanged).

**Status:** ☐ Not started

---

## Phase 20.3 – Runtime State & ECS Component Integration

**Goal**  
Represent narrative runtime state as an ECS component for each NPC-in-session.

**Scope**

- New ECS component: `components["narrative"]` under `flags.npcs["npc:<id>"]`.

**Key Steps**

1. Define `NarrativeStateComponent` in TS + Pydantic:

```ts
export interface NarrativeStateComponent {
  activeProgramId?: string;
  activeNodeId?: string;
  stack?: Array<{
    programId: string;
    nodeId: string;
  }>;
  history?: Array<{
    programId: string;
    nodeId: string;
    timestamp: number;
    choiceId?: string;
  }>;
}
```

2. Add ECS helpers:
   - `get_narrative_state(session, npcId)` / `set_narrative_state(session, npcId, state)`.  
3. Ensure narrative state is *separate* from generic interaction history (so you can use it for multiple programs).
4. Decide program lifecycles:
   - When a new program is started (from interaction/behavior/intimacy composer).  
   - When it finishes (terminal node) and how that is indicated in the component.

**Status:** ☐ Not started

---

## Phase 20.4 – Action Block Node Integration

**Goal**  
Make `ActionBlockNode` a first-class citizen in the narrative program model and runtime.

**Scope**

- Uses existing `action_blocks` table and APIs.

**Key Steps**

1. Define `ActionBlockNode` schema:
   - `blockIds?: string[]` (direct references).  
   - `blockQuery?: {...}` for search-based selection using tags, kind, complexity.  
   - `compositionStrategy`: `sequential`, `layered`, `merged`.  
2. Implement runtime helper:
   - `resolveActionBlockNode(node, context) -> ActionBlockSequence`:
     - If `blockIds` provided, fetch those from DB.  
     - If `blockQuery` provided, use existing search APIs.  
     - Return a sequence of blocks and metadata for downstream generation.  
3. Decide where resolved sequences go:
   - Either:
     - Directly call the generation service with composed prompt(s) and treat it as part of program execution, or  
     - Store a pending “visual generation request” in `session.flags.pendingActionBlocks` (similar to current behavior).
4. Integrate with existing `/api/v1/action_blocks` APIs for CRUD/search; no schema change required.

**Status:** ☐ Not started

---

## Phase 20.5 – Execution Engine & Step API

**Goal**  
Implement a simple narrative runtime that can advance one step at a time and be driven by UI/interaction calls.

**Scope**

- Backend service module, e.g. `pixsim7_backend/services/narrative/runtime.py`.

**Key Steps**

1. Define runtime entrypoints:
   - `start_program(session, npcId, programId, entryNodeId?)`:
     - Writes initial `NarrativeStateComponent`.  
   - `step_program(session, npcId, input?)`:
     - Reads current node.  
     - Executes node logic:
       - Dialogue: build prompt (static or via NarrativeEngine) and possibly enqueue generation.  
       - Choice: apply chosen branch based on `input.choiceId`.  
       - Action: apply state effects (relationship, flags, ECS).  
       - ActionBlockNode: resolve sequence + enqueue generation.  
       - SceneNode: set scene intent / transition info.  
     - Advances to next node or finishes.
2. Represent results:
   - A `NarrativeStepResult` (TS + Pydantic) including:
     - Display text (if any).  
     - Choices (if any).  
     - Any launched scene/generation IDs.  
     - Updated narrative state snapshot.
3. Wire runtime into:
   - Interaction execution: instead of ad-hoc `pendingDialogue`, call `start_program`/`step_program` where appropriate.  
   - (Later) dedicated narrative endpoints if needed.

**Status:** ☐ Not started

---

## Phase 20.6 – Integration with Interactions, Behavior, and Intimacy Composer

**Goal**  
Replace scattered narrative calls with narrative program launches and steps.

**Scope**

- `interaction_execution.prepare_generation_launch`.  
- Behavior hooks that want scripted dialogue.  
- Intimacy Scene Composer outputs.

**Key Steps**

1. Interactions:
   - Allow `InteractionOutcome` to specify:
     - `narrativeProgramId` and optional `entryNodeId` instead of (or in addition to) direct `GenerationLaunch` config.  
   - On execution:
     - Call `start_program` for that program and NPC.  
     - Return initial `NarrativeStepResult` to the frontend.  
2. Behavior:
   - Extend behavior hooks (via BehaviorExtensionAPI or built-in configs) to emit narrative intents:
     - E.g., `hook: greetOnApproach` → start `program:small_talk` when conditions match.  
3. Intimacy Scene Composer:
   - Add an export path from the composer to `NarrativeProgram` JSON.  
   - Let those programs be executed by the runtime when triggered via interactions/behavior.

**Status:** ☐ Not started

---

## Phase 20.7 – Migration of Legacy Dialogue Paths & Backward Compatibility

**Goal**  
Maintain compatibility with existing dialogue/action-block flows while gradually moving to the new runtime.

**Scope**

- Dialogue endpoints and legacy uses of `NarrativeEngine`.

**Key Steps**

1. Identify legacy entrypoints:
   - Any route that directly uses `NarrativeEngine.build_dialogue_request` outside of the new runtime.  
   - Direct uses of action blocks (without going through `ActionBlockNode`).
2. Provide shims:
   - Wrap common legacy flows in small programs (e.g. single `DialogueNode` + `ActionBlockNode`).  
   - Or have the runtime call into `NarrativeEngine` internally so that existing programs can be “hosted” in the new runtime model.
3. Gradually:
   - Mark legacy endpoints as deprecated in docs.  
   - Encourage new work to use:
     - Narrative programs launched via interactions/behavior.  
     - Intimacy composer exports.
4. Ensure tests cover:
   - That old and new paths produce equivalent prompts and state updates for representative scenarios.

**Status:** ☐ Not started

---

## Phase 20.8 – Tooling & Authoring Support

**Goal**  
Make the narrative runtime understandable and usable for designers and plugin authors.

**Scope**

- Docs, UI tools, and debugging aids.

**Key Steps**

1. Documentation:
   - Add `docs/NARRATIVE_RUNTIME.md` describing:
     - NarrativeProgram schema.  
     - Node types and examples.  
     - How interactions/behavior/intimacy composer hook in.  
2. Editor support:
   - Long-term: extend existing graph editors (scene/arc graph, intimacy composer) to:
     - Show narrative programs.  
     - Edit program nodes/edges.  
     - Simulate runtime steps from different ECS contexts.
3. Debug tools:
   - Admin or dev view to inspect current narrative state per NPC/session:
     - Active program/node.  
     - History of nodes/choices.  
     - Any pending generations/dialogue requests.

**Status:** ☐ Not started

---

## Success Criteria

By the end of this task:

- There is a **single narrative program model** that can express:
  - Dialogue trees, choices, action block sequences, and scene/generation transitions.  
  - Intimacy scenes, quest beats, and everyday conversations.
- Narrative runtime state is stored in ECS components and interacts cleanly with:
  - NPC behavior system (Task 13).  
  - NPC interactions and chains (Task 17).  
  - Relationship/mood metrics and ECS components (Task 19).
- Action blocks are **first-class nodes** in the narrative graph, not an entirely separate system.
- Legacy dialogue/action-block flows continue to work via shims, but new work uses the narrative runtime as the canonical path.

