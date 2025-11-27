## 81 – Prompt & Action Block Graph Surfaces (Dev-Only)

**Goal:** Visualize prompt structure and reusable ActionBlocks using the existing graph/editor infrastructure, without creating a separate “PromptBlocks” persistence layer. Provide two related graph views:
- A **Prompt Block Graph** showing parsed blocks for one or more prompt versions.
- An **Action Block Graph** showing ActionBlocks, their compatibility chains, and compositions.

---

### Context

Already implemented:

- **Prompt parsing / analysis:**
  - `prompt_dsl_adapter.parse_prompt_to_blocks(text)` and `analyze_prompt(text)` produce `{prompt, blocks, tags}`.
  - `PromptBlocksViewer` (frontend) displays blocks grouped by `role` for prompts in:
    - Prompt Inspector dev route (`/dev/prompt-inspector`),
    - Generation Dev Panel,
    - Prompt Lab (`/dev/prompt-lab`).

- **ActionBlocks unified system (persistent “block” layer):**
  - `ActionBlockDB` (`pixsim7/backend/main/domain/action_block.py`) stores reusable prompt components with:
    - `prompt`, `tags`, `compatible_next/prev`, `complexity_level`, `source_type`, etc.
    - Links to `prompt_versions` (`prompt_version_id`, `extracted_from_prompt_version`).
    - Composition fields: `is_composite`, `component_blocks`, `composition_strategy`.
  - ActionBlocks APIs under `/api/v1/action-blocks/*` for:
    - Extracting blocks from prompts (`/extract`),
    - Composing blocks (`/compose`),
    - Searching, compatibility queries, usage, etc.

- **Graph/editor infrastructure:**
  - Existing graph editor / panel system used for Scene Graph, Arc Graph, etc.
  - Graph rendering components and registries already exist in the frontend.

This task reuses these systems to **visualize** both parsed prompt blocks and stored ActionBlocks as graphs.

---

### Task A – Define Graph Shapes (Types, No Persistence)

**Goal:** Define small, explicit graph data structures for dev-only visualizations, without adding DB tables.

**Prompt Block Graph types (frontend shared types):**

```ts
// For dev-only graph surfaces

export type PromptGraphNodeKind = 'prompt' | 'block' | 'role';
export type PromptGraphEdgeKind = 'next' | 'contains' | 'role-group';

export interface PromptGraphNode {
  id: string;                     // e.g., "prompt:{versionId}", "block:{idx}", "role:action"
  kind: PromptGraphNodeKind;
  label: string;                  // short label for node
  role?: string;                  // for block nodes (character/action/setting/...)
  versionId?: string;             // prompt version UUID (for prompt/block nodes)
}

export interface PromptGraphEdge {
  id: string;                     // e.g., "e-next-0-1"
  kind: PromptGraphEdgeKind;
  from: string;
  to: string;
}

export interface PromptBlockGraph {
  nodes: PromptGraphNode[];
  edges: PromptGraphEdge[];
}
```

**Action Block Graph types (frontend shared types):**

```ts
export type ActionGraphNodeKind = 'block' | 'package' | 'prompt-version';
export type ActionGraphEdgeKind = 'can-follow' | 'composed-of' | 'extracted-from';

export interface ActionGraphNode {
  id: string;                     // e.g., "ab:{uuid}", "pkg:{name}", "pv:{versionId}"
  kind: ActionGraphNodeKind;
  label: string;
  packageName?: string;           // for block nodes
  complexity?: string;            // simple/moderate/complex/very_complex
}

export interface ActionGraphEdge {
  id: string;
  kind: ActionGraphEdgeKind;
  from: string;
  to: string;
}

export interface ActionBlockGraph {
  nodes: ActionGraphNode[];
  edges: ActionGraphEdge[];
}
```

**Note:** These types live purely in the frontend (or shared TS types). No new backend tables are introduced in this task; graphs are built from existing APIs.

---

### Task B – Prompt Block Graph (Prompt Lab Integration)

**Goal:** Add a dev-only graph view for the parsed blocks of a prompt version in Prompt Lab.

**Frontend files:**

- `apps/main/src/routes/PromptLabDev.tsx`
- (Optionally) a new graph surface component under `apps/main/src/components/graph/PromptBlockGraphSurface.tsx` or similar.

**Behavior:**

- In the **Library** tab of Prompt Lab, when a version is selected (you already fetch `DevPromptVersionDetail` including `prompt_analysis.blocks`):
  - Add a “Graph View” button or tab in the Version Detail area.
  - Clicking it constructs a `PromptBlockGraph` from `prompt_analysis.blocks`:
    - Nodes:
      - `prompt` node: id `prompt:{versionId}`, label from family title / slug or “Prompt v#”.
      - One `block` node per parsed block, id `block:{index}`, label = truncated `block.text`, `role` from block.
      - Optional `role` group nodes: `role:{roleName}`.
    - Edges:
      - `contains` edges from `prompt` → each `block` node.
      - `next` edges between consecutive blocks (`block:i → block:i+1`).
      - Optional `role-group` edges from each role node to matching block nodes.
  - Render this graph using an existing graph canvas / editor surface:
    - Register a new graph editor type (e.g., `prompt-block-graph`) in the graph editor registry with:
      - Simple layout (horizontal chain with prompt node at the top).
      - Color-coded nodes by `role`.
    - The surface is **read-only** (no editing/saving).

**Implementation notes:**

