# Sequential Generation Chains - Design Exploration

> Date: 2026-02-23
> Status: Exploration / RFC
> Related: `docs/prompt-template-system-target-architecture.md`, `docs/game-systems/GRAPH_SYSTEM.md`

---

## 1. Problem Statement

We want to chain generation steps sequentially: step 1 generates an image, its result becomes the input for step 2, that result feeds step 3, etc. Each step can use a different block template and/or operation type.

**Example use case:**
```
txt2img (template: scene_composition)
  → img2img (template: detail_refine)
    → upscale (template: final_polish)
```

This must be generic enough to work from:
- The quick-generate UI ("Each" button or similar)
- A visual node editor
- Mid-narrative (game runtime hitting a generation node in a scene program)

---

## 2. What Exists Today

### 2.1 "Each" Button System

**Files:**
- `apps/main/src/features/generation/components/generationSettingsPanel/EachSplitButton.tsx`
- `apps/main/src/features/generation/lib/combinationStrategies.ts`
- `apps/main/src/features/generation/hooks/useQuickGenerateController.ts`

**What it does:** Fan-out — groups inputs via combination strategies (each, anchor_sweep, sequential_pairs, all_pairs), loops through groups, fires each as a separate generation request. All items go through the same operation. Fire-and-forget (does not wait for completion).

**Key mechanism:** `generateEach()` for-loop with progress tracking (`queued/total`).

### 2.2 Run Context

**File:** `apps/main/src/features/generation/lib/runContext.ts`

**Vocabulary:**
- `GenerationRunDescriptor` — describes a batch (mode, strategy, metadata)
- `ResolvedGenerationRunDescriptor` — descriptor with resolved `runId`
- `GenerationRunItemDescriptor` — one item within a run (index, total, input assets)
- `GenerationRunContext` — flattened payload sent as `config.run_context` per request

**Run modes already defined:**
```typescript
type GenerationRunMode =
  | 'quickgen_single'
  | 'quickgen_burst'
  | 'quickgen_each'
  | 'scene_node'          // ← generation from narrative already anticipated
  | 'narrative_runtime'   // ← same
  | (string & {});
```

**Existing fields:** `run_id`, `item_index`, `item_total`, `input_asset_ids`, `strategy`, `set_id`, plus open `[key: string]: unknown`.

### 2.3 Block Template System

**Key files:**
- `apps/main/src/features/prompts/stores/blockTemplateStore.ts`
- `pixsim7/backend/main/services/prompt/block/template_service.py`

**What it does:** Slot-based prompt assembly. Each slot defines constraints (role, category, tags, package) and a selection strategy. Rolling picks one block per slot, composes them (sequential/layered/merged), expands character bindings.

**Template rolling modes (existing):**
- `'once'` — roll once on client, reuse prompt for all items
- `'each'` — roll per-item on backend via `block_template_id` in run_context

### 2.4 Node / Graph System

**Graph layers (existing):**
```
Character Graph  (meta: relationships, identity)
Arc Graph        (story structure: arcs, quests, milestones)
Scene Graph      (narrative flow: video, choice, NPC response, action_block)
Routine Graph    (NPC schedules: time_slot, decision, activity)
```

**Execution engines:**
- `NarrativeExecutor` (packages/game/engine) — step-by-step, interactive, awaits player input
- `NarrativeRuntimeEngine` (backend) — async orchestrator for dialogue/action generation
- `AutomationExecutionLoop` (backend) — queue-based scheduling with retry/polling

**Shared primitives:**
- `NodeTypeDefinition` with ports, handlers, validation
- `NodeHandlerRegistry` — pluggable `execute(context) → result`
- `PortConfig` — input/output connection points
- Edge conditions and selection strategies
- State effects carried between nodes

**Key insight:** `NarrativeExecutor` already handles `action_block` nodes that trigger visual content. A generation step is conceptually the same — a node that triggers generation and produces an asset.

### 2.5 Backend Generation Tracking

