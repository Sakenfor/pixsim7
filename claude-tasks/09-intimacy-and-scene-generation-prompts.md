**Task: Intimacy-Aware Generation Nodes & Prompt Context (Multi‑Phase)**

**Context**
- Relationships and intimacy are already modeled via:
  - `GameSession.relationships["npc:X"].tierId` and `intimacyLevelId`.
  - Per‑world schemas in `GameWorld.meta.relationship_schemas` and `intimacy_schema`.
- The dynamic generation system is defined in:
  - `packages/types/src/generation.ts` (`GenerationNodeConfig`, `GenerateContentRequest/Response`, etc.).
  - `docs/DYNAMIC_GENERATION_FOUNDATION.md` and `docs/GENERATION_PIPELINE_REFACTOR_PLAN.md`.
- Generation Nodes are used to request content (e.g. transitions, clips) via a backend generation service with clear data contracts.
- As we add **relationship preview APIs** (Task 07) and **social metrics** (Task 08), we want:
  - A consistent way to **inject intimacy/relationship context** into `GenerationNodeConfig` and `GenerateContentRequest`.
  - Clear **content rating / safety rails** so more intense content is explicitly gated and predictable.
  - A stable “follow‑along” so changes in relationship/intimacy metrics don’t silently change how generation requests are constructed.

This task defines phases for integrating intimacy and relationship state into the generation data model and tooling, without hardcoding explicit prompts in core code.

> **For agents:** Keep this task focused on structure and controls (context objects, ratings, config), not on writing explicit prompt strings. Wire into the existing generation types and pipeline, and rely on backend/template layers for actual prompt text.

### Phase Checklist

- [ ] **Phase 1 – Audit Intimacy Usage & Generation Integration Points**
- [ ] **Phase 2 – Define `GenerationSocialContext` in `generation.ts`**
- [ ] **Phase 3 – Map Relationship Metrics → `GenerationSocialContext`**
- [ ] **Phase 4 – World‑Level Generation Style & Rating Config**
- [ ] **Phase 5 – Wire Social Context into `GenerateContentRequest`**
- [ ] **Phase 6 – Editor Integration for Generation Nodes**
- [ ] **Phase 7 – Consent, Gating, and User Preferences**
- [ ] **Phase 8 – Validation & Guardrails in Generation Validator**
- [ ] **Phase 9 – Regression Anchors & Tests**
- [ ] **Phase 10 – Docs & App Map Updates**

---

### Phase 1 – Audit Intimacy Usage & Generation Integration Points

**Goal**  
Find all current and planned touchpoints between intimacy/relationships and dynamic generation, to avoid designing in a vacuum.

**Scope**
- Relationship/intimacy usage.
- Generation node and pipeline integration points.

**Key Steps**
1. Relationships:
   - Identify where `tierId` and `intimacyLevelId` are read for scene logic (condition checks, tags).
2. Generation system:
   - Review `packages/types/src/generation.ts`:
     - `GenerationNodeConfig`, `GenerateContentRequest`, `GenerateContentResponse`.
   - Review `docs/DYNAMIC_GENERATION_FOUNDATION.md` and `GENERATION_PIPELINE_REFACTOR_PLAN.md` for:
     - Where `GenerateContentRequest` is assembled.
     - How player/world context is envisioned to flow into generation.
3. Summarize:
   - “Where we can attach intimacy/relationship context to Generation Nodes and requests” in a short note in this file.

---

### Phase 2 – Define `GenerationSocialContext` in `generation.ts`

**Goal**  
Add a typed sub‑object capturing relationship/intimacy context for generation, so all requests share the same shape.

**Scope**
- Type definitions only; no new logic.

**Key Steps**
1. In `packages/types/src/generation.ts`, define:
   ```ts
   export interface GenerationSocialContext {
     intimacyLevelId?: string;      // e.g. 'light_flirt', 'intimate'
     relationshipTierId?: string;   // e.g. 'friend', 'lover'
     intimacyBand?: 'none' | 'light' | 'deep' | 'intense';
     contentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
   }
   ```
2. Thread this into:
   - `GenerationNodeConfig` (optional field, e.g. `socialContext?: GenerationSocialContext`).
   - `GenerateContentRequest` (optional `socialContext?: GenerationSocialContext`).
3. Ensure the new field is optional so existing uses remain valid.

---

### Phase 3 – Map Relationship Metrics → `GenerationSocialContext`

**Goal**  
Centralize how relationship metrics are mapped into `GenerationSocialContext`, instead of having multiple ad‑hoc mappings.

**Scope**
- Game-core and/or backend helper; no UI yet.

**Key Steps**
1. Implement a helper in game-core (or backend, if orchestration is server‑side), e.g. `buildGenerationSocialContext`:
   - Inputs:
     - `GameSession` (for `tierId`, `intimacyLevelId`, flags).
     - `GameWorld` (for world meta and schemas).
     - Optional: NPC ids/roles relevant to the current scene.
   - Output: `GenerationSocialContext`.
2. Define intimacy bands and content ratings (reusing whatever mapping Task 09 previously described), for example:
   - `light_flirt` → band `light`, rating at most `romantic`.
   - `intimate` / `very_intimate` → bands `deep`/`intense`, rating up to `mature_implied` depending on world/user config.
3. Ensure mapping is:
   - Data‑driven as much as possible (e.g. world meta can tweak thresholds).
   - Centralized in one helper so changes don’t fragment across the codebase.

