**Task: Scene / Quest Graph Templates in the Node Editor (Multi‑Phase)**

**Context**
- The node‑based scene editor uses `nodeTypeRegistry`, `GraphPanel`, and `InspectorPanel` to build branching scenes and quest logic.
- Designers often repeat similar patterns (quest intro, gated branch, success/fail flows).
- Today, they must wire each pattern manually, node by node.

Below are 10 incremental phases for introducing and maturing graph templates.

> **For agents:** As of now, these phases are largely unimplemented. When you complete or change a phase, tick the checklist and add a short note (file/PR/date).

### Phase Checklist

- [ ] **Phase 1 – Capture Selection as an In‑Memory Template**
- [ ] **Phase 2 – Template Palette & Insertion**
- [ ] **Phase 3 – Persistence & Basic Management**
- [ ] **Phase 4 – Per‑World Templates**
- [ ] **Phase 5 – Export / Import Templates as JSON**
- [ ] **Phase 6 – Template Library UX (Search, Tags, Favorites)**
- [ ] **Phase 7 – Template Wizards for Common Patterns**
- [ ] **Phase 8 – Template Validation & Compatibility**
- [ ] **Phase 9 – Cross‑World Template Packs**
- [ ] **Phase 10 – Template Usage Analytics & Refactoring Hints**

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
3. In the graph editor route, add a “Save Selection as Template” action:
   - Reads current selected nodes and connecting edges.
   - Prompts for name/description.
   - Saves a `GraphTemplate` into the store.

---

### Phase 2 – Template Palette & Insertion

**Goal**  
Provide a small UI palette to list templates and insert them into the current scene.

**Scope**
- Simple list/grid; no thumbnails needed for v1.
- Insertion clones nodes/edges with new IDs and a position offset.

**Key Steps**
1. Create `frontend/src/components/graph/GraphTemplatePalette.tsx`:
   - Shows templates from `templatesStore`.
   - For each template:
     - Display `name` + optional `description`.
     - “Insert” button.
2. Implement an `applyTemplate(template, scene)` helper that:
   - Clones each node with a new `id`.
   - Applies a position offset (e.g. +200px from viewport center).
   - Adds cloned nodes and edges via existing graph store actions.
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
   - Add “Rename” and “Delete” actions per template.
   - Confirm deletion to avoid accidental loss.
3. Confirm templates are still available after full reload.

---

### Phase 4 – Per‑World Templates

**Goal**  
Allow templates to be scoped to a world (e.g. quest patterns specific to that world) while still supporting global templates.

**Scope**
- Introduce optional `worldId` field on templates.
- Show combined view with scope labels.

**Key Steps**
1. Extend `GraphTemplate` with:
   ```ts
   worldId?: number;
   ```
2. Allow user to mark templates as:
   - Global, or
   - Specific to the current world (from world context).
3. In `GraphTemplatePalette`, filter/group templates by:
   - Current world, plus global templates.
   - Show badges like “Global” or “World #12”.

---

### Phase 5 – Export / Import Templates as JSON

**Goal**  
Make it easy to share templates between projects or machines via simple JSON files.

**Scope**
- Export/import individual templates; full library export can come later.

**Key Steps**
1. Add an “Export” action for each template:
   - Serializes the template to JSON.
   - Triggers a file download (e.g. `graph-template-${id}.json`).
2. Add an “Import Template” button:
   - Accepts a `.json` file.
   - Validates that it looks like a `GraphTemplate` (id/name/nodes/edges).
   - On ID collision, generate a new ID or prompt for rename.
3. Keep everything frontend‑only; no backend changes required.

---

### Phase 6 – Template Library UX (Search, Tags, Favorites)

**Goal**  
Make it easy for designers to find and manage templates once a basic template system exists.

**Scope**
- Build on top of the template store and palette from Phases 1–3.

**Key Steps**
1. Extend `GraphTemplate` with metadata such as tags, category, and favorite flag.
2. Add search and tag filters to `GraphTemplatePalette`.
3. Allow marking templates as favorites and show a quick‑access favorites section.

---

### Phase 7 – Template Wizards for Common Patterns

**Goal**  
Provide guided flows (wizards) that drop templates and pre‑fill key fields for common quest/scene patterns.

**Scope**
- Wizard UIs that wrap template insertion; no new scene semantics required.

**Key Steps**
1. Identify 3–5 common patterns (quest intro, branching gate, success/fail with fallback).
2. Create wizards that:
   - Ask for a few inputs (quest id, NPC role, target flags).
   - Insert one or more templates wired together.
3. Mount wizards in the scene editor as a “Patterns” or “Templates” tab.

---

### Phase 8 – Template Validation & Compatibility

**Goal**  
Help designers avoid inserting templates that don’t fit the current scene (e.g. missing required cast roles or flags).

**Scope**
- Static validation based on current scene metadata and template requirements.

**Key Steps**
1. Extend `GraphTemplate` with optional preconditions (required roles, arc ids, flags).
2. Before insertion, validate preconditions against the current `DraftScene` and show warnings if mismatched.
3. Optionally offer quick fixes (e.g. auto‑add missing roles) where safe.

---

### Phase 9 – Cross‑World Template Packs

**Goal**  
Support template packs tailored to specific worlds while still allowing reuse across projects.

**Scope**
- Build on per‑world templates and JSON export/import.

**Key Steps**
1. Group templates into named packs (e.g. “City Life Quest Pack”).
2. In the palette, allow filtering by pack and show pack metadata.
3. Provide export/import for entire packs to share between worlds/projects.

---

### Phase 10 – Template Usage Analytics & Refactoring Hints

**Goal**  
Show which templates are heavily used and where, helping identify opportunities to refactor or design new patterns.

**Scope**
- Dev‑only usage metrics; can be local or backend‑backed.

**Key Steps**
1. Record when templates are inserted into scenes (template id + scene id + world id).
2. Add a dev panel that shows usage counts and which worlds/scenes use each template.
3. Surface hints like “this template appears in many scenes; consider factoring into a reusable higher‑level pattern”.

