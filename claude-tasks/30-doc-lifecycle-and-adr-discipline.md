**Task: Documentation Lifecycle & ADR Discipline**

> **For Agents (How to use this file)**
> - This task defines how **architecture and design decisions** flow between:
>   - Canonical docs (e.g. `ARCHITECTURE.md`, `GAMEPLAY_SYSTEMS.md`, `docs/APP_MAP.md`)
>   - Episodic change logs (e.g. `docs/RECENT_CHANGES_YYYY_MM.md`)
>   - Long-lived task briefs (`claude-tasks/*.md`)
>   - Historical archives (`docs/archive/*`)
>   - Decision records (`docs/decisions/*`)
> - Use it as a **process guide** when you:
>   - Make a major architectural or gameplay design decision.
>   - Finish a multi-phase refactor or plugin capability.
>   - Notice divergence between task files and canonical docs.
> - Behavior and data shapes are still defined in:
>   - `ARCHITECTURE.md`, `GAMEPLAY_SYSTEMS.md`, `docs/APP_MAP.md`
>   - Backend/frontend service and component docs

---

## Context

Recent work has significantly improved documentation:

- `ARCHITECTURE.md` is now the canonical system overview.
- `DEVELOPMENT_GUIDE.md`, `docs/backend/SERVICES.md`, `docs/frontend/COMPONENTS.md` centralize backend/frontend details.
- `docs/APP_MAP.md` gives a current app map.
- `DOCUMENTATION_CHANGELOG.md` and `docs/archive/*` clarified historical vs current docs.

At the same time:

- `docs/RECENT_CHANGES_YYYY_MM.md` files capture important architecture-impacting changes (e.g. backend route plugin fixes, WebSocket/logs work) before they are fully reflected in canonical docs.
- `claude-tasks/*.md` encode long-lived architectural roadmaps (ECS, plugins, behavior, scheduler).

Without a clear **doc lifecycle**, there is a risk of:

- Temporal docs (`RECENT_CHANGES`, task progress logs) becoming de facto specs.
- Canonical docs drifting behind implementation and task files.
- Future work duplicating or contradicting existing decisions.

This task establishes a simple, explicit **documentation lifecycle and ADR (Architecture Decision Record) discipline**.

---

## Phase Checklist

- [ ] **Phase 30.1 – Define Documentation Taxonomy & Lifecycle**
- [ ] **Phase 30.2 – Introduce ADR Template & `docs/decisions/`**
- [ ] **Phase 30.3 – Wire Lifecycle Rules into PR / Agent Workflows**
- [ ] **Phase 30.4 – Light-weight Automation & Cleanup**

---

## Phase 30.1 – Define Documentation Taxonomy & Lifecycle

**Goal**  
Clarify which docs are canonical, which are episodic, which are archival, and how information should flow between them.

**Key Steps**

1. Define doc categories:
   - **Canonical:** `ARCHITECTURE.md`, `GAMEPLAY_SYSTEMS.md`, `docs/APP_MAP.md`, `DEVELOPMENT_GUIDE.md`, key system docs.
   - **Episodic / Staging:** `docs/RECENT_CHANGES_YYYY_MM.md`, task progress logs like `10-unified-generation-pipeline-progress.md`.
   - **Tasks / Roadmaps:** `claude-tasks/*.md`.
   - **Decisions:** `docs/decisions/*.md` (to be created in Phase 30.2).
   - **Archive:** `docs/archive/*` and old status docs.
2. Add a short “Doc Types & Lifecycle” section to:
   - `DOCUMENTATION_CHANGELOG.md` (high-level overview).
   - `AI_README.md` or `DEVELOPMENT_GUIDE.md` (for contributors/agents).
3. At the top of `docs/RECENT_CHANGES_2025_01.md`, add a note:
   - “This file is a staging log; once changes settle, they must be reflected in canonical docs listed above.”

**Status:** `[ ]` Not started

---

## Phase 30.2 – Introduce ADR Template & `docs/decisions/`

**Goal**  
Create a light-weight mechanism for capturing important design decisions without bloating core docs.

**Key Steps**

1. Add `docs/decisions/README.md` describing:
   - What warrants an ADR (e.g. plugin capability model change, new game-session convention, deprecation of a major API).
   - How to name ADR files (e.g. `YYYYMMDD-brief-title.md`).
2. Add a small ADR template (`docs/decisions/TEMPLATE.md`) with sections:
   - Context
   - Decision
   - Consequences
   - Related Code/Docs
3. Create 1–2 seed ADRs for recent major decisions, for example:
   - Adoption of the backend plugin auto-discovery system.
   - GameSession flags/relationships conventions for gameplay systems.

**Status:** `[ ]` Not started

---

## Phase 30.3 – Wire Lifecycle Rules into PR / Agent Workflows

**Goal**  
Ensure future changes keep canonical docs and decision records in sync with code and task files.

**Key Steps**

1. Update the PR template (or `DEVELOPMENT_GUIDE.md` “Contributing” section) with prompts:
   - “Did you change an extension point? If yes, update `EXTENSION_ARCHITECTURE.md` / relevant plugin docs.”
   - “Did you change game session structure or gameplay conventions? If yes, update `GAMEPLAY_SYSTEMS.md`.”
   - “Does this change warrant an ADR in `docs/decisions/`?”
2. Add a short “When you update `claude-tasks/*.md`” section to `claude-tasks/README.md`:
   - Remind agents to sync canonical docs and ADRs for major decisions.
   - Clarify that tasks are roadmaps/status, not primary specs.
3. Add a 2–3 line header snippet that can be reused at the top of `RECENT_CHANGES_YYYY_MM.md` files explaining their staging nature and where to look for canonical information.

**Status:** `[ ]` Not started

---

## Phase 30.4 – Light-weight Automation & Cleanup

**Goal**  
Add small affordances that make it harder for docs to drift over time.

**Key Steps**

1. (Optional) Add a simple script (e.g. `scripts/check_docs_lifecycle.py`) that:
   - Warns if new backend routes under `pixsim7_backend/routes/*` have no manifest.
   - Logs when new `docs/RECENT_CHANGES_*` files exist without a corresponding entry in `DOCUMENTATION_CHANGELOG.md`.
2. Move clearly historical “result dump” docs into `docs/archive/` when:
   - Their content has been summarized into canonical docs, and
   - They are only needed as historical evidence (e.g. architecture validation result dumps).
3. Record the use of this lifecycle in a short ADR once the process stabilizes.

**Status:** `[ ]` Not started