- `GenerationTrackingService.get_run_tracking(run_id)` — fetches all items in a batch by run_id
- Returns ordered manifests with generation status
- Already links generations through shared `run_id`

### 2.6 GenerationStepExecutor (NEW — prerequisite primitive)

**File:** `pixsim7/backend/main/services/generation/step_executor.py`

The missing piece that all sequential patterns need: **submit a generation and await its completion.** Before this, every generation was fire-and-forget.

**How it works:**
1. Submits via `GenerationCreationService.create_generation()`
2. Subscribes to `job:completed` / `job:failed` / `job:cancelled` on the in-process `EventBus` for fast notification
3. Runs a parallel polling fallback via `GenerationQueryService` every `poll_interval` seconds (resilience against missed events)
4. Returns `StepResult` with `generation_id`, `status`, `asset_id`, error details, timing

**Key types:**
- `StepResult` — dataclass with terminal generation outcome
- `StepTimeoutError` — raised if generation exceeds timeout (default 10 min)
- `StepFailedError` — convenience exception wrapping a failed `StepResult`

**Design boundary:** This service does NOT know about chains, templates, graphs, or combination strategies. It only does: submit one generation → wait → return result. Callers own the orchestration logic above it.

**Callers (current and future):**

| Caller | What it does with StepExecutor |
|---|---|
| Sequential "Each" | Loop over inputs, same operation, pipe results |
| ChainExecutor (Phase 1) | Loop over steps, different templates, compile guidance |
| gen_step node handler (Phase 2) | Single call per node; graph executor manages traversal |
| NarrativeRuntimeEngine (later) | Single call when story hits a generation node |

---

## 3. The Core Design Question

**A generation chain is a graph program.** The question is: what kind of graph, and what executes it?

---

## 4. Architecture Options

### Option A: Chain as a new graph type with its own executor

```
GenerationGraph  (new graph type)
  └── GenerationExecutor  (new executor)
```

**Node types:** `gen_step`, `asset_input`, `condition`, `merge`

**Executor:** Auto-advancing (no player input), polls for completion between steps, carries asset IDs in state.

**Pros:**
- Clean domain boundary — generation chains don't inherit narrative baggage
- Executor is simple (no dialogue/choice/wait handling)
- Easy to reason about in isolation

**Cons:**
- Can't embed generation steps in narrative scenes without a bridge
- Duplicates graph primitives (nodes, edges, conditions) that already exist
- Two separate executors need to understand generation

### Option B: Generation step as a node type usable in ANY graph

```
Shared node type registry
  └── gen_step node type + handler
        ├── usable in NarrativeProgram (mid-story generation)
        ├── usable in a standalone GenerationGraph
        └── usable in future automation graphs
```

**No new graph type.** A `gen_step` is just a node type like `video` or `choice`. Any executor that hits one calls the same handler.

**Executor adaptation:**
- `NarrativeExecutor` hitting a `gen_step` → delegates to gen handler, waits for result, continues story
- A lightweight `AutoAdvanceExecutor` for standalone chains → same handler, but auto-advances instead of waiting for player input

**Pros:**
- Templates work everywhere — narrative, standalone chains, automation
- One handler, one node type definition, one set of ports
- Node editor works for all graph types
- "Each" button just builds a linear program and runs it

**Cons:**
- `NarrativeExecutor` needs to become async-aware (currently step-by-step)
- Gen handler must work in both interactive and headless contexts
- Risk of over-generalizing too early

### Option C: Generation chain as template metadata (no graph)

Keep it simple — a "chain template" is a `BlockTemplate` with a `steps` array in `template_metadata`:

```json
{
  "template_metadata": {
    "chain_steps": [
      { "template_id": "scene_comp", "operation": "txt2img" },
      { "template_id": "detail_ref", "operation": "img2img", "input": "previous" },
      { "template_id": "polish", "operation": "upscale", "input": "previous" }
    ]
  }
}
```