- Keep all graph building logic in the frontend using `DevPromptVersionDetail.prompt_analysis.blocks`.
- If `prompt_analysis` is missing, you can:
  - Call `/api/v1/dev/prompt-inspector/analyze-prompt` with the prompt text, or
  - Rely on `dev_prompt_library` endpoint to already compute it (it does on-the-fly analysis).

---

### Task C – Action Block Graph (ActionBlocks Library View)

**Goal:** Visualize stored ActionBlocks and their compatibility/composition edges as a graph.

**Backend (API reuse):**

- Use existing ActionBlocks endpoints:
  - `GET /api/v1/action-blocks` with filters for package/tag/source_type.
  - `GET /api/v1/action-blocks/{id}` for full details (if needed).
  - These provide the data needed for nodes and edges:
    - `block_id`, `package_name`, `complexity_level`,
    - `compatible_next`, `component_blocks`, `prompt_version_id`, `extracted_from_prompt_version`.

**Frontend:**

- Add a new dev route/panel, e.g.:
  - `apps/main/src/routes/ActionBlockGraphDev.tsx`
  - Route: `/dev/action-block-graph`.
  - Also register it as a dev tool in `registerDevTools` (like Prompt Lab).

**UI behavior:**

- Filters section:
  - Filter by `package_name`, `source_type`, simple text/tag search.
  - Button: “Load Action Block Graph”.
- Graph construction:
  - Nodes:
    - `block` nodes for each ActionBlock:
      - id `ab:{uuid}` or `ab:{block_id}`.
      - label: `block_id` (or package:name).
      - `packageName`, `complexity` from the block.
    - Optional `package` nodes:
      - id `pkg:{package_name}`, label `package_name`.
      - edges `pkg → block` for grouping.
  - Edges:
    - `can-follow` edges from `compatible_next`:
      - For block A with `compatible_next = ["bench_sit_closer", ...]`, add edges `A → B` for matching blocks B.
    - `composed-of` edges for composite blocks:
      - If `is_composite` and `component_blocks` filled, add edges `composite → component`.
    - `extracted-from` edges:
      - If `extracted_from_prompt_version` is set, optionally create a `prompt-version` node `pv:{versionId}` and add `pv → block`.
- Render graph:
  - Register an `action-block-graph` surface in the graph editor/registry:
    - Layout blocks by package and/or complexity (e.g., packages as columns, complexity as rows).
    - Different node styles for composite vs. simple blocks.
    - Simple hover detail showing tags/complexity.

**Note:** This graph is also read-only; it’s for inspection, not editing ActionBlocks.

---

### Task D – Optional Cross-Link: Prompt Blocks ↔ ActionBlocks

> This is optional in this task, but sets up future integration with game/narrative systems.

**Idea:**

- When viewing a Prompt Block Graph for a version that has extracted ActionBlocks:
  - Use `ActionBlockDB.extracted_from_prompt_version` to fetch ActionBlocks for that version.
  - Indicate which parsed blocks correspond to existing ActionBlocks:
    - Simple strategy: match by `prompt` substring, tags, or stored linkage (if the extractor stores mapping).
  - In the Prompt Block Graph surface:
    - Offer a toggle to “Highlight ActionBlocks,” which:
      - Marks blocks that have a linked ActionBlock,
      - Optionally allows clicking to open the Action Block Graph centered on that block.

No new backend fields are needed; this is based on existing `extracted_from_prompt_version` and ActionBlocks APIs.

---

### Task E – Graph Editor Integration

**Goal:** Register the new graph surfaces with the existing graph editor / panel system so they can be opened like other dev graph tools.

**Frontend integration points:**

- Graph editor registry (similar to how Scene Graph / Arc Graph is registered).
- Dev tools registry:
  - Register Prompt Block Graph and Action Block Graph as dev tools:

  ```ts
  devToolRegistry.register({
    id: 'prompt-block-graph',
    label: 'Prompt Block Graph',
    description: 'Visualize parsed prompt blocks as a graph',
    icon: '🔗',
    category: 'prompts',
    routePath: '/dev/prompt-lab', // opened in Prompt Lab context
    tags: ['prompts', 'graph', 'analysis'],
  });

  devToolRegistry.register({
    id: 'action-block-graph',
    label: 'Action Block Graph',
    description: 'Visualize ActionBlocks and their compatibility/composition',
    icon: '🧩',
    category: 'prompts',
    routePath: '/dev/action-block-graph',
    tags: ['action-blocks', 'graph', 'library'],
  });
  ```

---

### Acceptance Checklist

- [ ] Prompt Block Graph:
  - [ ] Prompt Lab Library tab has a “Graph View” for a selected version.
  - [ ] Graph shows prompt + block nodes with `contains` and `next` edges.
  - [ ] Nodes are color-coded by `role` and rendered via the existing graph surface system.
  - [ ] No new backend tables; graph is built from `prompt_analysis.blocks`.
- [ ] Action Block Graph:
  - [ ] `/dev/action-block-graph` route exists and lists/filters ActionBlocks.
  - [ ] Graph shows ActionBlocks as nodes with `can-follow` and `composed-of` edges; optional package/prompt-version grouping.
  - [ ] Uses existing ActionBlocks APIs only; no schema changes.
- [ ] Integration:
  - [ ] New graph surfaces are registered with the graph editor and dev tool registry.
  - [ ] (Optional) Prompt Block Graph can highlight ActionBlocks associated with the current prompt version using existing linkage.

