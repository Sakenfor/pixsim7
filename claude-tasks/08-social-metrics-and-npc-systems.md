**Task: Social Metrics & NPC Systems Built on Preview API (Multi‑Phase)**

**Context**
- Task 07 introduces a **relationship preview API** and a generic **metrics** layer:
  - Backend: `game_relationship_preview` endpoints and metric evaluators in `pixsim7_backend/domain/metrics/`.
  - Game-core: `previewRelationshipTier`, `previewIntimacyLevel`, and preview API config.
- The codebase already has several **social/NPC concepts**, but they are not yet unified as metrics:
  - NPC mood and emotional state (e.g. `frontend/src/plugins/worldTools/moodDebug.tsx`, `BrainShapeExample`).
  - Mood and intensity tags in action blocks and dialogue:
    - `pixsim7_backend/domain/narrative/action_blocks/types*.py`
    - `pixsim7_backend/services/action_blocks/composition_engine.py`
    - `pixsim7_backend/api/v1/game_dialogue.py` and plugin manifest.
  - Implicit notions of reputation/faction standing (planned/partial in docs).
- We want to **reuse the metric+preview pattern** from Task 07 for these systems, instead of:
  - Duplicating computation in TS, or
  - Designing one‑off APIs per derived label.

This task defines phases for turning NPC mood and reputation into **first‑class metrics** with preview support, wired into existing tools (Mood Debug, dialogue plugins, etc.).

> **For agents:** Do not start this task until Task 07 has implemented the core relationship metric/preview plumbing (at least Phases 2–4). When you add a new metric, wire it into the same `domain/metrics` registry and game-core preview helpers instead of inventing new one‑off logic.

### Phase Checklist

- [x] **Phase 1 – Inventory Existing NPC Mood & Social Signals** ✅ *2025-11-19*
- [x] **Phase 2 – Design Generic Metric Types (Backend + TS)** ✅ *2025-11-19*
- [x] **Phase 3 – Implement NPC Mood Metric (Backend + Preview)** ✅ *2025-11-19*
- [x] **Phase 4 – Implement Reputation / Faction Metric (Backend + Preview)** ✅ *2025-11-19*
- [ ] **Phase 5 – Add Generic Metric Preview Helper in Game-Core**
- [ ] **Phase 6 – Integrate Metrics into Existing Tools (Mood Debug, Dialogue)**
- [ ] **Phase 7 – Define Schema Locations in World/Session Meta**
- [ ] **Phase 8 – Extend Docs & App Map to Cover Social Metrics**
- [ ] **Phase 9 – Validation & Cross-Metric Consistency Checks**
- [ ] **Phase 10 – Long-Term Extensibility & Guardrails**

---

### Phase 1 – Inventory Existing NPC Mood & Social Signals

**Goal**  
Map out what social data already exists (mood, tags, reputation‑like values) and where it lives.

**Scope**
- Backend and frontend sources of social state; no new code yet.

**Key Steps**
1. Backend:
   - Collect current mood‑related APIs and domains:
     - Dialogue and action block systems (`game_dialogue`, `action_blocks`, mood tags).
     - NPC memory / brain state where mood is described in docs/code.
   - Note how mood is represented today (labels, valence/arousal, tags).
2. Frontend:
   - Inspect `frontend/src/plugins/worldTools/moodDebug.tsx` and `BrainShapeExample` to see how mood is visualized.
   - Note any implicit “banding” (e.g. neutral/happy/angry) already used in UI.
3. Reputation:
   - Check docs for any planned or partial reputation/faction systems.
   - Note what inputs/outputs are envisioned (e.g. numeric 0–100, bands like enemy/neutral/ally).
4. Record a small table in this task file summarizing:
   - Metric ID (e.g. `npc_mood`, `reputation_band`).
   - Inputs (fields/axes).
   - Existing outputs (labels/tags) and where they show up.

---

**Phase 1 Implementation Summary** ✅ *Completed 2025-11-19*

### Inventory of Existing NPC Mood & Social Signals

#### 1. Backend Mood Systems

