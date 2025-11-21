# Dynamic Generation System Foundation

> Handoff guide: Phased implementation plan, data contracts, editor integration strategy, backend API outline, validation & caching approach.

> **For Agents**
> - Treat this doc + `docs/INTIMACY_AND_GENERATION.md` + `docs/GENERATION_PIPELINE_REFACTOR_PLAN.md` as the **spec** for generation; backend `Generation`/`GenerationArtifact` models and `generation_service` are the authority.
> - When editing generation types or request shapes, keep `packages/types/src/generation.ts`, `packages/game-core/src/generation/*`, and backend generation APIs in sync.
> - Use `GenerationSocialContext` for relationship/intimacy‑aware behavior; don’t hand‑code prompt logic directly in the frontend.
> - Related tasks (roadmap/status):  
>   - `claude-tasks/09-intimacy-and-scene-generation-prompts.md`  
>   - `claude-tasks/10-unified-generation-pipeline-and-dev-tools.md`

---
## 1. Why This System
Static authored content struggles to cover pacing transitions, replay variability, and player-adaptive beats. A **Generation Node** encodes *intent + constraints* rather than fixed assets, delegating realization to a backend generation service. This enables:
- Smoother scene mood shifts (gap-fill transitions)
- Controlled replay variability (seeded variations)
- Player state adaptation (later phase)
- Extensible templates for common narrative patterns

Initial scope intentionally narrow: focus on **transition generation** between two authored scenes.

---
## 2. Phased Roadmap
| Phase | Scope | Key Outputs | Risk Level |
|-------|-------|-------------|------------|
| 1 (MVP) | Transition nodes only | Node type, config UI, sync generate endpoint (stub), cache key logic, fallback handling | Low |
| 2 | Validation + Async jobs | Rule validator, health panel, 202 + polling job flow, latency metrics | Medium |
| 3 | Variation + Templates | Variation generationType, template library, cost & latency telemetry | Medium |
| 4 | Adaptive Content | Player context integration, branching rule builder, versioned configs | High |
| 5 | Always-Fresh + Hybrid | Rate-limited ambient generation, hybrid fetch→generate fallback, budget dashboard | High |

Progression logic: Each phase adds one *horizontal* capability (e.g. async workflow, rule builder) and one *vertical* content type.

---
## 3. Core Concepts
**Generation Node**: Graph element representing a request for dynamic content. Holds purpose, style, duration, constraints, strategy, fallback.

**Generation Strategies**:
- `once` – generate once, reuse forever (stable asset)
- `per_playthrough` – deterministic within a playthrough seed
- `per_player` – personalized persistent variant
- `always` – no cache; fresh each call (rate-limit required later)

**Fallback Modes**:
- `default_content` – use pre-authored asset
- `skip` – jump cut to target scene smoothly
- `retry` – attempt N times with timeout
- `placeholder` – show loading/bridge placeholder

---
## 4. Data Model (Editor / Shared Types)
Implemented in `packages/types/src/generation.ts` and re-exported via `index.ts`.
Highlights:
- `GenerationNodeConfig` bundles style, duration, constraints, strategy, fallback.
- `GenerateContentRequest` / `GenerateContentResponse` define backend contract.
- `GenerationValidationResult` supports preflight linting.

Cache key pattern:
```
[type]|[purpose]|[fromSceneId]|[toSceneId]|[strategy]|[seed]|[version]
```
Skip seed for `once`; add playerId / playthroughId based on strategy.

---
## 5. React Flow Integration Plan
**Custom Node Component**:
- Icon 🎲 + status badge (green OK / yellow warnings / red errors / grey disabled)
- Quick stats: last latency, cost estimate, cache hits

**Side Panel Tabs**:
1. Purpose & Strategy
2. Style & Duration
3. Constraints & Rules
4. Fallback
5. Validation (auto + manual) & Test

**Actions**:
- Test Generation (calls backend, shows preview asset or dialogue)
- Invalidate Cache (bumps version or explicitly purges)
- Duplicate Node (clone config, new id, reset cacheKey)

**Validation Flow**:
- On config change: local synchronous rule checks
- Manual deeper validation: POST `/api/validate-generation-config`

**Edge Metadata (optional later)**: `GenerationEdgeMeta` for smart edges with `generate=true` flag.

---
## 6. Backend API Contract (Initial)
```
POST /api/generate-content
Request: GenerateContentRequest
Response (sync): GenerateContentResponse { status: "complete" }
```
Sync first (Phase 1) with stub returning mock asset; Phase 2 introduces async jobs:
```
POST /api/generate-content -> 202 { job_id }
GET  /api/generation-jobs/{job_id} -> GenerateContentResponse
```
Error & fallback codes examples:
- `GEN_TIMEOUT`
- `GEN_CONSTRAINT_FAIL`
- `GEN_PROVIDER_UNAVAILABLE`
- `GEN_EMPTY_OUTPUT`

Observability fields: `cost.tokens`, `cost.time_ms`, `deterministic` (seed honored), `quality_score` in metadata.

---
## 7. Caching & Determinism
Layers:
1. In-memory LRU (fast replays during session)
2. Redis (shared process cluster)
3. Object storage (S3/minio) for durable assets

Single-flight lock (Redis SETNX) to prevent stampedes on cache miss. Version changes invalidate prior cache entries optionally.

