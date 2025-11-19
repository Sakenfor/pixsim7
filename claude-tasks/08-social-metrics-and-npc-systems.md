**Task: Social Metrics & NPC Systems Built on Preview API (Multi‑Phase)**

**Context**
- Task 07 introduces a **relationship preview API** and a generic **metric** abstraction:
  - Backend: `game_relationship_preview` endpoints and metric evaluators.
  - Game-core: `previewRelationshipTier`, `previewIntimacyLevel`, and (eventually) a generic metric preview helper.
- Backend remains the **only authority** for persisted derived values; preview APIs are for “what‑if” editor/tool use.
- We want to **reuse this metric pattern** for future social/NPC systems, instead of:
  - Duplicating computation in TS, or
  - Designing one-off APIs per derived label.

This task defines phases for building **new social metrics** (e.g. NPC mood, reputation, social rank) on top of the metric/preview infrastructure created in Task 07.

> **For agents:** Do not start this task until Task 07 has implemented the core metric/preview plumbing (at least Phases 2–4). When you add a new metric, wire it into the same registry + preview pattern instead of inventing new one-off logic.

### Phase Checklist

- [ ] **Phase 1 – Inventory Existing & Planned Social Concepts**
- [ ] **Phase 2 – Design Generic `Metric` & `MetricPayload` Types**
- [ ] **Phase 3 – Implement NPC Mood Metric (Backend + Preview)**
- [ ] **Phase 4 – Implement Reputation / Faction Metric (Backend + Preview)**
- [ ] **Phase 5 – Add Generic Metric Preview Helper in Game-Core**
- [ ] **Phase 6 – Integrate Social Metrics into Editor & Dev Panels**
- [ ] **Phase 7 – Define Schema Locations in World/Session Meta**
- [ ] **Phase 8 – Extend Docs & App Map to Cover Social Metrics**
- [ ] **Phase 9 – Validation & Cross-Metric Consistency Checks**
- [ ] **Phase 10 – Long-Term Extensibility & Guardrails**

---

### Phase 1 – Inventory Existing & Planned Social Concepts

**Goal**  
Determine which social/NPC systems should use the metric/preview pattern.

**Scope**
- Existing concepts (even if not fully implemented) and near‑term plans.

**Key Steps**
1. Scan docs (e.g. `RELATIONSHIPS_AND_ARCS.md`, NPC design docs) and code for:
   - NPC mood / emotional state.
   - Reputation / faction standing.
   - Social rank, trust tiers, or similar.
2. Produce a short list in this file with:
   - Metric ID (e.g. `npc_mood`, `reputation_band`).
   - Inputs (axes/flags).
   - Desired output (label/intensity).

---

### Phase 2 – Design Generic `Metric` & `MetricPayload` Types

**Goal**  
Define common types for metrics and payloads in both backend and TS so new metrics follow a consistent pattern.

**Scope**
- Types/interfaces only; no new logic yet.

**Key Steps**
1. Backend:
   - Extend `pixsim7_backend/domain/metrics/types.py` with:
     - `MetricId` type (e.g. `Literal` of known metric strings).
     - Generic payload/result type hints.
2. Game-core / types:
   - Add corresponding TS types in `@pixsim7/types`, e.g.:
     ```ts
     export type MetricId = 'relationship_tier' | 'relationship_intimacy' | 'npc_mood' | 'reputation_band';
     export interface MetricPreviewRequest<M extends MetricId = MetricId> { /* metric + payload */ }
     export interface MetricPreviewResponse<M extends MetricId = MetricId> { /* typed result */ }
     ```
3. Ensure the existing relationship preview endpoints fit into this metric model cleanly.

---

### Phase 3 – Implement NPC Mood Metric (Backend + Preview)

**Goal**  
Add a simple NPC mood metric that can be previewed via the metric system.

**Scope**
- Backend evaluator + preview API; no gameplay changes yet.

**Key Steps**
1. Define a minimal mood schema (e.g. in `GameWorld.meta.npc_mood_schema`):
   - Inputs: recent events, relationship deltas, schedule stress, etc. (start simple: maybe just affinity + recent flags).
   - Outputs: `mood_id` (e.g. `neutral`, `happy`, `annoyed`).
2. Implement `evaluate_npc_mood` in a new metrics module (e.g. `metrics/npc_mood_evaluators.py`).
3. Register `npc_mood` metric in the metrics registry.
4. Add a preview endpoint (or extend existing generic preview endpoint) to support `metric: "npc_mood"`.

---

### Phase 4 – Implement Reputation / Faction Metric (Backend + Preview)