**Database-Level Emotional States** (`pixsim7_backend/domain/npc_memory.py`):
- **NPCEmotionalState** table with comprehensive emotion tracking
- **EmotionType** enum with 17 emotion types:
  - Positive: happy, excited, content, playful, affectionate, grateful
  - Negative: sad, angry, frustrated, anxious, hurt, jealous
  - Neutral/Complex: curious, thoughtful, surprised, confused, nervous, bored, tired
- **Features**:
  - Intensity (0.0-1.0)
  - Duration and decay rate
  - Trigger tracking (what caused the emotion)
  - Session association
  - Expiration and time-based decay
- **Service** (`pixsim7_backend/services/npc/emotional_state_service.py`):
  - Set/update emotions
  - Get current dominant emotion
  - Transition between emotions
  - Get emotion modifiers for dialogue

**Action Block Mood Tags** (`pixsim7_backend/domain/narrative/action_blocks/types.py`):
- `ActionBlockTags.mood` field (e.g., "playful", "tender", "passionate", "conflicted")
- Used in action selection context
- Maps to visual generation prompts

**Dialogue Emotional Context**:
- Mood tags in composition engine
- Emotional state service provides dialogue modifiers:
  - Tone mapping (cheerful, energetic, calm, nervous, etc.)
  - Expressiveness based on intensity
  - Dialogue adjustments based on active emotions

#### 2. Frontend/Game-Core Mood Systems

**Valence-Arousal Model** (`packages/game-core/src/npcs/brain.ts`):
- **computeMood()** function:
  - **Valence** (0-100): Driven by `affinity * 0.6 + chemistry * 0.4`
  - **Arousal** (0-100): Driven by `chemistry * 0.5 + tension * 0.5`
  - **Label**: Derived from valence/arousal quadrants:
    - `excited`: High valence, high arousal
    - `content`: High valence, low arousal
    - `anxious`: Low valence, high arousal
    - `calm`: Low valence, low arousal

**Mood Debug Tool** (`frontend/src/plugins/worldTools/moodDebug.tsx`):
- Displays NPC mood for all NPCs in session
- Shows valence, arousal, and label
- Displays mood flags from relationship state
- Color-coded badges: excited (yellow), content (green), anxious (red), calm (blue)

**Brain Visualization** (`frontend/src/components/examples/BrainShapeExample.tsx`):
- Mood inspector panel showing valence/arousal axes
- Visual representation with sliders
- Real-time updates from core

#### 3. Relationship Context

**Current Relationship Axes** (inputs to mood):
- Affinity: 0-100 (how much they like the player)
- Trust: 0-100 (how much they trust the player)
- Chemistry: 0-100 (romantic/physical attraction)
- Tension: 0-100 (conflict/stress in relationship)
- Flags: Boolean/string tags for specific states

**Relationship-Derived Labels** (from Task 07):
- Tier ID (e.g., "stranger", "friend", "close_friend", "lover")
- Intimacy Level ID (e.g., "light_flirt", "deep_flirt", "intimate")

#### 4. Reputation/Faction Systems

**Current Status**: Not implemented
- No existing reputation or faction system found
- RELATIONSHIPS_AND_ARCS.md mentions potential for NPC-NPC relationships but no faction mechanics
- No world-level or group-level reputation tracking

**Potential Inputs** (from existing data):
- Could be derived from relationship affinity aggregates
- Could use session flags for faction membership
- Could track in GameWorld.meta for faction definitions

#### 5. Summary Table

| Metric ID | Data Source | Inputs | Current Outputs | Where Used |
|-----------|-------------|--------|-----------------|------------|
| **npc_mood** (valence/arousal) | Game-core computation | affinity, chemistry, tension | valence (0-100), arousal (0-100), label (excited/content/anxious/calm) | moodDebug.tsx, BrainShapeExample, buildNpcBrainState |
| **npc_emotion** (discrete) | NPCEmotionalState table | event triggers, context | EmotionType enum (17 types), intensity (0-1), duration | emotional_state_service.py, dialogue modifiers |
| **action_mood** | Action block tags | narrative context, intimacy level | mood string (playful, tender, passionate, conflicted) | Action selection, video generation prompts |
| **reputation_band** | Not implemented | (planned) faction membership, aggregate affinity | (planned) enemy/neutral/ally bands | None yet |
| **faction_standing** | Not implemented | (planned) world.meta faction schemas | (planned) numeric score + band | None yet |

