**Task: Extensible Scoring & Simulation Configuration**

> **For Agents (How to use this file)**
> - This task enables plugins and worlds to extend core game systems (scoring factors, simulation tiers).
> - Allows true modding: plugins can add "weather preference", "social fatigue", etc. to NPC behavior.
> - Read these first:
>   - `pixsim7_backend/domain/behavior/scoring.py` – 8 hardcoded scoring factors
>   - `packages/game-core/src/world/gameProfile.ts` – hardcoded tier limits per style
>   - `pixsim7_backend/infrastructure/plugins/behavior_registry.py` – registry infrastructure
>   - `docs/TASK_TRACKING_OVERVIEW.md` (Architectural Analysis section) – detailed rationale

---

## Context

**Problem:**
- Scoring system locked to 8 hardcoded factors – plugins can't add dimensions
- Simulation tier limits hardcoded per GameStyle – can't override per-world

**Goal:** Enable plugins to extend scoring and allow worlds to fine-tune simulation without code changes.

---

## Phase Checklist

- [ ] **Phase 28.1 – Pluggable Scoring Factors**
- [ ] **Phase 28.2 – Per-World Simulation Tier Overrides**
- [ ] **Phase 28.3 – Custom GameStyle Definitions**
- [ ] **Phase 28.4 – Plugin Integration & Examples**
- [ ] **Phase 28.5 – Testing & Validation**

---

## Phase 28.1 – Pluggable Scoring Factors

**Goal**
Refactor scoring to use factor registry so plugins can add dimensions.

**Key Steps**

1. Create `SCORING_FACTORS` registry in `scoring.py`
2. Refactor `calculate_activity_score()` to iterate over registered factors
3. Add `register_scoring_factor()` function for plugins
4. Register 8 existing factors as built-ins during module load

**File:** `pixsim7_backend/domain/behavior/scoring.py`

**Benefits:** Plugins can add "weather preference", "social fatigue", "time pressure" factors

**Status:** ☐ Not started

---

## Phase 28.2 – Per-World Simulation Tier Overrides

**Goal**
Check world metadata before style defaults for simulation tier limits.

**Key Steps**

1. Define `STYLE_DEFAULT_TIER_LIMITS` as data structure
2. Refactor `getSimulationTierLimits()` to check `world.meta.simulationConfig.tierLimits` first
3. Fall back to style defaults if no override
4. Update world schema to support tier limit overrides

**File:** `packages/game-core/src/world/gameProfile.ts`

**Status:** ☐ Not started

---

## Phase 28.3 – Custom GameStyle Definitions

**Goal**
Allow plugins/worlds to define new game styles beyond life_sim/visual_novel/hybrid.

**Key Steps**

1. Change `GameStyle` type to allow string extensions: `type GameStyle = CoreGameStyle | string`
2. Add `registerGameStyle()` function with validation
3. Store custom style configs in global registry
4. Update helpers to fall back to defaults for unknown styles

**Files:**
- `packages/types/src/game.ts`
- `packages/game-core/src/world/gameProfile.ts`

**Trade-off:** Lose some type safety for extensibility

**Status:** ☐ Not started

---

## Phase 28.4 – Plugin Integration & Examples

**Goal**
Provide examples and integrate with plugin system.

**Key Steps**

1. Add scoring factor registration to `BehaviorExtensionAPI`
2. Create example plugin adding "weather_preference" scoring factor
3. Document scoring factor signature and registration process
4. Add example world with custom tier limits and behavior profile

**Status:** ☐ Not started

---

## Phase 28.5 – Testing & Validation

**Goal**
Verify extensibility works and doesn't break existing systems.

**Key Steps**

1. Test plugin-registered scoring factors affect activity selection
2. Test per-world tier overrides apply correctly
3. Test custom game styles work with defaults
4. Verify backward compatibility (existing worlds/sessions work)
5. Performance test (ensure factor iteration doesn't slow scoring)

**Status:** ☐ Not started

---

## Success Criteria

- Plugins can register custom scoring factors via `behavior_registry`
- Worlds can override simulation tier limits in metadata
- Custom game styles can be defined without code changes
- Existing scoring behavior unchanged (same 8 factors by default)
- Example plugin demonstrating scoring factor extension
- Documentation for plugin authors

**Key unlock:** True modding capability – plugins can extend core game mechanics, not just add content.
