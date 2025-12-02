**Task: Intimacy & Content Gating via Stat Definitions (No More Hardcoded Thresholds)**

> **For Agents (How to use this file)**
> - This task is about moving intimacy/content gating logic away from hardcoded affinity/chemistry thresholds in TS and towards stat-based configuration.
> - It should **not** change the abstract stat engine or the relationship stat definition shape; it only changes how frontend/game logic *reads* thresholds.
> - Keep this task independent from Task 107 (relationship stats cutover): 107 is storage/normalization; this task is runtime logic/config.

---

## Context & Motivation

Today, several frontend/game helpers encode intimacy and content gating rules directly in TypeScript, for example in:

- `apps/main/src/lib/intimacy/socialContextDerivation.ts`
- `apps/main/src/lib/game/interactions/persuade.ts`
- `apps/main/src/lib/game/interactions/sensualize.ts`

Patterns include:

- Hardcoded thresholds like “chemistry ≥ 70 and affinity ≥ 70” for “intense” intimacy.
- Minimum affinity checks like `if (affinity < config.minAffinityForSeduction) { ... }`.
- Fixed recommendation thresholds in `socialContextDerivation` for “romantic”, “mature”, “restricted” content.

These rules **mirror** the relationship/intimacy model, but sit outside the stat system, which makes it harder to:

- Swap in different relationship packages (e.g., more axes, different levels).
- Adjust intimacy thresholds per world/package, rather than per build.
- Keep behavior consistent between backend stat computation and frontend checks.

Given we now have a stat package system and a default relationship `StatDefinition` (Task 107 + stats work), we can start treating intimacy/content gating as **derived from stat definitions and/or package config**, not hardcoded numbers.

---

## Goals

- Remove **hardcoded intimacy thresholds** (affinity/chemistry/trust cutoffs) from TS helper logic where feasible.
- Introduce a small, stat-based configuration layer for intimacy/content gating that can:
  - Read thresholds from the `"relationships"` stat definition (tiers/levels), and/or
  - Use a lightweight world/package config block (e.g. `world.meta.intimacy_gating` or a stat package metadata structure).
- Keep the **user-facing behavior unchanged** by default (default thresholds match current logic).
- Do not introduce any new backend storage schemas; stick to existing JSON meta or stat package metadata.

Out of scope:

- Redesigning the intimacy model (axes, levels) beyond what the current stat definition already supports.
- Implementing host/world-level UIs for tuning these thresholds (can be future tasks).

---

## Phase Checklist

- [ ] **Phase 1 – Audit Intimacy & Gating Logic Call Sites**
- [ ] **Phase 2 – Design a Minimal Intimacy Gating Config Model**
- [ ] **Phase 3 – Implement a Shared Intimacy Gating Helper**
- [ ] **Phase 4 – Refactor TS Call Sites to Use Helper**
- [ ] **Phase 5 – Validate Behavior Parity & Document Usage**

---

## Phase 1 – Audit Intimacy & Gating Logic Call Sites

**Goal:** Collect all the places where intimacy/content gating uses hardcoded thresholds so later changes are comprehensive, not piecemeal.

**Status:** ✅ COMPLETED

### Found Hardcoded Thresholds:

#### 1. `apps/main/src/lib/intimacy/socialContextDerivation.ts`

**Function: `deriveIntimacyBandFromMetrics` (lines 96-124)**
- Line 108: `chemistry >= 70 && affinity >= 70` → "intense" band
- Line 113: `chemistry >= 50` → "deep" band
- Line 118: `chemistry >= 25 || affinity >= 60` → "light" band

**Function: `supportsContentRating` (lines 275-328)**
- Lines 305-307: Romantic requires `chemistry: 25, affinity: 40`
- Lines 310-313: Mature requires `chemistry: 50, affinity: 60, intimacyLevel: 'intimate'`
- Lines 316-319: Restricted requires `chemistry: 70, affinity: 70, intimacyLevel: 'very_intimate'`

#### 2. `apps/main/src/lib/game/interactions/persuade.ts`

**Default Config (lines 175-211)**
- Line 187: `minAffinityForSeduction: 30`
- Line 188: `minChemistryForSeduction: 20`

**Config Fields (lines 270-285)**
- Configurable thresholds but still hardcoded as defaults

**Runtime Checks (lines 558-589)**
- Lines 570-574: Affinity check against `config.minAffinityForSeduction`
- Lines 576-580: Chemistry check against `config.minChemistryForSeduction`
- Lines 583-589: Intimacy level check using `isIntimacyLevelAppropriate`

