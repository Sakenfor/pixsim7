# ADR: <Short Title>

- **Date:** YYYY‑MM‑DD
- **Status:** Proposed | Accepted | Superseded
- **Authors:** <names/handles>

---

## Context

Describe the background and forces at play:

- What problem are we solving?
- What constraints or prior decisions affect this?
- What alternatives were considered?

Keep this section concise but specific enough that future readers understand why this was non‑trivial.

---

## Decision

Clearly state the decision that was made. Focus on:

- What we are doing.
- What we are explicitly **not** doing.
- Any key invariants or contracts this decision establishes.

If the decision affects extension points (plugins, registries, JSON conventions), call out:

- Which extension surfaces are involved.
- How new work is expected to plug in.

---

## Consequences

Describe the impact of this decision:

- **Positive:** Benefits, simplifications, new capabilities.
- **Negative / Trade‑offs:** Complexity, limitations, migration costs.
- **Risks:** What might go wrong and how we plan to handle it.

Include notes on:

- Migration strategy (if applicable).
- How this interacts with existing tasks / roadmaps (`claude-tasks/*.md`).

---

## Related Code / Docs

List key references:

- Code:
  - `path/to/file.py`
  - `path/to/module.ts`
- Docs:
  - `ARCHITECTURE.md`
  - `GAMEPLAY_SYSTEMS.md`
  - `docs/APP_MAP.md`
  - Other relevant docs or ADRs

