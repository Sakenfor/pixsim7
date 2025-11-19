**Task: Relationship Preview API & Metric-Based Derivations (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document**, not the primary specification.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/APP_MAP.md` (relationships / social metrics sections)  
>   - `docs/RELATIONSHIPS_AND_ARCS.md` (session/relationship conventions)  
>   - `docs/SOCIAL_METRICS.md` (metric system and preview APIs).
> - Backend is the **only authority** for relationship tier/intimacy computations; TS code is fallback/preview only.
> - Use the phase checklist below to coordinate work and record what’s done (with notes and file paths).

**Context**
- Today, relationship tiers and intimacy levels are computed:
  - **Backend (Python)** in `pixsim7_backend/domain/narrative/relationships.py` using world schemas.
  - **Game-core (TS)** in `packages/game-core/src/relationships/computation.ts` as a mirrored fallback.
- Frontend now imports only from game-core, but there is still **duplicated logic** between backend and TS.
- We want:
  - Backend to be the **only authority** for relationship calculations that affect persisted state.
  - A small, **backend‑powered preview API** that editors/tools can call for “what would this tier/intimacy be?”.
  - A **metric‑based pattern** that can later handle other derived social/sim values (NPC mood, reputation) without adding more TS math.

Below are 10 phases for killing duplicated TS math for relationships and introducing a reusable preview API/metric system.

> **For agents:** This task affects both backend and game-core. Keep the layering strict: backend = authority, game‑core = typed accessors + preview wrappers, frontend = pure consumer. Update the checklist and add notes (files/PR/date) as phases land.

### Phase Checklist

- [x] **Phase 1 – Audit Current Relationship Computation & Call Sites**  
  *2025‑11‑19*
- [x] **Phase 2 – Design Preview API & Metric Abstraction**  
  *2025‑11‑19*
- [x] **Phase 3 – Implement Backend Relationship Preview Endpoint(s)**  
  *2025‑11‑19*
- [x] **Phase 4 – Add Game-Core TS Wrappers & Types**  
  *2025‑11‑19*
- [x] **Phase 5 – Migrate Editor/Tooling to Preview API**  
  *2025‑11‑19* (no migration needed; editor already uses game-core)
- [~] **Phase 6 – Remove TS Fallback Logic for Relationships**  
  *Deprecated and discouraged; still present as fallback for now*
- [x] **Phase 7 – Generalize Metric System for Future Social/Sim Derivations**  
  *2025‑11‑19* (metric registry + mood/reputation hooks)
- [x] **Phase 8 – Documentation & App Map Updates**  
  *2025‑11‑19*
- [x] **Phase 9 – Regression & Behavior Validation**  
  *2025‑11‑19*
- [x] **Phase 10 – Optional Offline Tooling Strategy**  
  *2025‑11‑19*

---

### Phase 1 – Audit Current Relationship Computation & Call Sites

… (existing detailed phase descriptions unchanged) …

---

**Related Docs & Files**

- Docs:  
  - `docs/APP_MAP.md` – index for relationships / social metrics  
  - `docs/RELATIONSHIPS_AND_ARCS.md` – session/relationship conventions  
  - `docs/SOCIAL_METRICS.md` – metric system and preview APIs
- Backend:  
  - `pixsim7_backend/domain/narrative/relationships.py`  
  - `pixsim7_backend/domain/metrics/relationship_evaluators.py`  
  - `pixsim7_backend/domain/metrics/__init__.py` (metric registry wiring)  
  - `pixsim7_backend/api/v1/game_relationship_preview.py`
- Game-core / Types:  
  - `packages/game-core/src/relationships/computation.ts`  
  - `packages/game-core/src/relationships/preview.ts`  
  - `packages/types/src/game.ts` (preview request/response types)

