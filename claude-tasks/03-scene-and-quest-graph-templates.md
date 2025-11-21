**Task: Scene / Quest Graph Templates in the Node Editor (Multi‑Phase)**

**Context**
- The node‑based scene editor uses `nodeTypeRegistry`, `GraphPanel`, and `InspectorPanel` to build branching scenes and quest logic.
- Designers often repeat similar patterns (quest intro, gated branch, success/fail flows).
- Without templates, they must wire each pattern manually, node by node.

This task introduces reusable graph templates and a basic workflow for authoring, managing, and reusing them.

> **For agents:** When you complete or change a phase, tick the checklist and add a short note (file/PR/date). If you change the architecture in a major way, briefly document it here.

### Phase Checklist

- [x] **Phase 1 – Capture Selection as an In‑Memory Template**  
  *Implemented in `graphTemplates.ts`, `templatesStore.ts`, `GraphPanel.tsx` – 2025‑11‑19*
- [x] **Phase 2 – Template Palette & Insertion**  
  *Implemented in `GraphTemplatePalette.tsx` with `applyTemplate` – 2025‑11‑19*
- [x] **Phase 3 – Persistence & Basic Management**  
  *localStorage persistence + rename/delete in palette – 2025‑11‑19*
- [x] **Phase 4 – Per‑World Templates**  
  *World‑scoped templates in world metadata with source badges – 2025‑11‑19*
- [x] **Phase 5 – Export / Import Templates as JSON**  
  *Export/import with validation and ID collision handling – 2025‑11‑19*
- [x] **Phase 6 – Template Library UX (Search, Tags, Favorites)**  
  *Search, tags, category filters, and favorites – 2025‑11‑19*
- [x] **Phase 7 – Template Wizards for Common Patterns**  
  *5 built‑in wizards (Quest Intro, Dialogue Branch, Relationship Check, Flirt, Sequential Dialogue) with form‑based UI – 2025‑11‑19*
- [x] **Phase 8 – Template Validation & Compatibility**  
  *`validateTemplate`, preview, and precondition validation (roles, arcs, flags, node count) with UI warnings – 2025‑11‑19*
- [x] **Phase 9 – Cross‑World Template Packs**
  *`TemplatePack` interface, pack store, pack filtering UI, bulk pack export/import – 2025‑11‑19*
- [x] **Phase 10 – Template Usage Analytics & Refactoring Hints**
  *Analytics store, usage tracking, dev panel with insights and refactoring recommendations – 2025‑11‑19*

---

### Phase 1 – Capture Selection as an In‑Memory Template

**Goal**  
Allow designers to capture the currently selected nodes/edges as a named template, stored in memory (and later persisted).

**Key Pieces**
- `apps/main/src/lib/graph/templates.ts`: defines `GraphTemplate` shape.
- `apps/main/src/lib/graph/templatesStore.ts`: in‑memory store for templates.
- `GraphPanel`: “Save selection as template” action that:
  - Reads current selection (nodes + edges).
  - Prompts for name/description.
  - Saves a `GraphTemplate` into the store.

---

### Phase 2 – Template Palette & Insertion

**Goal**  
Provide a small UI palette to list templates and insert them into the current scene.

**Key Pieces**
- `apps/main/src/components/graph/GraphTemplatePalette.tsx`:
  - Lists templates from `templatesStore`.
  - Shows name, description, and an “Insert” button per template.
- `applyTemplate(template, scene)` helper:
  - Clones nodes with new IDs.
  - Applies a position offset from viewport center.
  - Adds cloned nodes and edges via existing graph store actions.

---

### Phase 3 – Persistence & Basic Management

**Goal**  
Ensure templates survive reloads and give designers basic management (rename/delete).

**Key Pieces**
- `templatesStore`:
  - Loads templates from `localStorage` on init.
  - Persists templates to `localStorage` on change.
