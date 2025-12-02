**Task: Behavior Metrics & Stat Definitions Alignment (World-Aware Conditions)**

> **For Agents (How to use this file)**
> - This task focuses on aligning **behavior system metrics** with the abstract stat system and stat packages.
> - Goal: avoid reintroducing hard-coded relationship assumptions (like direct `"affinity"` metrics) in behavior conditions.
> - Keep this independent from Task 107 (relationship storage) and Task 109 (intimacy gating); this is specifically about **behavior conditions & metrics**.

---

## Context & Motivation

The behavior system (docs and JSON examples) uses metrics like `"affinity"` directly in conditions, e.g.:

- `docs/behavior_system/README.md`
- `docs/behavior_system/example_visual_novel.json`
- `docs/behavior_system/example_2d_life_sim.json`

Patterns include:

- Conditions such as `{ "type": "relationship_gt", "npcIdOrRole": "npc:5", "metric": "affinity", "threshold": 50 }`.

This is conceptually fine but subtly couples behavior conditions to **specific relationship axes** that only exist when the relationship system is present. Now that we have:

- A generic stat system (`StatDefinition` / `StatEngine` / `WorldStatsConfig`).
- A stat package concept (`stat/package_registry.py` + `relationships_package.py`).

We should make behavior conditions **explicitly reference stat definitions and axes where appropriate**, so that:

- Worlds can plug in different stat packages or rename axes without rewriting behavior code.
- Conditions know **which stat definition** they are talking about (e.g., `"relationships"` vs `"mood"` vs `"stealth"`).

---

## Goals

- Introduce a clear way for behavior conditions to reference stat-based metrics:
  - E.g., `{ "type": "stat_axis_gt", "statDefinition": "relationships", "axis": "affinity", "threshold": 50 }`.
- Keep existing behavior examples working by providing defaults/mappings for legacy fields:
  - E.g., `relationship_gt` can internally map to `stat_axis_gt` on `"relationships"`.
- Avoid changing runtime behavior for worlds that use the default relationship package.
- Do not change the abstract stat engine itself; only how behavior interprets conditions.

Out of scope:

- Full overhaul of the behavior system or adding a new DSL; this is about conditions/metrics mapping.

---

## Phase Checklist

- [ ] **Phase 1 – Audit Behavior Metrics & Relationship-Tied Conditions**
- [ ] **Phase 2 – Design Stat-Aware Behavior Metric Schema**
- [ ] **Phase 3 – Implement Stat-Aware Condition Evaluators**
- [ ] **Phase 4 – Migrate Behavior Examples & Docs to New Schema**
- [ ] **Phase 5 – Validate Backwards Behavior & Document Patterns**

---

## Phase 1 – Audit Behavior Metrics & Relationship-Tied Conditions

**Goal:** Identify where behavior conditions depend on relationship-specific metrics or assume particular axes like `affinity`.

**Steps:**

- Search and list all behavior condition types that reference:
  - `affinity`, `trust`, `chemistry`, `tension` directly.
  - Other numeric metrics that clearly map to axes in potential stat packages (e.g., `suspicion`, `arousal`).
- Likely files:
  - `docs/behavior_system/README.md`
  - `docs/behavior_system/example_visual_novel.json`
  - `docs/behavior_system/example_2d_life_sim.json`
  - Any backend evaluators (if present) that implement these conditions.
- Record findings in this task file (condition type + file) to drive later refactor.

---

## Phase 2 – Design Stat-Aware Behavior Metric Schema

**Goal:** Define how behavior conditions should reference stats in a way that’s consistent with stat packages and world config.

**Design considerations:**

- A generic stat-based condition structure could look like:

  ```json
  {
    "type": "stat_axis_gt",
    "statDefinition": "relationships",
    "axis": "affinity",
    "threshold": 50
  }
  ```

- For convenience, specialized relationship-aware conditions can be thin wrappers:

  ```json
  {
    "type": "relationship_gt",
    "axis": "affinity",
    "threshold": 50
  }
  ```

  where `relationship_gt` is defined as:

  - `statDefinition = "relationships"`
  - `axis = axis` (default `"affinity"` if omitted)

**Deliverables:**

- A small schema definition (in docs or code comments) describing:
  - Generic stat-based condition shape.
  - Optional synthetic condition types (like `relationship_gt`) and how they map to stat-based ones.
  - How this integrates with the behavior registry / condition evaluators.

---

## Phase 3 – Implement Stat-Aware Condition Evaluators

**Goal:** Implement or extend backend behavior condition evaluators to understand the new stat-aware schema.

**Steps:**

- Identify where behavior conditions are evaluated (likely in:
  - `pixsim7/backend/main/infrastructure/plugins/behavior_registry.py`
  - Or related behavior services).
- Add evaluators for the new stat-based condition types, e.g.:
  - `stat_axis_gt` / `stat_axis_lt` / `stat_axis_between`, using:
    - `GameSession.stats` (for session-owned stats), or
    - Entity stats (`GameNPC.stats`, `NPCState.stats`) via `NPCStatService`, depending on use case.
- Implement mapping from legacy relationship-specific conditions to stat-based ones, without changing behavior:
  - `relationship_gt` → `stat_axis_gt` with `statDefinition="relationships"`.
  - Keep old condition types supported for now, but mark them as internally delegated.

**Constraints:**

- Do not introduce new DB columns or non-JSON fields; use existing stat storage.

---

## Phase 4 – Migrate Behavior Examples & Docs to New Schema

**Goal:** Update behavior system documentation and JSON examples to prefer the stat-aware schema.

**Steps:**

- Update example behavior JSON files to use `statDefinition` + `axis` where appropriate:
  - `docs/behavior_system/example_visual_novel.json`
  - `docs/behavior_system/example_2d_life_sim.json`
- In `docs/behavior_system/README.md`:
  - Add a section “Stat-based metrics in behavior conditions”.
  - Show both generic (`stat_axis_gt`) and convenience (`relationship_gt`) forms.
  - Clarify that relationship-sensitive behavior should target the `"relationships"` stat definition.

**Notes:**

- Keep legacy examples around if they illustrate older APIs, but clearly mark them as legacy and show the preferred stat-aware version alongside.

---

## Phase 5 – Validate Backwards Behavior & Document Patterns

**Goal:** Ensure that worlds using the default relationships behave exactly as before, and that developers understand how to use stat-based behavior metrics.

**Steps:**

- Add or update tests for condition evaluators:
  - Verify that `relationship_gt` and `stat_axis_gt { statDefinition: 'relationships', axis: 'affinity' }` produce identical results on the same session/NPC state.
  - Cover edge cases (threshold equality, missing axes, clamping behavior if applicable).
- Document new patterns:
  - In behavior docs, recommend that any numeric “metric” that corresponds to a stat axis be represented as a stat-based condition where possible.
  - Note that this makes it easier to plug in different stat packages or world-specific relationship models later.

---

## Notes

- This task complements Task 107 (relationship stats cutover) and Task 109 (intimacy gating). Together, they move:
  - Storage/normalization → `stats["relationships"]` (Task 107).
  - Intimacy/content gating thresholds → stat-aware config (Task 109).
  - Behavior conditions → stat-aware metrics (this task).
- When implementing, keep the behavior evaluators and schemas generic enough to support non-relationship stat packages (e.g., `"mood"`, `"stealth"`, `"combat"`) without extra refactors.

