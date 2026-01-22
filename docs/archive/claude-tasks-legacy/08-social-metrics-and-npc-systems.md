**Task: Social Metrics & NPC Systems Built on Preview API (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document**, not the primary specification.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/APP_MAP.md` (social metrics / NPC sections)  
>   - `docs/SOCIAL_METRICS.md` (metric system, schemas, preview APIs)  
>   - `docs/RELATIONSHIPS_AND_ARCS.md` (relationship data conventions).  
>   - `claude-tasks/13-npc-behavior-system-activities-and-routine-graphs.md` (NPC activities, preferences, and routine graphs built on these metrics).
> - When adding a new metric, always wire it through `pixsim7/backend/main/domain/metrics/*` and the preview API pattern, and keep `packages/types/src/game.ts` + game‑core helpers in sync.
> - Use the phase checklist below to coordinate work and record what’s done (with notes and file paths).

**Context**
- Task 07 introduces a **relationship preview API** and a generic **metrics** layer:
  - Backend: `game_relationship_preview` endpoints and metric evaluators in `pixsim7/backend/main/domain/metrics/`.
  - Game-core: `previewRelationshipTier`, `previewIntimacyLevel`, and preview API config.
- The codebase already has several **social/NPC concepts**, but they are not yet unified as metrics:
  - NPC mood and emotional state (e.g. `apps/main/src/plugins/worldTools/moodDebug.tsx`, `BrainShapeExample`).
  - Mood and intensity tags in action blocks and dialogue:
    - `pixsim7/backend/main/domain/narrative/action_blocks/types*.py`
    - `pixsim7/backend/main/services/action_blocks/composition_engine.py`
    - `pixsim7/backend/main/api/v1/game_dialogue.py` and plugin manifest.
  - Implicit notions of reputation/faction standing (planned/partial in docs).
- We want to **reuse the metric+preview pattern** from Task 07 for these systems, instead of:
  - Duplicating computation in TS, or
  - Designing one‑off APIs per derived label.

This task defines phases for turning NPC mood and reputation into **first‑class metrics** with preview support, wired into existing tools (Mood Debug, dialogue plugins, etc.).

> **For agents:** Do not start this task until Task 07 has implemented the core relationship metric/preview plumbing (at least Phases 2–4). When you add a new metric, wire it into the same `domain/metrics` registry and game-core preview helpers instead of inventing new one‑off logic.

### Phase Checklist

- [x] **Phase 1 – Inventory Existing NPC Mood & Social Signals**  
  *2025‑11‑19*
- [x] **Phase 2 – Design Generic Metric Types (Backend + TS)**  
  *2025‑11‑19*
- [x] **Phase 3 – Implement NPC Mood Metric (Backend + Preview)**  
  *2025‑11‑19*
- [x] **Phase 4 – Implement Reputation / Faction Metric (Backend + Preview)**  
  *2025‑11‑19*
- [x] **Phase 5 – Add Generic Metric Preview Helper in Game-Core**  
  *2025‑11‑19*
- [x] **Phase 6 – Integrate Metrics into Existing Tools (Mood Debug, Dialogue)**  
  *2025‑11‑19*
- [x] **Phase 7 – Define Schema Locations in World/Session Meta**  
  *2025‑11‑19*
- [x] **Phase 8 – Extend Docs & App Map to Cover Social Metrics**  
  *2025‑11‑19*
- [x] **Phase 9 – Validation & Cross-Metric Consistency Checks**  
  *2025‑11‑19*
- [x] **Phase 10 – Long-Term Extensibility & Guardrails**  
  *2025‑11‑19*

---

### Phase 1 – Inventory Existing NPC Mood & Social Signals

… (existing detailed phase descriptions unchanged) …

---

**Related Docs & Files**

- Docs:  
  - `docs/APP_MAP.md` – architecture index (social metrics section)  
  - `docs/SOCIAL_METRICS.md` – metric definitions and schemas  
  - `docs/RELATIONSHIPS_AND_ARCS.md` – relationship/session conventions
- Backend:  
  - `pixsim7/backend/main/domain/metrics/mood_evaluators.py`  
  - `pixsim7/backend/main/domain/metrics/reputation_evaluators.py`  
  - `pixsim7/backend/main/domain/metrics/__init__.py` (registry)  
  - `pixsim7/backend/main/api/v1/game_reputation_preview.py`
- Game-core / Types:  
  - `packages/types/src/game.ts` (metric payload/response types)  
  - `packages/game/engine/src/metrics/preview.ts` (generic preview client)  
  - `packages/game/engine/src/npcs/brain.ts` (mood state usage)
