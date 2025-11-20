**Task: Registry Unification & Built-in Dogfooding**

> **For Agents (How to use this file)**
> - This task unifies registration patterns so core features use the same plugin infrastructure they offer to plugins.
> - Philosophy: "If a plugin could do X, core should use the same pathway when doing X built-in."
> - Read these first:
>   - `pixsim7_backend/infrastructure/plugins/behavior_registry.py` – central registry
>   - `pixsim7_backend/domain/behavior/conditions.py` – hardcoded if/elif chain
>   - `pixsim7_backend/domain/game/ecs.py` – hardcoded COMPONENT_SCHEMAS
>   - `packages/game-core/src/world/gameProfile.ts` – hardcoded behavior profiles
>   - `docs/TASK_TRACKING_OVERVIEW.md` (Architectural Analysis section) – detailed rationale

---

## Context

**Problem:** Core systems bypass the excellent plugin infrastructure:
- Built-in conditions use if/elif chain instead of registry lookup
- Core ECS components bypass `behavior_registry.register_component_schema()`
- Behavior profiles hardcoded in switch statements

**Goal:** Make core features "dogfood" the plugin APIs, creating uniform code paths and true extensibility.

---

## Phase Checklist

- [ ] **Phase 27.1 – Registry-ify Built-in Conditions**
- [ ] **Phase 27.2 – Unify Component Registration**
- [ ] **Phase 27.3 – Data-Driven Behavior Profiles**
- [ ] **Phase 27.4 – Testing & Documentation**

---

## Phase 27.1 – Registry-ify Built-in Conditions

**Goal**
Replace if/elif chain with registry lookup in `conditions.py`.

**Key Steps**

1. Create `BUILTIN_CONDITIONS` dict mapping condition types to evaluator functions
2. Refactor `evaluate_condition()` to check built-in registry first, then plugin registry
3. Remove 40+ line if/elif chain

**File:** `pixsim7_backend/domain/behavior/conditions.py`

**Status:** ☐ Not started

---

## Phase 27.2 – Unify Component Registration

**Goal**
Register core ECS components through `behavior_registry` like plugins do.

**Key Steps**

1. Remove hardcoded `COMPONENT_SCHEMAS` dict from `ecs.py` (lines 61-69)
2. Add `register_core_components()` function called during app startup
3. Update `ecs.py` helpers to query `behavior_registry.get_component_schema()`

**Files:**
- `pixsim7_backend/domain/game/ecs.py`
- `pixsim7_backend/main.py` (or startup module)

**Status:** ☐ Not started

---

## Phase 27.3 – Data-Driven Behavior Profiles

**Goal**
Allow worlds to define custom behavior profiles in metadata.

**Key Steps**

1. Convert `BUILTIN_BEHAVIOR_PROFILES` to data structure
2. Refactor `getDefaultScoringWeights()` to lookup from world metadata first, then built-ins
3. Update world schema to support `meta.behavior.behaviorProfiles`

**File:** `packages/game-core/src/world/gameProfile.ts`

**Status:** ☐ Not started

---

## Phase 27.4 – Testing & Documentation

**Goal**
Verify unified registration and document the pattern.

**Key Steps**

1. Test built-in conditions work via registry
2. Test component registration order (core before plugins)
3. Test custom behavior profiles in world metadata
4. Update docs: `behavior_system/README.md`, `RELATIONSHIPS_AND_ARCS.md`

**Status:** ☐ Not started

---

## Success Criteria

- Built-in conditions use same registry lookup as plugin conditions
- Core ECS components register through `behavior_registry` at startup
- Behavior profiles definable in world metadata
- No breaking changes to existing data
- Uniform code paths for core and plugins

**Key principle:** "If a plugin could do X, core uses the same pathway."
