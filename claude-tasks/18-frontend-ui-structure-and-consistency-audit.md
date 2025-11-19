**Task: Frontend UI Structure & Consistency Audit (Agent‑Centric)**

> **For Agents (How to use this file)**
> - This is a **checklist-oriented task** for auditing and keeping the frontend UI structure coherent over time.
> - Use it when you:
>   - Add new UI sections/routes.
>   - Refactor or move components between folders.
>   - Suspect duplication or drift between `frontend/`, `packages/ui/`, and `packages/game-ui/`.
> - Read these first for context:
>   - `UI_CONSOLIDATION_COMPLETED.md` – previous consolidation work and decisions  
>   - `frontend/src/components/README.md` – component organization and conventions  
>   - `packages/ui/README.md` – shared UI components  
>   - `packages/game-ui/README.md` (if present) – game‑specific UI surfaces.
> - This task is **not** about adding new features; it’s about verifying that UI pieces live in the right place, follow conventions, and don’t re‑invent existing patterns.

---

## Context

The UI has grown to cover:

- Core app shell (home/workspace/assets/graph).
- Game/editor surfaces (scene graph, behavior editor, interaction tools).
- Shared UI library (`@pixsim7/ui`) and game‑focused UI (`@pixsim7/game-ui`).

You have already done one large consolidation pass:

- Centralized Toasts and ExecutionList into shared components (see `UI_CONSOLIDATION_COMPLETED.md`).
- Verified some “unused” components were in fact used.

But as new features land (NPC behavior tools, generations UI, plugin/workspace panels), there’s a risk of:

- Components drifting into ad‑hoc folders.
- Duplicate patterns emerging (e.g. multiple list/panel implementations).
- Mixed responsibilities (feature logic baked into generic UI, or vice versa).

**Goal:** Provide an **agent‑centric audit task** that:

- Gives a repeatable checklist for “is the UI still organized?”  
- Helps agents decide where new UI should live.  
- Surfaces obvious duplicates or inconsistencies early, without forcing over‑abstraction.

---

## Phase Checklist

- [ ] **Phase 18.1 – Component & Route Inventory (High‑Level Map)**
- [ ] **Phase 18.2 – Folder & Naming Consistency Check**
- [ ] **Phase 18.3 – Shared vs Feature UI Boundaries (packages/ui, game-ui, frontend)**
- [ ] **Phase 18.4 – Pattern Duplication & Consolidation Opportunities**
- [ ] **Phase 18.5 – Agent‑Facing Conventions & Checklists**
- [ ] **Phase 18.6 – Documentation & App Map Updates**

Each phase is designed to be run by an agent as a **short audit**; you can do 18.1–18.3 in one pass, then 18.4 if you see drift.

---

## Phase 18.1 – Component & Route Inventory (High‑Level Map)

**Goal**  
Ensure there’s a **current, concise map** of major UI surfaces and where their components live.

**Scope**

- `frontend/src/routes/*`
- Top‑level directories under `frontend/src/components/*`
- Shared libraries: `packages/ui`, `packages/game-ui`.

**Agent Checklist**

1. **List routes**:
   - From `frontend/src/routes`, enumerate the key app pages (Home, Workspace, Assets, Graph, Game2D, NpcBrainLab, SimulationPlayground, PluginWorkspace, etc.).
2. **Map routes to component clusters**:
   - For each major route, note which component directories are primarily used (e.g. `Game2D` → `components/game`, `components/hotspots`, `packages/game-ui`).
3. **Update/validate component README**:
   - Ensure `frontend/src/components/README.md` has a short section that:
     - Lists the main component subfolders.
     - Mentions which routes use them.
4. **Result**:
   - A short, up‑to‑date bullet list at the bottom of this file or in the components README, e.g.:
     - `Home` → `components/navigation`, `components/layout`.
     - `Graph` → `components/graph`, `components/inspector`.
     - `Game2D` → `components/game`, `components/hotspots`, `packages/game-ui`.

**Status:** ☐ Not started

---

## Phase 18.2 – Folder & Naming Consistency Check

**Goal**  
Check that components live in **sensible, predictable folders** and follow naming conventions.

**Scope**

- `frontend/src/components/*` (top‑level and key subfolders).
- `frontend/src/routes/*` (to ensure route names align with component clusters).

**Agent Checklist**

1. **Scan component subfolders**:
   - `control`, `graph`, `inspector`, `game`, `simulation`, `plugins`, `navigation`, `layout`, etc.
   - Verify that:
     - “Control center” UI lives in `control/`.
     - Graph‑related components live in `graph/` or `inspector/`.
     - Plugin UIs live under `plugins/`.
2. **Check naming consistency**:
   - Components that behave like XPanel are suffixed `*Panel.tsx` (GraphPanel, PluginCatalogPanel).
   - Editors are `*Editor.tsx` (NpcPreferencesEditor, SceneMetadataEditor).
   - Lists and views follow existing patterns (e.g. `*List.tsx`, `*Detail.tsx`).
3. **Flag anomalies**:
   - Components that clearly belong in a different folder (e.g. a plugin-specific panel sitting in `common/`).
   - New components that don’t follow suffix patterns.
4. **Document findings**:
   - Add a brief “UI Folder Notes” section to `frontend/src/components/README.md` or this doc, with bullets like:
     - “`Game2DStatusBar.tsx` currently lives in `components/common`; move to `components/game` on next pass.”

**Status:** ☐ Not started

---

## Phase 18.3 – Shared vs Feature UI Boundaries