**Function: `isIntimacyLevelAppropriate` (lines 101-106)**
- Hardcoded list of appropriate levels for seduction

#### 3. `apps/main/src/lib/game/interactions/sensualize.ts`

**Default Config (line 56)**
- `minimumAffinity: 50`

**Runtime Checks**
- Lines 150-154: Affinity check against `config.minimumAffinity`
- Line 223: Availability check `affinity >= 50` (hardcoded)

---

## Phase 2 – Design a Minimal Intimacy Gating Config Model

**Goal:** Decide where intimacy/content gating config lives and how it relates to stat definitions, without changing behavior yet.

**Options (pick one, keep it simple):**

1. **Derived purely from StatDefinition (recommended starting point)**  
   - Use `"relationships"` `StatDefinition.levels` and/or tiers as the source of truth.
   - Example mapping:
     - `levelId` values like `light_flirt`, `deep_flirt`, `intimate`, `very_intimate` map to content gating categories.
     - Content gating checks test `currentRelationshipLevel` rather than raw affinity/chemistry numbers.

2. **Hybrid: StatDefinition + small per-world/package gating config**  
   - Keep `StatDefinition` for raw axes and levels.
   - Add a small config block (e.g. `world.meta.intimacy_gating` or stat package metadata) that maps content categories to:
     - Required relationship levels and/or
     - Additional numeric thresholds.

**Deliverables:**

- A short design note (either in this file or a small doc snippet) specifying:
  - Where config lives (world meta vs stat package metadata).
  - How content categories (romantic/mature/restricted/etc.) are derived from stat data.
  - How defaults map to existing hardcoded thresholds (for backwards behavior parity).

---

## Phase 3 – Implement a Shared Intimacy Gating Helper

**Goal:** Centralize gating logic in one place so all TS consumers share the same rules.

**Steps:**

- Add a helper module on the frontend, e.g.:
  - `apps/main/src/lib/intimacy/intimacyGating.ts`
- Expose functions such as:
  - `getIntimacyLevelFromStats(relState) -> "light_flirt" | "deep_flirt" | "intimate" | ... | null`
  - `canShowContentCategory(relState, category, config) -> boolean`
  - `getRecommendedMinimumsForCategory(category, config) -> { affinity?: number; chemistry?: number; ... }`
- The helper should:
  - Accept a relationship state object (preferably stat-based, e.g. with `levelId`).
  - Use the Phase 2 config model for decisions.
  - Provide sensible defaults that exactly replicate current behavior when no custom config is present.

**Constraints:**

- Do not introduce backend round-trips here; this is frontend logic derived from already-fetched session/relationship state and static config.

---

## Phase 4 – Refactor TS Call Sites to Use Helper

**Goal:** Replace hardcoded thresholds with calls into the shared gating helper, without changing behavior.

**Steps:**

- For each site identified in Phase 1:
  - Replace direct numeric comparisons (e.g. `if (chemistry >= 70 && affinity >= 70)`) with:
    - A call to `getIntimacyLevelFromStats` / `canShowContentCategory`, or
    - A call to `getRecommendedMinimumsForCategory` where appropriate.
  - Keep logs and UI messages intact where possible (only change the underlying check).
- Ensure that tests (if any) and manual behavior still align with existing expectations:
  - Same content categories unlocked for given affinity/chemistry/trust combinations.
  - Same gating messages/UX flows triggered.

---

## Phase 5 – Validate Behavior Parity & Document Usage

**Goal:** Confirm that behavior is unchanged by default and that the new config layer is documented for future use.

**Steps:**

- Add or update tests for the new helper:
  - Unit tests for `intimacyGating.ts` covering light/deep/intense cases.
  - Edge cases (borderline values) to ensure no off-by-one regressions.
- Update relevant docs:
  - `docs/RELATIONSHIPS_AND_ARCS.md` – mention that intimacy/content gating uses the relationship stat definition plus a small config layer.
  - If a stat package metadata model is used, briefly document it (or cross-link to a dedicated stat package doc).
- Note in this task file that Phase 5 is complete and that future worlds/packages can safely customize intimacy gating via config rather than TS edits.

---

## Notes

- This task is intentionally **frontend-focused** and configuration-driven. It does not change how stats are stored or normalized (that’s Task 107).
- When implementing, keep functions and types generic enough that other stat packages (e.g., a different relationship system) could plug in later with minimal changes.