**Goal**  
Add a reputation/faction metric suitable for world‑level or NPC‑pair reputation checks.

**Scope**
- Backend evaluator + preview; reuse world meta for schemas.

**Key Steps**
1. Define where reputation config lives (e.g. `GameWorld.meta.reputation_schemas`).
2. Implement `evaluate_reputation_band`:
   - Inputs: numeric reputation score and/or flags.
   - Outputs: `reputation_band` (e.g. `enemy`, `neutral`, `ally`).
3. Register `reputation_band` as a metric in the metrics registry.
4. Extend the preview endpoint to handle `metric: "reputation_band"`.

---

### Phase 5 – Add Generic Metric Preview Helper in Game-Core

**Goal**  
Provide a single TS helper in game-core for previewing any metric, with relationship/mood/reputation wrappers on top.

**Scope**
- Game-core only.

**Key Steps**
1. Implement `previewMetric` in `packages/game-core/src/metrics/preview.ts` (or similar):
   ```ts
   export async function previewMetric<M extends MetricId>(
     metric: M,
     payload: MetricPreviewRequest<M>
   ): Promise<MetricPreviewResponse<M>> { /* calls backend */ }
   ```
2. Update relationship preview helpers (`previewRelationshipTier`, `previewIntimacyLevel`) to use `previewMetric` internally.
3. Add new helpers for `npc_mood` and `reputation_band` on top of `previewMetric`:
   - `previewNpcMood(...)`
   - `previewReputationBand(...)`.

---

### Phase 6 – Integrate Social Metrics into Editor & Dev Panels

**Goal**  
Wire new metrics into relevant editor UIs and dev/debug panels.

**Scope**
- Editor flows only; no runtime gameplay decisions.

**Key Steps**
1. Identify where NPC mood and reputation would be most useful in UI:
   - Npc Brain Lab.
   - Relationship dashboards.
   - World/scene editors.
2. Call `previewNpcMood` / `previewReputationBand` from those tools when inputs change.
3. Display metric outputs alongside existing labels (e.g. tier/intimacy).

---

### Phase 7 – Define Schema Locations in World/Session Meta

**Goal**  
Ensure all social metrics have well‑defined schema locations in world/session meta, consistent with relationships.

**Scope**
- Schema placement and naming; no new UI.

**Key Steps**
1. Document where each metric’s schema lives:
   - Relationships: `GameWorld.meta.relationship_schemas`, `intimacy_schema`.
   - Mood: `GameWorld.meta.npc_mood_schema`.
   - Reputation: `GameWorld.meta.reputation_schemas`.
2. Update `RELATIONSHIPS_AND_ARCS.md` (or a new social systems doc) to describe these schemas and how they should be edited.

---

### Phase 8 – Extend Docs & App Map to Cover Social Metrics

**Goal**  
Make the new metric system first‑class in docs and the App Map.

**Scope**
- Documentation + App Map UI.

**Key Steps**
1. Extend `docs/RELATIONSHIPS_AND_ARCS.md` (or a new `SOCIAL_METRICS.md`) to:
   - Explain the role of each metric.
   - Show example schemas and preview calls.
2. Update `docs/APP_MAP.md` and `06-app-map-and-dev-panel.md` to:
   - Mention social metrics under “Game & Simulation Systems”.
   - Optionally add a small pane in the App Map dev panel listing available metrics and where they are used.

---

### Phase 9 – Validation & Cross-Metric Consistency Checks

**Goal**  
Ensure social metrics don’t contradict each other in obvious ways and behave sensibly across worlds.

**Scope**
- Validation logic and tests; no UI.

**Key Steps**
1. Write tests that:
   - Spot‑check metric outputs under different schemas.
   - Check relationships between metrics (e.g. very high affinity should rarely produce “hostile” reputation).
2. Add optional backend validation functions that:
   - Inspect world meta for contradictory schema definitions.
   - Emit warnings (in logs or dev tools) when schemas are inconsistent.

---

### Phase 10 – Long-Term Extensibility & Guardrails

**Goal**  
Set guidelines so new social metrics are added in a disciplined way via the metric system, not as ad‑hoc logic.

**Scope**
- Process and guardrails; minimal code.

**Key Steps**
1. Document a short “Adding a new metric” checklist:
   - Add schema.
   - Implement backend evaluator.
   - Register in metrics registry.
   - Add preview helper in game-core.
   - Wire into docs and, optionally, App Map.
2. Add linting/CI checks where feasible (e.g. ensuring new metric IDs are declared in both backend and types).
3. Cross‑link this task from `07-relationship-preview-api-and-metrics.md` so future agents discover it when extending the system.