**Seed Sources**:
- `playthrough` – stable across one run (debug-friendly)
- `player` – personal persistent flavor
- `timestamp` – always fresh variant (non-deterministic)
- `fixed` – manual seed (regression tests)

---
## 8. Validation & Health Checks
Checks implemented locally first:
- Duration: `min <= target <= max`
- Constraints: `requiredElements` ∩ `avoidElements` = ∅
- Fallback: `defaultContentId` required if mode=`default_content`
- Strategy viability: `always` + asset type `video` → performance warning (Phase 2)
- Complexity score: (#rules + #requiredElements + range span) threshold
- Service availability: periodic `/api/health` ping
- Latency classification: maintain p95 per node; warn if > threshold (Phase 2 telemetry)

Health Panel aggregates node statuses + global warnings (too many always-fresh nodes, missing fallbacks).

---
## 9. Edge Cases & Mitigations
| Edge Case | Mitigation |
|-----------|------------|
| Generation timeout | Fallback path with deterministic skip / placeholder |
| Non-deterministic despite seed | Log seed drift; mark response non-deterministic; trigger investigation |
| High latency transitions | Pre-generate critical transitions at scene graph save time (future batch tool) |
| Cache stampede | Single-flight locking + backoff |
| Rule contradictions | Validator blocks save (hard error) |
| Cost spikes | Budget threshold; disable test button if exceeded |

---
## 10. Template Library (Phase 3+)
JSON definitions for reusable patterns:
```jsonc
{
  "id": "romantic_to_action_transition_v1",
  "generationType": "transition",
  "style": {"moodFrom": "romantic", "moodTo": "intense", "pacing": "medium", "transitionType": "gradual"},
  "duration": {"min": 15, "max": 45, "target": 30},
  "constraints": {
    "rating": "PG-13",
    "requiredElements": ["phone_ring", "kiss_callback"],
    "avoidElements": ["violence"],
    "contentRules": ["build_tension_gradually", "maintain_character_continuity"]
  },
  "strategy": "per_playthrough",
  "fallback": {"mode": "default_content", "defaultContentId": "transition_01", "timeoutMs": 4000},
  "enabled": true,
  "version": 1
}
```

---
## 11. Rule Builder DSL (Phase 3/4 Sketch)
```
IF player_choice.quest_accept == true
  THEN moodTo = "determined" pacing = "fast"
ELSE
  THEN moodTo = "reflective" pacing = "slow"
INCLUDE callback_to_scene("kiss")
DURATION 20-40s TARGET 30s
CONSTRAINT rating=PG-13 AVOID violence
```
Compiler converts DSL to `GenerationNodeConfig` overrides + validation warnings on unsupported combinations.

---
## 12. Observability & Metrics (Phase 2+)
Collected per generation:
- Latency (ms) | Cost tokens | Cache hit/miss | Deterministic flag
- Quality score (model-provided or heuristic)
- Error codes frequency distribution
Export Prometheus-style metrics + attach to node health.

---
## 13. Initial Implementation Tasks (Phase 1 Checklist)
- [ ] React Flow custom node component & side panel skeleton
- [ ] Type definitions (DONE in `generation.ts`)
- [ ] Local validator util (rules above)
- [ ] Cache key compute function (stub returning placeholder hashed string)
- [ ] Backend stub for `/api/generate-content` returning mock deterministic payload
- [ ] Test Generation button hooking stub
- [ ] Fallback simulation (force timeout button for manual QA)

---
## 14. Definition of Done (Phase 1)
1. Node can be added & configured without errors.
2. Validation surfaces warnings & blocks contradictions.
3. Test Generation returns mock asset < 2s.
4. Cache key stable across identical config + playthrough.
5. Fallback path demonstrably works when generation forced to fail.

---
## 15. Future Extensions
- Pre-generation batch warm-up tool
- A/B variation testing harness
- Quality review workflow (human scoring loops back into selection)
- Adaptive difficulty modulation via generation constraints
- Multi-provider fallback chain (ProviderA → ProviderB → default)

---
## 16. Risks & Early Guardrails
| Risk | Guardrail |
|------|-----------|
| Unbounded cost | Node-level cost budget + global cap |
| Designer confusion | Clear visual distinction dynamic vs static nodes |
| Latency spikes | Pre-warm high-traffic transitions |
| Version drift | Explicit config version + invalidation mechanics |
| Over-complex rules | DSL linter + suggestion engine |

---
## 17. Handoff Notes
- Types ready for consumption (`@pixsim7/types` once build updated).
- Add util module later: `packages/ui/src/generation/cacheKey.ts` for key logic.
- Backend stub can live in `pixsim7/backend/main/api/generation.py` (FastAPI) or equivalent.
- Keep Phase 1 strictly synchronous; no job queue yet.

---
## 18. Next Immediate Actions (Suggested)
1. Implement React Flow node shell + panel.
2. Stub backend endpoint returning mock `GeneratedContentPayload` (video URL placeholder).
3. Build local validator & integrate with panel save cycle.
4. Add cache key compute function stub & display.
5. Provide scripted test scenario (three scenes bridged by one transition Generation Node).

---
**Contact / Ownership**: Scene Editor / Generation Pipeline squad.

**Revision**: v1.0 (Foundation)

---