---

### Phase 4 – World‑Level Generation Style & Rating Config

**Goal**  
Allow per‑world configuration for generation style and maximum allowed rating.

**Scope**
- World meta + types; no new UI in this phase.

**Key Steps**
1. Extend `GameWorld.meta` (and `@pixsim7/types`) with a `generation` or `prompt` block, e.g.:
   ```jsonc
   {
     "generation": {
       "stylePresetId": "soft_romance",
       "maxContentRating": "romantic"
     }
   }
   ```
2. Ensure `buildGenerationSocialContext`:
   - Reads this config.
   - Clamps `contentRating` by world `maxContentRating`.
3. Make sure this config is additive and does not break existing worlds (provide sensible defaults).

---

### Phase 5 – Wire Social Context into `GenerateContentRequest`

**Goal**  
Attach `GenerationSocialContext` to all relevant generation requests triggered from scenes/graphs.

**Scope**
- Code path where Generation Nodes are executed and `GenerateContentRequest` is built.

**Key Steps**
1. Identify the function(s) that create `GenerateContentRequest` from `GenerationNodeConfig` (per `DYNAMIC_GENERATION_FOUNDATION.md`).
2. Update those code paths to:
   - Call `buildGenerationSocialContext` with the appropriate session/world context.
   - Attach the resulting `socialContext` to `GenerationNodeConfig` and/or `GenerateContentRequest`.
3. Ensure backend generation service:
   - Accepts and forwards `socialContext` into the prompt‑templating/generation layer (without embedding explicit content in core code).

---

### Phase 6 – Editor Integration for Generation Nodes

**Goal**  
Expose the derived `GenerationSocialContext` to designers in the Generation Node UI, so they can see how relationship state affects generation.

**Scope**
- React Flow node UI and side panel.

**Key Steps**
1. In the Generation Node React components (per `DYNAMIC_GENERATION_FOUNDATION.md`):
   - Add a read‑only section in the side panel that shows:
     - `intimacyBand`
     - `contentRating`
     - `relationshipTierId` / `intimacyLevelId` in use.
2. Optionally, display a small rating badge on the node itself (e.g. “romantic”, “SFW”) for quick scanning.
3. Make this panel dev/editor‑only if necessary to keep runtime UI clean.

---

### Phase 7 – Consent, Gating, and User Preferences

**Goal**  
Integrate user‑level preferences with generation social context to ensure content intensity is explicitly opted into and clampable.

**Scope**
- Preference schema and clamping logic; no explicit content.

**Key Steps**
1. Extend user preferences (or add a dedicated struct) with:
   - `maxContentRating` (e.g. `sfw`, `romantic_only`, `mature_implied`).
   - Optional “reduce romantic intensity” toggle.
2. Update `buildGenerationSocialContext` (or a wrapper) to:
   - Clamp `contentRating` by both world and user `maxContentRating`.
   - Optionally map higher bands down (e.g. treat `intense` as `deep` when the user opts for lower intensity).
3. Ensure these clamped values are what go into `GenerateContentRequest`, not the raw metrics.

---

### Phase 8 – Validation & Guardrails in Generation Validator

**Goal**  
Add validation so Generation Nodes cannot accidentally request content beyond world/user rating constraints.

**Scope**
- Generation validation logic and warnings.

**Key Steps**
1. Extend the generation validator described in `DYNAMIC_GENERATION_FOUNDATION.md` to:
   - Check that `socialContext.contentRating` does not exceed:
     - World `maxContentRating`.
     - User `maxContentRating` where known.
2. Surface warnings/errors in the Generation Node validation tab if:
   - Expected rating would violate these constraints.
3. Ensure validation is fast and does not require calling the generation service itself.

---

### Phase 9 – Regression Anchors & Tests

**Goal**  
Create a small suite of regression tests to ensure that changes to relationships/metrics/world config do not unintentionally change generation social context.

**Scope**
- Tests and fixtures; no new features.

**Key Steps**
1. Define a handful of canonical fixtures:
   - Worlds with different `generation.maxContentRating`.
   - Sessions with different `tierId` / `intimacyLevelId` combinations.
   - Representative GenerationNodeConfigs.
2. For each fixture, run the social context builder and:
   - Assert expected `intimacyBand` and `contentRating`.
   - Assert that clamping by world/user prefs behaves as expected.
3. Integrate tests into:
   - TS test suite (for game-core helpers).
   - Optionally Python tests if context is also built server‑side.

---

### Phase 10 – Docs & App Map Updates

**Goal**  
Document the end‑to‑end flow from relationship metrics to generation and surface it in the App Map.

**Scope**
- Documentation and App Map dev panel.

**Key Steps**
1. Add or extend docs (e.g. `docs/INTIMACY_AND_GENERATION.md` or a section in `RELATIONSHIPS_AND_ARCS.md`) to:
   - Explain how `tierId`/`intimacyLevelId` map into `GenerationSocialContext`.
   - Show how world and user configs clamp rating.
   - Clarify which layers are responsible for actual prompt text (likely outside this repo).
2. Update `docs/APP_MAP.md` and `06-app-map-and-dev-panel.md` to:
   - Note that Generation Nodes now consume relationship/intimacy metrics.
   - Optionally add a small section in the App Map dev panel showing:
     - Generation routes that respect social context.
     - Which metrics feed into which systems (relationships → generation).

