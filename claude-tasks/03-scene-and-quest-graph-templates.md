**Task: Scene / Quest Graph Templates in the Node Editor**

**Context**
- The node-based scene editor uses `nodeTypeRegistry`, `GraphPanel`, and `InspectorPanel` to build complex graphs.
- Complex patterns (e.g., “quest intro with branching outcomes”, “flirt → success/fail → follow-up scene”) are often repeated.
- Currently designers must wire each pattern manually node-by-node.

**Goal**
Introduce **Graph Templates** so designers can:
- Save a selection of nodes + edges as a reusable template.
- Instantiate templates into new scenes/graphs with one action.
- Keep templates purely data-driven (no hardcoded patterns in code).

**Key Ideas**
- Define a template as:
  ```ts
  interface GraphTemplate {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    nodeTypes: string[]; // involved node types
    data: {
      nodes: DraftSceneNode[];
      edges: DraftEdge[];
    };
  }
  ```
- Templates can live in:
  - A JSON file (e.g. `frontend/src/data/graphTemplates.json`) for built-ins.
  - Or per-world, stored in meta (`GameWorld.meta.graphTemplates`).

**Implementation Outline**
1. **Template Data Model**
   - Add `GraphTemplate` type to `frontend/src/modules/scene-builder` or a new `graphTemplates.ts` module.
   - Implement helpers:
     - `captureTemplate(selection: { nodes: DraftSceneNode[]; edges: DraftEdge[] }): GraphTemplate`
     - `applyTemplate(template, targetScene): void` (clones nodes/edges with new IDs and positions).

2. **Template Storage**
   - For a first pass, use a simple local JSON or in-memory store:
     - `frontend/src/lib/graph/templatesStore.ts` with:
       - `getTemplates()`, `addTemplate()`, `removeTemplate()`.
       - Persist to `localStorage` or a small JSON file if appropriate.
   - Later, this can be moved to per-world meta or backend, but keep it frontend-only now.

3. **Editor UI for Saving Templates**
   - In the graph editor UI (GraphRoute), add:
     - A “Save as Template” button when nodes are selected.
   - When clicked:
     - Gather selected nodes + edges.
     - Prompt for `name` and optional `description`.
     - Store as a `GraphTemplate` via the templates store.

4. **Template Palette for Instantiation**
   - New component: `frontend/src/components/graph/GraphTemplatePalette.tsx`.
   - Show:
     - List of saved templates with name/description.
     - “Insert” action:
       - Applies template to current scene at a default offset/location (e.g., near the viewport center).
   - Integrate this panel into the graph UI (sidebar, floating panel, or a tab near `NodePalette`).

5. **Safety: Node Types & Validation**
   - When applying a template, verify that all involved node types exist in `nodeTypeRegistry`.
   - If a template references unknown types, show a warning and skip those nodes.

**Constraints**
- No backend changes; templates are frontend-only for now.
- Do not add new node types; reuse existing ones.
- Keep the API generic enough that templates can later be persisted per-world or in a backend service.

**Success Criteria**
- Designers can select a pattern in the graph, save it as a template, and later insert that pattern into another scene with a single action.
- Templates apply cleanly, with new IDs and reasonable default positions.