#### 6. Key Findings

**Duplication Between Systems**:
1. **Two Mood Models**: Database EmotionType (17 discrete emotions) vs. game-core valence/arousal (4 quadrants)
2. **Different Use Cases**:
   - EmotionType: Event-driven, persistent, used for dialogue modifiers
   - Valence/Arousal: Computed on-the-fly from relationship state, used for debugging/visualization
3. **No Integration**: These systems don't currently talk to each other

**Schema Gaps**:
- No world-level mood schema (valence/arousal quadrant thresholds are hardcoded)
- No customizable emotion-to-mood mapping
- No reputation schema defined

**Opportunities for Metrics System**:
- Unify mood computation behind preview API
- Allow worlds to customize mood quadrant thresholds
- Define emotion-to-mood-label mappings in world.meta
- Add reputation as a new metric type with world-specific bands

**No Breaking Changes Needed**:
- Current UI already consumes mood data correctly
- Can layer metrics system on top without disrupting existing code
- Frontend tools already designed for preview-style interactions

---

### Phase 2 – Design Generic Metric Types (Backend + TS)

**Goal**  
Define common types for metrics and payloads in both backend and TS so new metrics follow a consistent pattern.

**Scope**
- Types/interfaces only; no new evaluator logic yet.

**Key Steps**
1. Backend:
   - Extend `pixsim7_backend/domain/metrics/types.py` with:
     - `MetricId` type (e.g. `Literal` or Enum for known metric ids like `'relationship_tier'`, `'npc_mood'`, `'reputation_band'`).
     - Generic payload/result typing helpers.
2. Game-core / types:
   - Add corresponding TS types in `@pixsim7/types`, e.g.:
     ```ts
     export type MetricId = 'relationship_tier' | 'relationship_intimacy' | 'npc_mood' | 'reputation_band';

     export interface MetricPreviewRequest<M extends MetricId = MetricId> {
       metric: M;
       worldId: number;
       payload: Record<string, unknown>;
     }

     export interface MetricPreviewResponse<M extends MetricId = MetricId> {
       metric: M;
       worldId: number;
       result: Record<string, unknown>;
     }
     ```
3. Ensure the existing relationship preview endpoints can conceptually fit into this metric model (even if they currently have dedicated routes).

---

**Phase 2 Implementation Summary** ✅ *Completed 2025-11-19*

### Backend Type Extensions

**File**: `pixsim7_backend/domain/metrics/types.py`

Added new metric types to the `MetricType` enum:
```python
class MetricType(str, Enum):
    RELATIONSHIP_TIER = "relationship_tier"
    RELATIONSHIP_INTIMACY = "relationship_intimacy"
    NPC_MOOD = "npc_mood"  # NEW
    REPUTATION_BAND = "reputation_band"  # NEW
```

The existing `MetricEvaluator` protocol already supports these new metrics without modification.

### TypeScript Type Extensions

**File**: `packages/types/src/game.ts`

Added comprehensive type definitions:

1. **Generic Metric Types**: `MetricId`, `MetricPreviewRequest`, `MetricPreviewResponse`
2. **NPC Mood Metric Types**: `NpcMoodPreviewRequest`, `NpcMoodPreviewResponse` with valence/arousal/emotion fields
3. **Reputation Metric Types**: `ReputationBandPreviewRequest`, `ReputationBandPreviewResponse` with band/score fields

**Design Decisions**:
- Dual system for mood (valence/arousal + discrete emotions)
- Flexible reputation (player/NPC/faction)
- Consistent with Task 07 pattern
- Backward compatible

**Verification**: ✅ Backend types extended, ✅ TypeScript types added, ✅ Types package builds successfully

---

### Phase 3 – Implement NPC Mood Metric (Backend + Preview)

**Goal**  
Add a simple NPC mood metric that can be evaluated and previewed via the metrics system.

**Scope**
- Backend evaluator + optional dedicated preview route; no changes to how dialogue/prompt builders work yet.