The existing `roll_template` backend path gains a "chain mode" that loops through steps.

**Pros:**
- Minimal new infrastructure — extends existing template system
- No new executor, graph type, or node type
- Quick to implement

**Cons:**
- Linear only — no branching, conditions, parallel paths
- Not usable from narrative (templates don't execute in story flow)
- Dead end for node editor integration
- Separate concept from the graph system

### Option D: First-class chain entity with graph-compatible schema

`GenerationChain` is its own entity (own storage, model, API) — not nested in template metadata. It references templates by ID but is not owned by any template.

**Core separation:**
- `BlockTemplate` = semantic prompt recipe (slots, controls, character bindings)
- `GenerationChain` = orchestration plan (steps, wiring, per-step guidance)
- `GuidancePlan` = runtime/control payload (per step / per run)
- "Each" = execution mode UI (not authoring)

The chain schema is graph-compatible from day one — each step has an `id`, typed metadata, and explicit `input_from` wiring. Mechanical conversion to `gen_step` nodes later.

**Pros:**
- Clean boundary between recipe and orchestration — no coupling to extract later
- Own versioning/forks path (chain revisions independent of template revisions)
- Per-step guidance naturally scoped to the chain entity
- Better narrative/game integration path (chain is already a program, not template magic)
- No migration pain — never nested, so nothing to extract

**Cons:**
- Slightly more upfront work than stuffing steps into template metadata
- New table/store/API surface from day one
- Need a chain authoring UI (can't piggyback on TemplateBuilder)

---

## 5. Comparison Matrix

| Concern | A: Separate graph | B: Shared node type | C: Template metadata | D: Hybrid |
|---|---|---|---|---|
| **Linear chains** | Yes | Yes | Yes | Yes |
| **Branching / conditions** | Yes | Yes | No | Later |
| **Mid-narrative generation** | Bridge needed | Native | No | Later |
| **Node editor** | Own editor | Shared editor | No | Later |
| **"Each" button integration** | Builds graph | Builds graph | Extends template | Separate flow |
| **Implementation effort** | High | High | Low | Medium |
| **New concepts introduced** | Graph type + executor | Node type + handler | Chain mode | Chain entity + executor |
| **Risk of over-engineering** | Medium | High | Low | Low |
| **Dead-end risk** | Low | Low | High | Low |
| **Data migration risk** | None | None | High (extract later) | None |

---

## 6. Key Dilemmas

### 6.1 Where does the chain definition live?

**Resolved:** First-class `GenerationChain` entity. Not in template metadata, not in graph programs (yet).

- Templates remain prompt recipes — they don't know about chains.
- Chains reference templates by ID — they orchestrate across templates.
- Later, chains convert mechanically to graph programs for the node editor.

### 6.2 How does the executor wait for completion?

The "Each" system fires all requests and doesn't wait. A chain MUST wait for step N to finish before starting step N+1.

**Options:**
- **Frontend polling** — controller polls `GenerationTrackingService.get_run_tracking()` until step completes. Simple but fragile (tab close = chain dies).
- **Backend orchestration** — backend manages the chain loop. Survives tab close but needs new backend service.
- **WebSocket / SSE push** — backend notifies frontend when step completes. Best UX but most complex.

Current infrastructure leans toward **frontend polling** (tracking service already exists), with **backend orchestration** as the upgrade path.

### 6.3 Should NarrativeExecutor gain generation awareness?

If we want mid-narrative generation (Option B), the `NarrativeExecutor` needs to:
1. Recognize `gen_step` nodes
2. Call the generation handler (async — submit + wait)
3. Store result asset in execution state
4. Continue traversal

The executor is currently synchronous/step-based. Making it async-aware is non-trivial but arguably needed anyway for action_block nodes that trigger visual content.

**Alternatively:** Keep `NarrativeExecutor` as-is. When it hits a `gen_step`, it delegates to the `NarrativeRuntimeEngine` (backend) which already coordinates async generation. The executor pauses, backend does the work, executor resumes.

### 6.4 Template rolling per step — client or server?

- **Client-side:** Frontend rolls each step's template, builds request, submits. More control but requires frontend to orchestrate the loop.
- **Server-side:** Frontend sends "run this chain", backend rolls + generates + chains. Cleaner separation but needs new backend endpoint.

The existing `templateRollMode: 'each'` already does server-side per-item rolling. Extending this to chain steps is natural.

### 6.5 What about the "Each" button — refactor or leave?

The "Each" button's `generateEach()` loop works fine for fan-out. Options:

- **Leave it.** "Each" stays as-is for fan-out. Chain is a separate flow. Two code paths.
- **Unify.** Both fan-out and chain are graph programs. "Each" builds a parallel graph, chain builds a sequential graph, same executor runs both. Cleaner but bigger refactor.
- **Incremental.** Chain ships as its own flow. Later, "Each" migrates to the same executor when we're confident in it.

### 6.6 How does the result flow between steps?

- **Asset ID in state:** Step N completes → result asset_id written to execution state → Step N+1 reads it as input.
- **Explicit wiring:** Each step declares `input_from: "step_1"` referencing a previous step by ID. More flexible (can reference any prior step, not just the previous one).
- **Port-based:** Node output port connects to next node's input port. Most general (supports fan-in, merge) but heaviest model.

For the graph approach (Options A/B), port-based is natural. For metadata (Options C/D), explicit `input_from` is sufficient.

### 6.7 How does guidance (references / regions / masks) flow between steps?

Sequential chains become much more useful if steps can carry non-text guidance in addition to prompt/template inputs.

**Examples:**
- Step 1 (`txt2img`) uses character reference images + rough regions
- Step 2 (`img2img refine`) reuses step 1 output as source image and adds edit/protect masks
- Step 3 (`upscale`) may inherit references but ignore masks/regions

**Proposed rule:** guidance is step-scoped, but can inherit from prior steps.

This avoids two common failure modes:
- blindly reusing masks from a prior step where dimensions/intent changed
- re-specifying the same reference images on every step

**v1 integration point:** carry guidance through existing `runContext` as `guidance_plan` (or `guidance_plan_patch`) using the same extra-field mechanism already used for per-item metadata.

**Inheritance defaults (recommended):**
- **References:** inherit by default across steps (stable cast identity)
- **Regions:** inherit only when explicitly requested (layout often changes after crop/refine)
- **Masks:** do **not** inherit by default (step-specific editing/protection intent)
- **Constraints:** shallow-merge with explicit override (e.g., tighten preservation in later steps)

**Execution state should persist:**
- compiled guidance used for the step
- formatter warnings/fallbacks (e.g., provider ignored regions)
- derived provider image legend (if applicable)

---

## 7. Recommended Direction

**Option D (first-class chain entity), designed toward Option B (shared gen_step node type).**

### Design Stance

Four entities, four concerns:

| Entity | Concern | Owns |
|---|---|---|
| `BlockTemplate` | Prompt recipe | Slots, controls, character bindings, composition |
| `GenerationChain` | Orchestration plan | Steps, wiring, per-step overrides |
| `GuidancePlan` | Runtime control payload | References, regions, masks, constraints (per step) |
| "Each" button | Execution mode UI | Combination strategy, fan-out — not authoring |

### Decision Notes

1. **`GenerationChain` is a first-class entity from day one.**
- Own table/model, own API, own store, own UI.
- References templates by ID — does not embed in or extend template metadata.
- Each step has stable `id`, typed metadata, and explicit `input_from` wiring (graph-compatible).

2. **Backend orchestration early** (not just frontend polling).
- Guidance, masks, and derived artifacts make per-step execution non-trivial.
- Backend chain executor survives tab close and is closer to game runtime needs.
- Frontend sends "run this chain" → backend loops, rolls, generates, tracks.
- Frontend polls progress via existing `run_id` tracking.

3. **Do not make `NarrativeExecutor` fully async in Phase 1/2.**
- When narrative integration arrives, delegate from `NarrativeExecutor` to backend `NarrativeRuntimeEngine` for `gen_step` handling.
- Avoids early invasive changes to the executor while still enabling mid-story generation later.

4. **Do not unify "Each" with chain execution yet.**
- Keep the current fan-out path (`generateEach()`) as-is while chain semantics stabilize.
- Revisit unification only after chain execution, step state, and guidance integration are proven.
- Target future convergence via a shared auto-advance/graph executor, not premature abstraction.

5. **Chain Builder is a separate UI.**
- Not TemplateBuilder — templates remain focused on prompt recipe authoring.
- Lightweight panel/modal is enough for Phase 1 (add steps, pick template per step, set overrides).
- Node editor is the long-term authoring destination.

6. **Include explicit per-step execution state from day one.**
- Step state tracks: result asset ID, source asset, roll metadata, compiled guidance plan, formatter warnings.
- This is the bridge to graph execution and replay/debugging.

### Phase 1 — Chain entity + backend executor

1. New `GenerationChain` model/table (id, name, steps JSONB, metadata).
2. New API endpoints: CRUD + `POST /generation-chains/{id}/execute`.
3. Backend `ChainExecutor` service — async loop that:
   - Rolls each step's template (reuse existing `roll_template`)
   - Compiles per-step guidance (inherit/override per `guidance_inherit` rules)
   - Submits generation
   - Polls/awaits completion
   - Pipes result asset to next step
   - Writes per-step execution state
4. New run mode: `'generation_chain'`.
5. Frontend: chain builder UI + execute button + progress display (polls `run_id` tracking).

### Phase 2 — gen_step node type (enable narrative + visual editing)

1. Register `gen_step` in the shared `NodeTypeRegistry`.
2. Define ports: `asset_in`, `asset_out`.
3. Implement `GenerationStepHandler` following `NodeHandler` interface.
4. Add to scene graph node types (usable in NarrativeProgram).
5. Convert chain metadata → graph program (mechanical: step → node, input_from → edge).

### Phase 3 — Unified executor (optional unification)

1. Generalize `ChainExecutor` into an `AutoAdvanceExecutor` that runs any graph program headlessly.
2. Migrate "Each" fan-out to build a parallel graph + run through same executor.
3. Phase out bespoke `generateEach()` loop.

---

## 8. Data Model Sketch (Phase 1)

### GenerationChain entity

```typescript
interface GenerationChain {
  id: string;
  name: string;
  description?: string;
  steps: ChainStep[];
  metadata?: Record<string, unknown>;  // extensible (tags, authoring hints, etc.)
  created_by?: string;
  created_at: string;
  updated_at: string;
}
```

### ChainStep definition

```typescript
interface ChainStep {
  id: string;                          // unique within chain, stable across edits
  label?: string;                      // human-readable
  template_id: string;                 // which template to roll
  operation?: string;                  // operation type override
  input_from?: string;                 // step ID — defaults to previous step
  control_overrides?: Record<string, number>;  // slider values for this step's template
  character_binding_overrides?: Record<string, unknown>;
  guidance?: Record<string, unknown>;  // provider-agnostic guidance plan (or patch)
  guidance_inherit?: {
    references?: boolean;              // default true
    regions?: boolean;                 // default false
    masks?: boolean;                   // default false
    constraints?: boolean;             // default true (shallow merge)
  };
}
```

### Per-step execution state (written by executor during run)

```typescript
interface ChainStepExecutionState {
  step_id: string;
  status: 'pending' | 'rolling' | 'generating' | 'completed' | 'failed';
  generation_id?: string;              // submitted generation ID
  result_asset_id?: number;            // output asset
  source_asset_id?: number;            // input asset (from previous step)
  roll_result?: {
    assembled_prompt: string;
    selected_block_ids: string[];
    roll_seed?: number;
  };
  compiled_guidance?: Record<string, unknown>;  // resolved guidance after inheritance
  formatter_warnings?: string[];
  error?: string;
  started_at?: string;
  completed_at?: string;
}
```

### Run context extension

```typescript
// New fields on GenerationRunContext:
{
  mode: 'generation_chain',
  run_id: string,
  chain_id: string,              // which chain is being executed
  chain_step_id: string,         // which step in the chain
  chain_step_index: number,      // 0-based position
  chain_total_steps: number,
  chain_source_asset_id?: number,  // result from previous step
  block_template_id: string,     // for server-side rolling
  guidance_plan?: Record<string, unknown>, // compiled per-step guidance
}
```

**Note:** `guidance_plan` should follow the provider-agnostic schema in `docs/prompt-guidance-plan-v1.md` and remain separate from provider formatter output. Provider-specific attachment decisions, image-slot numbering, and legend text are derived later.

### Backend model (Python)

```python
class GenerationChain(Base):
    __tablename__ = "generation_chains"

    id: Mapped[str]               # UUID primary key
    name: Mapped[str]
    description: Mapped[str | None]
    steps: Mapped[list]           # JSONB — list of ChainStep dicts
    metadata_: Mapped[dict]       # JSONB — extensible
    created_by: Mapped[str | None]
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
```

### API endpoints

```
POST   /generation-chains                    → create chain
GET    /generation-chains                    → list chains
GET    /generation-chains/{id}               → get chain detail
PATCH  /generation-chains/{id}               → update chain
DELETE /generation-chains/{id}               → delete chain
POST   /generation-chains/{id}/execute       → start chain execution
GET    /generation-chains/executions/{run_id} → get execution progress/state
```

### Conversion to graph (Phase 2)

```
ChainStep { id, template_id, input_from }
  ↓ mechanical conversion
GraphNode { id, type: 'gen_step', data: { template_id }, edges: [next_step_id] }
  + Edge { from: previous_step.asset_out, to: this_step.asset_in }
```

---

## 9. Open Questions

1. ~~**Chain authoring UI**~~ **Resolved:** Separate chain builder UI. Not TemplateBuilder, not node editor (yet).

2. **Error handling mid-chain** — if step 3 of 5 fails, do we: stop the chain? retry? skip and continue? Let user configure per-step?

3. **Branching (Phase 2)** — when we add conditions, what do we branch on? Generation metadata (resolution, model used)? External state? User-defined tags on the result?

4. **Backend orchestration scope** — Phase 1 puts the chain loop on the backend. How much state does it persist? Just per-step status + asset IDs, or full execution replay (prompts, roll seeds, timing)? Richer state enables debugging/replay but adds storage.

5. **Template vs prompt override per step** — should a step be allowed to skip template rolling and use a fixed prompt? (Useful for deterministic steps like upscale.)

6. **Asset set integration** — can chain steps reference asset sets? E.g., "for each item in set, run this chain." This is the intersection of "Each" fan-out and chain sequencing.

---

## 10. Relationship to Existing Architecture Docs

- **Prompt template target architecture** (`docs/prompt-template-system-target-architecture.md`) — Section 8 ("Template as Structured Scene Request") describes templates becoming game-facing artifacts. Sequential chains extend this: a chain is a multi-step scene request.

- **Prompt guidance plan v1** (`docs/prompt-guidance-plan-v1.md`) — Defines the provider-agnostic runtime schema (`references`, `regions`, `masks`, `constraints`) that can be carried per-step in chain execution via `runContext.guidance_plan`.

- **Graph system** (`docs/game-systems/GRAPH_SYSTEM.md`) — The gen_step node type (Phase 2) would register alongside existing scene/arc node types. The shared validation, dependency tracking, and undo/redo systems apply directly.

- **Run context** — Already has `scene_node` and `narrative_runtime` modes, confirming generation-from-graph was anticipated. Chain adds `generation_chain` mode using the same `run_id` + `item_index` pattern.
