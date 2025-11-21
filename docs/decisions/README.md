# Architecture Decision Records (ADRs)

This folder contains **Architecture Decision Records** for PixSim7.

ADRs capture **important, long‑lived decisions** that shape the system, in a format that is:

- Short and focused (1–2 pages).
- Linked to code and primary docs.
- Stable over time, even as implementation details change.

ADRs are **not**:

- Full design documents.
- Task/roadmap files.
- Status reports.

They answer: “Given the context at the time, why did we choose this direction, and what trade‑offs did we accept?”

---

## When to create an ADR

Create an ADR when you:

- Introduce or significantly change an extension surface (e.g. plugin capability model, new registry).
- Change core game/session conventions (e.g. how `GameSession.flags`/`relationships` are structured).
- Make a major architectural choice (e.g. new provider architecture, scheduler model, narrative runtime semantics).
- Deprecate a major API or subsystem that others might still be using.

Small refactors, bug fixes, and UI tweaks generally do **not** need ADRs.

---

## Naming and structure

- File naming convention: `YYYYMMDD-short-title.md`, e.g.:
  - `20251121-backend-plugin-auto-discovery.md`
  - `20251121-game-session-json-conventions.md`
- Each ADR should follow the template in `TEMPLATE.md`:
  - Context
  - Decision
  - Consequences
  - Related Code/Docs

ADRs live alongside, and **do not replace**:

- `ARCHITECTURE.md`, `GAMEPLAY_SYSTEMS.md`, `docs/APP_MAP.md` (canonical overviews).
- System‑specific docs under `docs/backend/`, `docs/frontend/`, etc.
- Task/roadmap files in `claude-tasks/`.