**Key Steps**
1. Define what the mood metric should output, e.g.:
   - `mood_id` (e.g. `neutral`, `happy`, `annoyed`, `tense`).
   - Optional continuous axes (valence/arousal) if they’re already modeled.
2. Decide schema source:
   - Prefer `GameWorld.meta.npc_mood_schema` (e.g. thresholds, labels) so worlds can customize.
3. Implement `evaluate_npc_mood` in `pixsim7_backend/domain/metrics`:
   - Inputs: world id, NPC id, and any needed state (recent events, relationship deltas, flags).
   - Implementation for v1 can be simple (e.g. based on a few flags/axes).
4. Expose a preview endpoint:
   - Either as a dedicated route (e.g. `/game/npc_mood/preview`) or via a generic metrics preview endpoint extended from Task 07.

---

### Phase 4 – Implement Reputation / Faction Metric (Backend + Preview)

**Goal**  
Add a reputation/faction metric suitable for world‑level or NPC‑pair reputation checks, using the same metrics framework.

**Scope**
- Backend evaluator + preview; rely on world meta for schemas.

**Key Steps**
1. Define where reputation config lives (e.g. `GameWorld.meta.reputation_schemas`), similar to relationship schemas.
2. Implement `evaluate_reputation_band`:
   - Inputs: world id, subject (e.g. player or NPC), target (faction or NPC), and numeric reputation or flags.
   - Outputs: `reputation_band` (e.g. `enemy`, `neutral`, `ally`).
3. Register this evaluator in the metrics registry.
4. Expose a preview path via the metrics preview API.

---

**Phase 4 Implementation Summary** ✅ *Completed 2025-11-19*

### Backend Evaluator

**File**: `pixsim7_backend/domain/metrics/reputation_evaluators.py`

Implemented `evaluate_reputation_band` with support for:

1. **Multiple Reputation Types**:
   - Player-to-NPC: Based on relationship affinity
   - NPC-to-NPC: Based on stored pair relationships
   - Faction-based: Based on faction membership standings

2. **Schema-Aware Computation**:
   - Uses `GameWorld.meta.reputation_schemas` for world-specific bands
   - Supports target-type-specific schemas (npc, faction, group)
   - Falls back to default schema if target-specific not found

3. **Default Reputation Bands** (0-100 scale):
   - enemy: 0-20
   - hostile: 20-40
   - neutral: 40-60
   - friendly: 60-80
   - ally: 80-100

4. **Flexible Input**:
   - Explicit reputation_score override
   - Derived from session relationships (affinity for player-NPC)
   - Faction membership dictionary for faction standings
   - Neutral default (50.0) if no data available

### API Endpoint

**File**: `pixsim7_backend/api/v1/game_reputation_preview.py`

**Route**: `POST /api/v1/game/reputation/preview-reputation`

**Request**:
- subject_id, subject_type (player/npc)
- Optional: target_id, target_type (npc/faction/group)
- Optional: reputation_score, session_id, faction_membership

**Response**:
- reputation_band, reputation_score
- Echoed subject_id, target_id, target_type

### Route Plugin

**File**: `pixsim7_backend/routes/game_reputation_preview/manifest.py`

- Registered at `/api/v1/game/reputation` prefix
- Auto-discovery enabled
- No auth required for preview endpoints

### Key Features

- **Extensible**: Easy to add new reputation types (guild, region, etc.)
- **Schema-Driven**: Worlds can define custom reputation bands
- **Integration-Ready**: Works with existing relationship data
- **Future-Proof**: Supports faction system (to be implemented)

**Verification**: ✅ Backend evaluator implemented, ✅ API endpoint created, ✅ Route plugin registered

---

### Phase 5 – Add Generic Metric Preview Helper in Game-Core

**Goal**  
Provide a single TS helper in game-core for previewing any metric, with relationship/mood/reputation wrappers on top.

**Scope**
- Game-core only; no frontend changes yet.

**Key Steps**
1. Implement `previewMetric` in a new module, e.g. `packages/game-core/src/metrics/preview.ts`:
   ```ts
   export async function previewMetric<M extends MetricId>(
     args: MetricPreviewRequest<M>
   ): Promise<MetricPreviewResponse<M>> { /* calls backend metrics preview */ }
   ```