- `GraphTemplatePalette`:
  - Rename and delete actions per template (with confirm on delete).

---

### Phase 4 – Per‑World Templates

**Goal**  
Allow templates to be scoped to a world while still supporting global templates.

**Key Pieces**
- `GraphTemplate` extended with `worldId?: number`.
- Palette shows:
  - Global templates.
  - Current‑world templates (based on world context).
  - Simple badges like “Global” / `World #12`.
- World‑scoped templates persisted via world metadata where appropriate.

---

### Phase 5 – Export / Import Templates as JSON

**Goal**  
Make it easy to share templates between projects or machines via JSON files.

**Key Pieces**
- Export action per template:
  - Serializes template to JSON.
  - Downloads e.g. `graph-template-${id}.json`.
- Import template:
  - Accepts `.json`.
  - Validates shape (id, name, nodes, edges).
  - Resolves ID collisions safely.

---

### Phase 6 – Template Library UX (Search, Tags, Favorites)

**Goal**  
Make it easy for designers to find and manage templates once the library grows.

**Key Pieces**
- `GraphTemplate` metadata: tags, category, favorite flag.
- Palette:
  - Text search.
  - Tag/category filters.
  - “Favorites” quick‑access section.

---

### Phase 7 – Template Wizards for Common Patterns

**Goal**  
Provide guided flows (wizards) that drop templates and pre‑fill key fields for common patterns.

**Key Pieces**
- Identified patterns: quest intro, branching gate, success/fail with fallback, etc.
- Wizards:
  - Ask for inputs (quest id, NPC role, target flags).
  - Insert one or more templates wired together.
- Exposed in the scene editor as a “Patterns” / “Templates” tab.

---

### Phase 8 – Template Validation & Compatibility

**Goal**  
Prevent inserting templates that don’t fit the current scene (e.g. missing required cast roles or flags).

**Key Pieces**
- `GraphTemplate` preconditions: required roles, arc IDs, flags.
- Before insertion:
  - Validate preconditions against the current `DraftScene`.
  - Show warnings in the UI if mismatched.
  - (Optional) Quick fixes for simple cases (e.g. auto‑add missing roles).

---

### Phase 9 – Cross‑World Template Packs

**Goal**  
Support template packs tailored to specific worlds while still allowing reuse across projects.

**Key Pieces**
- `TemplatePack` concept: named pack containing multiple templates.
- Palette:
  - Filter by pack.
  - Show pack metadata (world focus, theme).
- Export/import:
  - Whole packs as JSON for sharing between worlds/projects.

---

### Phase 10 – Template Usage Analytics & Refactoring Hints

**Goal**  
Show which templates are heavily used and where, helping identify opportunities to refactor or design new patterns.

**Scope (planned)**
- Dev‑only usage metrics; can be local or backend‑backed.

**Key Steps (not implemented yet)**
1. Record when templates are inserted into scenes (template id + scene id + world id).
2. Add a dev panel that shows usage counts and which worlds/scenes use each template.
3. Surface hints like “this template appears in many scenes; consider factoring into a higher‑level pattern”.

---

**IMPLEMENTATION STATUS NOTE** (2025‑11‑19)

As of this date:
- **All phases (1–10) have been fully implemented** and are working in the editor:
  - **Phase 10 implementation** includes:
    - `templateAnalyticsStore.ts`: Zustand store with localStorage persistence for usage tracking
    - `TemplateAnalyticsPanel.tsx`: Dev panel UI with overview, per-template stats, refactoring hints, and raw data views
    - `TemplateAnalyticsDev.tsx`: Route at `/template-analytics`
    - Template insertion tracking integrated into `GraphPanel.tsx`
    - Automatic refactoring hints based on usage patterns (high usage, world-specific, underutilized templates)
    - Metrics: usage counts, scene/world distribution, node insertion stats, temporal patterns

**Access the analytics panel at `/template-analytics` to view template usage insights and refactoring recommendations.**

