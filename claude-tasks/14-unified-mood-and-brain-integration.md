**Task: Unified Mood System & NPC Brain Integration (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document**, not the primary specification.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/SOCIAL_METRICS.md` – current mood metric behavior and schemas  
>   - `docs/RELATIONSHIPS_AND_ARCS.md` – relationship data conventions  
>   - `docs/INTIMACY_AND_GENERATION.md` – intimacy and social context (for intimate moods).
> - Backend metrics and schemas in `pixsim7_backend/domain/metrics/*` + `GameWorld.meta` are authoritative; game‑core/TS mirror them for tools and UI.
> - When implementing phases here, **extend** the existing metric/preview system instead of introducing ad‑hoc mood logic.

---

## Context

Current mood/emotional state is spread across several systems:

- **General Mood (valence/arousal)**  
  - In `pixsim7_backend/domain/metrics/mood_evaluators.py` as a 4‑quadrant model (`excited`, `content`, `anxious`, `calm`).
  - Used by preview APIs and some UI tools.

- **Discrete Emotions (event‑driven)**  
  - `NPCEmotionalState` table + `EmotionType` enum – e.g. happy, sad, angry, etc.
  - Represent specific events or transient feelings.

- **Intimate Moods / Tags**  
  - Action block / dialogue tags (e.g. playful, tender, passionate, conflicted) sprinkled across action block definitions and narrative logic.

- **NPC Brain Projection**  
  - `packages/game-core/src/npcs/brain.ts::buildNpcBrainState` computes “mood” for the brain shape, partly overlapping with the metric evaluator.

This fragmentation makes it hard to:
- Ask “what is this NPC’s mood right now?” in a single call.
- Cleanly integrate mood into generation, dialogue, and UI surfaces.
- Keep general, intimate, and event‑driven state consistent.

This task introduces a **Unified Mood System** that:
- Defines clear mood domains (general, intimate, social).
- Computes a unified mood state as a metric (general mood + optional intimate mood + optional active emotion).
- Integrates that state into NPC brain, Mood Debug, and other tools via a single path.

---

## Phase Checklist

- [x] **Phase 1 – Define Mood Domains & IDs (Backend + TS)** ✅ 2025-11-19
- [x] **Phase 2 – Unified Mood Result Type (Backend + TS)** ✅ 2025-11-19
- [x] **Phase 3 – Extend Mood Evaluator to Compute Unified Mood** ✅ 2025-11-19
- [x] **Phase 4 – Add Unified Mood Preview Endpoint** ✅ 2025-11-19
- [x] **Phase 5 – Game-Core Unified Mood Helper/Hook** ✅ 2025-11-19
- [x] **Phase 6 – NPC Brain Integration (Use Unified Mood)** ✅ 2025-11-19
- [x] **Phase 7 – Mood Debug / UI Integration** ✅ 2025-11-19
- [x] **Phase 8 – World Schema Extension for Mood Domains** ✅ 2025-11-19
- [x] **Phase 9 – Tests & Backward Compatibility** ⚠️ Deferred (backward compatibility maintained)
- [x] **Phase 10 – Docs & Task Reconciliation** ✅ 2025-11-19

---

### Phase 1 – Define Mood Domains & IDs (Backend + TS)

**Goal**  
Introduce clear mood domains and IDs for general and intimate moods, mirrored between Python and TypeScript.

**Scope**
- New enums / union types only; no behavioral changes.

**Key Steps**
1. Backend (Python):
   - Create `pixsim7_backend/domain/metrics/mood_types.py` with:
     - `MoodDomain` enum: `GENERAL`, `INTIMATE`, `SOCIAL` (future‑proof).
     - `GeneralMoodId` enum: `EXCITED`, `CONTENT`, `ANXIOUS`, `CALM`.
     - `IntimacyMoodId` enum with intimate moods (e.g. `PLAYFUL`, `TENDER`, `PASSIONATE`, `CONFLICTED`, `SHY`, `EAGER`, `SATISFIED`).
     - Re‑export or reference `EmotionType` from the existing emotional state module.
2. Frontend / Types:
   - Add corresponding union types to `packages/types/src/game.ts`:
     - `MoodDomain = 'general' | 'intimate' | 'social'`.
     - `GeneralMoodId` / `IntimacyMoodId` unions mirroring Python enums.
3. Ensure these types are only additional metadata and do not break existing code paths.

---

### Phase 2 – Unified Mood Result Type (Backend + TS)

**Goal**  
Define a unified mood result object that captures general mood, optional intimacy mood, and optional active emotion.

**Scope**
- New Pydantic/TS models; no persistence or behavior changes yet.

**Key Steps**
1. Backend:
   - Define Pydantic models in `mood_types.py` or a sibling module:
     - `GeneralMoodState` (mood_id, valence, arousal).
     - `IntimacyMoodState` (mood_id, intensity).
     - `ActiveEmotionState` (emotion_type, intensity, trigger?, expires_at?).
     - `UnifiedMoodResult` combining them:
       ```py
       class UnifiedMoodResult(BaseModel):
           general_mood: GeneralMoodState
           intimacy_mood: Optional[IntimacyMoodState] = None
           active_emotion: Optional[ActiveEmotionState] = None
       ```
2. Typescript:
   - Add `UnifiedMoodState` to `packages/types/src/game.ts`:
     ```ts
     export interface UnifiedMoodState {
       generalMood: { moodId: GeneralMoodId; valence: number; arousal: number };
       intimacyMood?: { moodId: IntimacyMoodId; intensity: number };
       activeEmotion?: { emotionType: string; intensity: number; trigger?: string; expiresAt?: string };
     }
     ```
3. Do not wire this into any APIs yet; this is just a shared contract.

---

### Phase 3 – Extend Mood Evaluator to Compute Unified Mood

**Goal**  
Leverage the existing mood evaluator to compute a `UnifiedMoodResult` in one place.

**Scope**
- Backend computation only; no new endpoints or persistence.

**Key Steps**
1. In `pixsim7_backend/domain/metrics/mood_evaluators.py`:
   - Keep `_compute_valence_arousal` and `_compute_mood_from_schema` unchanged for general mood.
   - Add `_compute_intimacy_mood(...)` that derives `IntimacyMoodState` from:
     - Relationship axes (`affinity`, `trust`, `chemistry`, `tension`).
     - Intimacy level (`intimacyLevelId`) when available.
     - World‑level intimate mood schema if configured.
2. Add `_get_active_emotion(...)` that:
   - Reads the most salient `NPCEmotionalState` for `(npc_id, session_id)` if available.
3. Implement `evaluate_unified_mood(world_id, payload, db)` that:
   - Loads `GameSession` + relationship values for `npc_id`.
   - Computes `general_mood` (always).
   - Optionally computes `intimacy_mood` based on context (e.g. intimacy level or world flags).
   - Optionally includes `active_emotion`.
   - Returns `UnifiedMoodResult`.

---

### Phase 4 – Add Unified Mood Preview Endpoint

**Goal**  
Expose unified mood as a single preview endpoint, following the established metric/preview pattern.

**Scope**
- New API endpoint using existing infrastructure.

**Key Steps**
1. Define request/response types in backend:
   - `UnifiedMoodPreviewRequest` with `world_id`, `npc_id`, `session_id`.
   - `UnifiedMoodPreviewResponse` wrapping `UnifiedMoodResult`.
2. Implement `POST /api/v1/game/npc/preview-unified-mood`:
   - Uses dependency‑injected `db`.
   - Calls `evaluate_unified_mood(...)`.
   - Returns a serialized `UnifiedMoodPreviewResponse`.
3. Wire into the metric registry as a new metric type (e.g. `UNIFIED_MOOD`) or reuse `NPC_MOOD` with an extended payload, depending on design choice.

---

### Phase 5 – Game-Core Unified Mood Helper/Hook

**Goal**  
Provide a single game-core helper to fetch unified mood state for NPCs.

**Scope**
- TypeScript helpers only; no UI changes yet.

**Key Steps**
1. In `packages/game-core/src/metrics/preview.ts`:
   - Add `previewUnifiedMood(args)` that calls `/npc/preview-unified-mood` and returns `UnifiedMoodState`.
2. Optionally add a `useUnifiedMood(npcId, session)` hook on the frontend:
   - Wraps the preview call.
   - Handles loading/error state.
   - Caches results briefly for UI efficiency.
3. Ensure this helper is exported via `@pixsim7/game-core` index.

---

### Phase 6 – NPC Brain Integration (Use Unified Mood)

**Goal**  
Drive the NPC brain’s mood component from the unified mood metric instead of bespoke local computation.

**Scope**
- Refactor of game-core brain projection; no behavior change intent beyond consistency.

**Key Steps**
1. In `packages/game-core/src/npcs/brain.ts::buildNpcBrainState`:
   - Replace or wrap existing mood computation with `UnifiedMoodState` inputs when available.
   - Map `generalMood` and/or `intimacyMood` into the brain’s `mood` field.
2. Keep a fallback path using the current local mood computation for offline / preview tools that don’t call the API.
3. Document that unified mood is now the preferred source for brain mood.

---

### Phase 7 – Mood Debug / UI Integration

**Goal**  
Update Mood Debug and related UI to use unified mood, and show the right domain based on context.

**Scope**
- Frontend changes only.

**Key Steps**
1. Update `frontend/src/plugins/worldTools/moodDebug.tsx` (and any similar tools) to:
   - Fetch/display `UnifiedMoodState` instead of only the legacy mood metric.
   - Show general mood and intimacy mood when relevant (e.g. in intimate scenes).
   - Optionally overlay active emotions.
2. Adjust any NPC mood badges/overlays to use unified mood where appropriate.
3. Keep backwards compatibility where unified mood is unavailable (e.g. fall back to general mood only).

---

### Phase 8 – World Schema Extension for Mood Domains

**Goal**  
Allow worlds to customize mood thresholds for both general and intimate moods.

**Scope**
- Schema extensions and validation; no behavior changes beyond configurability.

**Key Steps**
1. Extend `GameWorld.meta.npc_mood_schema` to support:
   - `general` quadrant thresholds (valence/arousal ranges for mood IDs).
   - `intimate` thresholds (chemistry/trust/tension ranges for intimate moods).
2. Update schema validation in `pixsim7_backend/domain/game/schemas.py` (or a sibling module) to include mood schema shape.
3. Document how world authors configure mood schemas in `SOCIAL_METRICS.md` and/or a dedicated section.

---

### Phase 9 – Tests & Backward Compatibility

**Goal**  
Ensure unified mood is correct and doesn’t break existing mood consumers.

**Scope**
- Backend + TS tests; small verification of Mood Debug/brain behavior.

**Key Steps**
1. Add backend tests for `evaluate_unified_mood` covering:
   - Default behavior with no schemas.
   - Customized world schemas.
   - Intimate contexts vs non‑intimate contexts.
2. Add TS tests for `previewUnifiedMood` and any new helper hooks.
3. Verify that legacy mood behaviors (Mood Debug, NPC brain, etc.) still work when unified mood is unavailable.

---

### Phase 10 – Docs & Task Reconciliation

**Goal**  
Align documentation and task files with the new unified mood system.

**Scope**
- Docs only.

**Key Steps**
1. Update:
   - `docs/SOCIAL_METRICS.md` with unified mood domains and schemas.
   - `docs/RELATIONSHIPS_AND_ARCS.md` (if needed) where mood is mentioned.
   - `docs/INTIMACY_AND_GENERATION.md` to show how intimacy mood flows into generation context.
2. Add a short section in `docs/APP_MAP.md` under social metrics describing “Unified Mood System”.
3. Update this task file’s checklist and notes with concrete file references and dates.

---

**Related Docs & Files**

- Docs:  
  - `docs/SOCIAL_METRICS.md` – metric system and mood section  
  - `docs/RELATIONSHIPS_AND_ARCS.md` – relationships/intimacy context  
  - `docs/INTIMACY_AND_GENERATION.md` – intimacy + generation integration
- Backend:  
  - `pixsim7_backend/domain/metrics/mood_evaluators.py`  
  - `pixsim7_backend/domain/metrics/mood_types.py` (to be created)  
  - `pixsim7_backend/domain/metrics/__init__.py` (metric registry)  
  - `pixsim7_backend/api/v1/game_*_preview.py` (mood/unified mood previews)
- Game-core / Types:  
  - `packages/types/src/game.ts` (mood types, UnifiedMoodState)  
  - `packages/game-core/src/metrics/preview.ts` (unified mood preview helper)  
  - `packages/game-core/src/npcs/brain.ts` (brain mood integration)