2. Update relationship preview helpers (`previewRelationshipTier`, `previewIntimacyLevel`) to use `previewMetric` internally (or keep them as separate routes if necessary but align types).
3. Add typed wrappers for:
   - `previewNpcMood(...)`
   - `previewReputationBand(...)`.

---

### Phase 6 – Integrate Metrics into Existing Tools (Mood Debug, Dialogue)

**Goal**  
Wire new metrics into existing visual/debug tools and, where appropriate, into dialogue/action block flows.

**Scope**
- Editor and dev tools; core gameplay decisions should still rely on backend‑stored values where applicable.

**Key Steps**
1. Mood Debug:
   - Update `frontend/src/plugins/worldTools/moodDebug.tsx` to consume `previewNpcMood` where appropriate (e.g. what mood would result from a hypothetical change).
   - Keep existing “live” mood display for current state, but add preview affordances if useful.
2. Dialogue / action blocks:
   - Identify places where mood tags are chosen or checked (e.g. in composition/selection UI).
   - Optionally use `previewNpcMood` to show what mood label the system would infer, given current state.
3. Ensure UI labels map cleanly to metric outputs (`mood_id`, `reputation_band`).

---

### Phase 7 – Define Schema Locations in World/Session Meta

**Goal**  
Ensure all social metrics have well‑defined schema locations in world/session meta, consistent with relationships.

**Scope**
- Schema placement and naming; no new UI.

**Key Steps**
1. For each metric (relationship, mood, reputation), document:
   - Which `GameWorld.meta` keys it reads (e.g. `relationship_schemas`, `intimacy_schema`, `npc_mood_schema`, `reputation_schemas`).
   - Any session‑level data it depends on (`GameSession.flags`/`relationships`).
2. Update appropriate docs (likely `RELATIONSHIPS_AND_ARCS.md` or a new `SOCIAL_METRICS.md`) with:
   - Schema examples.
   - Guidance on how to edit these safely.

---

### Phase 8 – Extend Docs & App Map to Cover Social Metrics

**Goal**  
Make the social metrics system first‑class in docs and the App Map.

**Scope**
- Documentation + App Map UI.

**Key Steps**
1. Update docs:
   - Extend `RELATIONSHIPS_AND_ARCS.md` or create `SOCIAL_METRICS.md` to describe:
     - Relationship, mood, and reputation metrics.
     - How preview APIs are used (editor vs runtime).
2. Update `docs/APP_MAP.md` and `06-app-map-and-dev-panel.md` to:
   - Mention metric preview endpoints under “Game & Simulation Systems”.
   - Optionally surface metrics in the App Map dev panel (e.g. which metrics are registered and where they’re consumed).

---

### Phase 9 – Validation & Cross-Metric Consistency Checks

**Goal**  
Ensure social metrics don’t contradict each other in obvious ways and behave sensibly across worlds.

**Scope**
- Validation logic and tests; no new UI.

**Key Steps**
1. Write tests that:
   - Spot‑check metric outputs for mood/reputation under various schemas.
   - Verify relationships between metrics where it matters (e.g. extremely high affinity should rarely yield “hostile” reputation).
2. Add optional backend validation functions that:
   - Inspect world meta for inconsistent schema definitions.
   - Emit warnings when schemas conflict (e.g. a reputation band that contradicts relationship tiers).

---

### Phase 10 – Long-Term Extensibility & Guardrails

**Goal**  
Establish patterns so new social metrics are added in a structured way via the metric system, not as ad‑hoc logic scattered around.

**Scope**
- Process and guardrails; minimal code.

**Key Steps**
1. Document a short “Adding a new social metric” checklist:
   - Define schema in world meta.
   - Implement backend evaluator under `domain/metrics`.
   - Register it with the metrics registry and, if needed, preview endpoints.
   - Add a TS type and game-core preview helper.
   - Wire into docs and dev tools.
2. Add basic checks in CI or linting (where feasible) so new metric IDs are declared consistently in backend and TS types.
3. Cross‑link this task from Tasks 07 and 09 so future work on relationships/intimacy/generation keeps the metrics system in mind.