**Goal**  
Ensure that **truly generic UI** lives in `@pixsim7/ui` / `@pixsim7/game-ui`, and that feature‑specific logic stays in `frontend/`.

**Scope**

- `packages/ui/*`
- `packages/game-ui/*`
- Shared imports inside `frontend/src/components/*`.

**Agent Checklist**

1. **Scan `packages/ui` exports**:
   - Confirm they are generic (Buttons, Toasts, Tabs, StatusBadges, PromptInput, etc.).
   - Ensure no domain logic (no hardcoded “Graph” or “Game2D” concepts).
2. **Scan `packages/game-ui`** (if present):
   - Confirm it holds reusable game‑specific UI (scene player, HUD elements) but not world‑specific logic.
3. **Check frontend for duplication**:
   - Search for implementations of buttons/toasts/badges/etc. in `frontend/src/components/common` that should be using `@pixsim7/ui`.
   - If found, add to a small “Consolidation TODO” list at the bottom of this doc or in `UI_CONSOLIDATION_COMPLETED.md`.
4. **Ensure new components pick the right home**:
   - When adding new generic components, prefer `packages/ui` and import from there in frontend.

**Status:** ☐ Not started

---

## Phase 18.4 – Pattern Duplication & Consolidation Opportunities

**Goal**  
Identify **real** duplication (beyond what was already cleaned up) and decide whether to consolidate or leave as is.

**Scope**

- List‑like components (ExecutionList, DeviceList, LoopList, PresetList, etc.).
- Panel‑style components (various `*Panel.tsx`).
- Status/indicator widgets (Job/Generation status, plugin health indicators, etc.).

**Agent Checklist**

1. **Search for obvious duplicates**:
   - Components with similar names or structure across different folders.
2. **Compare behavior and props**:
   - If two lists/panels share **70%+** structure and differ only in data, consider extracting a shared presentational component or hook.
   - If they differ significantly (as noted in `UI_CONSOLIDATION_COMPLETED.md` for lists/panels), document that and leave them separate.
3. **Record decisions**:
   - Maintain a table in this doc, e.g.:

     | Pattern | Files | Decision | Notes |
     |--------|-------|----------|-------|
     | Status chips | `GenerationStatusDisplay`, `PluginHealthBadge` | Leave separate | Different data + semantics |
     | List pattern | `ExecutionList`, `PresetList` | Maybe later | Similar, but models differ |

4. **Only consolidate when it helps**:
   - Avoid premature abstraction; follow the same caution as in `UI_CONSOLIDATION_COMPLETED.md`.

**Status:** ☐ Not started

---

## Phase 18.5 – Agent‑Facing Conventions & Checklists

**Goal**  
Codify **simple rules** agents should follow when adding/modifying UI to keep things tidy.

**Scope**

- Brief conventions referenced by other tasks and AGENTS docs.

**Agent Checklist (to document and then follow)**

Add a short “Agent UI Checklist” section either here or in `frontend/src/components/README.md`:

- When adding a **new screen**:
  - Put the route under `frontend/src/routes`.
  - Create a dedicated folder under `components` *if* the route has 2+ significant components (e.g. `components/game`, `components/simulation`).
  - Don’t put heavy logic in the route file; delegate to components.
- When adding a **new reusable UI element**:
  - Check `@pixsim7/ui` first; add there if generic and then import into frontend.
  - If game‑specific but reusable across worlds, consider `@pixsim7/game-ui`.
- When adding a **status/indicator widget**:
  - Prefer a `*Status` or `*Badge` naming convention.
  - Co‑locate with the feature area (`generations`, `plugins`, `game`) rather than `common` unless truly generic.
- Before writing a **new list/panel**:
  - Look for existing patterns (`ExecutionList`, `PresetList`, `*Panel.tsx`).
  - Align naming and basic structure with the closest existing pattern.

**Status:** ☐ Not started

---

## Phase 18.6 – Documentation & App Map Updates

**Goal**  
Keep docs in sync so humans and agents can quickly see how the UI is organized.

**Scope**

- `UI_CONSOLIDATION_COMPLETED.md`
- `frontend/src/components/README.md`
- `docs/APP_MAP.md` (if it covers UI flows).

**Agent Checklist**

1. After completing an audit pass (18.1–18.4):
   - Update `frontend/src/components/README.md` with any new component categories or notable changes.
   - If you add/remove major UI surfaces, update `docs/APP_MAP.md` to reflect new routes/panels.
2. If you do real consolidation work:
   - Append a short “Delta” section to `UI_CONSOLIDATION_COMPLETED.md` or create a `UI_CONSOLIDATION_2025-XX-YY.md` follow‑up to avoid losing historical context.
3. Mark phases as completed here with a date and a short note, e.g.:
   - `[x] Phase 18.1 – Completed 2025‑11‑21 (see components/README.md for current map)`

**Status:** ☐ Not started

---

## Success Criteria

When this task is run periodically (e.g. every few feature branches), you should have:

- A current, concise map of:
  - Routes → component clusters.
  - Shared vs feature UI boundaries.
- Clear agent conventions for:
  - Where to put new UI code.
  - How to name panels/lists/editors.
  - When to use `@pixsim7/ui` vs local components.
- Identified, documented points of duplication:
  - Some deliberately left as‑is (with reasoning).
  - Some marked as future consolidation candidates.
- No major surprises like:
  - New toast/list/button implementations in random folders.
  - Feature‑specific UIs leaking into `@pixsim7/ui`.

