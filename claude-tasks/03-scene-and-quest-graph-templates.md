**Task: Scene / Quest Graph Templates in the Node Editor (Multi‑Phase)**

**Context**
- The node-based scene editor uses `nodeTypeRegistry`, `GraphPanel`, and `InspectorPanel` to build branching scenes and quest logic.
- Designers often repeat similar patterns (quest intro, gated branch, success/fail flows).
- Today, they must wire each pattern manually node-by-node.

Below are 5 incremental phases for introducing graph templates.

---

### Phase 1 – Capture Selection as an In‑Memory Template

**Goal**
Allow designers to capture the currently selected nodes/edges as a named template, stored in memory or localStorage.

**Scope**
- No UI palette yet; focus on capturing and storing template data.

**Key Steps**
1. Define a template type in a new module, e.g. `frontend/src/lib/graph/templates.ts`:
   ```ts
   import type { DraftSceneNode, DraftEdge } from '../../modules/scene-builder';

   export interface GraphTemplate {
     id: string;
     name: string;
     description?: string;
     createdAt: number;
     nodeTypes: string[];
     nodes: DraftSceneNode[];
     edges: DraftEdge[];
   }
   ```
2. Add a simple store (`templatesStore.ts`) that:
   - Keeps an array of `GraphTemplate` in memory.
   - Optionally persists them to localStorage.
3. In the graph editor route, add a basic “Save Selection as Template” action:
   - Reads current selected nodes and the edges between them.
   - Prompts for a name/description.
   - Saves a `GraphTemplate` into the store.

---

### Phase 2 – Template Palette & Insertion

**Goal**
Provide a small UI palette to list templates and insert them into the current scene.

**Scope**
- Simple list/grid; no thumbnails needed.
- Insertion clones nodes/edges with new IDs and a basic position offset.

**Key Steps**
1. Create `frontend/src/components/graph/GraphTemplatePalette.tsx`:
   - Shows templates from `templatesStore`.
   - For each template:
     - Display `name` + optional `description`.
     - “Insert” button.
2. Implement an `applyTemplate(template, scene)` helper that:
   - Clones each node with a new `id`.
   - Applies a position offset (e.g. +200px x/y from current viewport center).
   - Adds cloned nodes and edges to the current draft scene via existing graph store actions.
3. Mount `GraphTemplatePalette` in the graph UI (sidebar tab or floating panel).

---

### Phase 3 – Persistence & Basic Management

**Goal**
Ensure templates survive page reloads and give designers basic management (rename/delete).

**Scope**
- Persist templates to localStorage.
- Add simple rename/delete controls.

**Key Steps**
1. Extend `templatesStore` to:
   - Load templates from localStorage on init.
   - Save templates to localStorage whenever they change.
2. In `GraphTemplatePalette`:
   - Add small “Rename” and “Delete” actions per template.
   - Confirm deletion to avoid accidental loss.
3. Confirm that templates are still available after a full reload.

---

### Phase 4 – Per‑World Templates (Optional)

**Goal**
Allow templates to be scoped to a world (e.g. quest patterns specific to that world) while still supporting global templates.

**Scope**
- Introduce an optional `worldId` field on templates.
- Show a combined view with scope labels.

**Key Steps**
1. Extend `GraphTemplate` with:
   ```ts
   worldId?: number;
   ```
2. Let the user choose whether a template is:
   - Global, or
   - Specific to the currently selected world (from world context store).
3. In `GraphTemplatePalette`, filter/group templates by:
   - Current world, plus global templates.
   - Show a small badge like “Global” or “World #12”.

---

### Phase 5 – Export / Import Templates as JSON

**Goal**
Make it easy to share templates between projects or machines via simple JSON files.

**Scope**
- Export/import individual templates; full library export can come later.

**Key Steps**
1. Add “Export” action for each template:
   - Serializes the template to JSON.
   - Triggers a file download named like `graph-template-${id}.json`.
2. Add an “Import Template” button:
   - Accepts a `.json` file.
   - Validates that it looks like a `GraphTemplate` (id/name/nodes/edges).
   - If ID collides, either generate a new ID or prompt the user to rename.
3. Keep everything frontend‑only; no backend changes are required.

