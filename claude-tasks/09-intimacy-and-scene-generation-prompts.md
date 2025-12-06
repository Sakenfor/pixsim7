**Task: Intimacy-Aware Generation Nodes & Prompt Context (Multi‑Phase)**

> **Status Note (2025-12-02)**  
> The relationship system is now fully stat-based. Any references in this file to `GameSession.relationships[...]` should be read as `GameSession.stats["relationships"][...]`. See Tasks 107, 111, and 112 for the current architecture.

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document**, not the primary specification.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/systems/generation/GENERATION_SYSTEM.md` (generation system)  
>   - `docs/INTIMACY_AND_GENERATION.md` (intimacy/social context)  
>   - `docs/RELATIONSHIPS_AND_ARCS.md` (relationship data conventions).
> - When editing social‑context logic, keep `packages/types/src/generation.ts`, `packages/game/engine/src/relationships/socialContext.ts`, `packages/game/engine/src/generation/*`, and backend generation APIs in sync.
> - Use the phase checklist below to coordinate work and record what’s done (with notes and file paths).

**Context**
- Relationships and intimacy are already modeled via:
  - `GameSession.relationships["npc:X"].tierId` and `intimacyLevelId`.
  - Per‑world schemas in `GameWorld.meta.relationship_schemas` and `intimacy_schema`.
- The dynamic generation system is defined in:
  - `packages/types/src/generation.ts` (`GenerationNodeConfig`, `GenerateContentRequest/Response`, etc.).
  - `docs/systems/generation/GENERATION_SYSTEM.md` and `docs/GENERATION_PIPELINE_REFACTOR_PLAN.md`.
- Generation Nodes are used to request content (e.g. transitions, clips) via a backend generation service with clear data contracts.
- As we add **relationship preview APIs** (Task 07) and **social metrics** (Task 08), we want:
  - A consistent way to **inject intimacy/relationship context** into `GenerationNodeConfig` and `GenerateContentRequest`.
  - Clear **content rating / safety rails** so more intense content is explicitly gated and predictable.
  - A stable “follow‑along” so changes in relationship/intimacy metrics don’t silently change how generation requests are constructed.

This task defines phases for integrating intimacy and relationship state into the generation data model and tooling, without hardcoding explicit prompts in core code.

> **For agents:** Keep this task focused on structure and controls (context objects, ratings, config), not on writing explicit prompt strings. Wire into the existing generation types and pipeline, and rely on backend/template layers for actual prompt text.

### Phase Checklist

- [x] **Phase 1 – Audit Intimacy Usage & Generation Integration Points**
- [x] **Phase 2 – Define `GenerationSocialContext` in `generation.ts`**
- [x] **Phase 3 – Map Relationship Metrics + `GenerationSocialContext`**
- [x] **Phase 4 – World‑Level Generation Style & Rating Config**
- [x] **Phase 5 – Wire Social Context into `GenerateContentRequest`** (Reference implementation)
- [x] **Phase 6 – Editor Integration for Generation Nodes** (Reference UI components)
- [x] **Phase 7 – Consent, Gating, and User Preferences**
- [x] **Phase 8 – Validation & Guardrails in Generation Validator**
- [x] **Phase 9 – Regression Anchors & Tests**
- [x] **Phase 10 – Docs & App Map Updates**

---

## Implementation Summary (Completed 2025‑11‑19)

All 10 phases have a reference implementation in place. This section summarizes what exists so future work can integrate with it rather than re‑inventing pieces.

### Phases 1–2: Foundation
- **Audit**: Documented integration points between intimacy/relationships and generation.
- **Types**: `GenerationSocialContext` interface in `packages/types/src/generation.ts`.

### Phases 3–4: Core Logic
- **Social Context Builder**: `buildGenerationSocialContext()` in `packages/game/engine/src/relationships/socialContext.ts`.
- **World Config**: `WorldGenerationConfig` type and helpers in `packages/game/engine/src/world/generationConfig.ts`.

### Phases 5–6: Request Building & UI
- **Request Builder**: `buildGenerateContentRequest()` in `packages/game/engine/src/generation/requestBuilder.ts`.
- **UI Components**: `SocialContextPanel` in `apps/main/src/components/generation/SocialContextPanel.tsx`.

### Phases 7–8: User Control & Safety
- **User Preferences**: `UserContentPreferences` type and helpers in `packages/game/engine/src/user/contentPreferences.ts`.
- **Validation**: `validateGenerationNode()` and related helpers in `packages/game/engine/src/generation/validator.ts`.

### Phases 9–10: Testing & Documentation
- **Tests**: Comprehensive test suite in `packages/game/engine/src/__tests__/generation-social-context.test.ts`.
- **Documentation**: Detailed guide in `docs/INTIMACY_AND_GENERATION.md`.

### Key Files
- `packages/types/src/generation.ts` – `GenerationSocialContext`, `GenerateContentRequest`, `GenerationNodeConfig`.
- `packages/game/engine/src/relationships/socialContext.ts` – social context mapping logic.
- `packages/game/engine/src/generation/requestBuilder.ts` – request construction + social context.
- `packages/game/engine/src/generation/validator.ts` – validation and guardrails.
- `packages/game/engine/src/user/contentPreferences.ts` – user rating preferences.
- `apps/main/src/components/generation/SocialContextPanel.tsx` – editor UI for social context.

---

**Related Docs & Files**

- Docs:  
  - `docs/systems/generation/GENERATION_SYSTEM.md` – generation system design  
  - `docs/INTIMACY_AND_GENERATION.md` – intimacy/social context integration  
  - `docs/RELATIONSHIPS_AND_ARCS.md` – relationship/session conventions
- Backend:  
  - `pixsim7/backend/main/domain/generation.py`  
  - `pixsim7/backend/main/services/generation/generation_service.py`
- Game-core / Types:  
  - `packages/types/src/generation.ts`  
  - `packages/game/engine/src/relationships/socialContext.ts`  
  - `packages/game/engine/src/generation/requestBuilder.ts`  
  - `packages/game/engine/src/generation/validator.ts`
