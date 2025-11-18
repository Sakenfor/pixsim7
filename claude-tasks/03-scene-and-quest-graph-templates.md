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

---

## Phase 2: Parameterized Templates & Template Libraries

Once basic graph templates exist, the next step is to make them more powerful and easier to reuse across worlds and projects.

**Phase 2 Goals**
- Add **parameters** to templates so they can be customized on insertion (e.g. NPC roles, flags, quest IDs).
- Organize templates into **libraries** with categories and tags.
- Provide a clearer way to **share/export/import** templates between worlds or projects.

**Key Ideas**
- Extend `GraphTemplate` with optional parameters:
  ```ts
  interface TemplateParameter {
    id: string;               // 'npcRole', 'questId'
    label: string;            // 'NPC Role', 'Quest ID'
    type: 'string' | 'number' | 'boolean' | 'enum';
    options?: string[];       // for enum
    defaultValue?: any;
  }

  interface GraphTemplate {
    // existing fields...
    parameters?: TemplateParameter[];
  }
  ```
- When applying a template, prompt the user for parameter values and substitute them into node metadata/fields (e.g. `meta.role`, `questId`, flag names) using a simple placeholder syntax (e.g. `{{npcRole}}`, `{{questId}}`).
- Categorize templates (e.g. `quest`, `romance`, `combat`, `utility`) and allow filtering in the palette.

**Phase 2 Implementation Outline**
1. **Parameterized Templates**
   - Define placeholder rules:
     - For example, use `{{paramId}}` in strings inside `DraftSceneNode` metadata or config fields.
   - Update `captureTemplate` to optionally detect common patterns and suggest parameters (manual editing via a small form is fine).
   - Update `applyTemplate` so it:
     - If parameters exist, shows a small form asking for values.
     - Replaces all `{{paramId}}` placeholders in node metadata before inserting nodes into the scene.

2. **Template Library Metadata**
   - Extend `GraphTemplate` with:
     - `category?: string;`
     - `tags?: string[];`
   - Update the templates store to support simple querying by category/tags.
   - Enhance `GraphTemplatePalette` UI:
     - Add filters for category and search by name/description/tags.

3. **Template Export/Import**
   - Add simple export/import actions in the template palette:
     - Export: download a single template as JSON (`graph-template-${id}.json`).
     - Import: upload a JSON file and add it to the local templates store.
   - Validate on import:
     - Ensure required fields exist (id, name, data).
     - If ID collides, generate a new ID or prompt to overwrite.

4. **Per-World Library Integration (Optional)**
   - Add support to store templates in `GameWorld.meta.graphTemplates` for templates that are specific to a given world.
   - When loading templates, show a combined view:
     - Global templates + world-specific templates, with a badge indicating origin.
