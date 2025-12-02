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

- [x] **Phase 1 – Audit Intimacy & Gating Logic Call Sites** ✅ COMPLETED
- [x] **Phase 2 – Design a Minimal Intimacy Gating Config Model** ✅ COMPLETED
- [x] **Phase 3 – Implement a Shared Intimacy Gating Helper** ✅ COMPLETED
- [x] **Phase 4 – Refactor TS Call Sites to Use Helper** ✅ COMPLETED
- [ ] **Phase 5 – Validate Behavior Parity & Document Usage** (Deferred - needs testing)

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

**Status:** ✅ COMPLETED

**Selected Approach:** Hybrid (StatDefinition + per-world gating config)

### Design Overview

#### 1. Config Location

**Primary:** `world.meta.intimacy_gating` (optional per-world config)
**Fallback:** Derived from `StatDefinition` levels in the relationships package

```typescript
// World meta structure (optional, falls back to defaults)
interface IntimacyGatingConfig {
  version: 1;

  // Intimacy band thresholds (derived from raw metrics)
  intimacyBands: {
    light: { chemistry?: number; affinity?: number };    // Default: chemistry >= 25 OR affinity >= 60
    deep: { chemistry?: number; affinity?: number };     // Default: chemistry >= 50
    intense: { chemistry?: number; affinity?: number };  // Default: chemistry >= 70 AND affinity >= 70
  };

  // Content rating gates (what's required for each rating)
  contentRatings: {
    romantic: {
      minimumBand?: 'light' | 'deep' | 'intense';       // Default: 'light'
      minimumChemistry?: number;                         // Default: 25
      minimumAffinity?: number;                          // Default: 40
      minimumLevel?: string;                             // Default: undefined (no level requirement)
    };
    mature_implied: {
      minimumBand?: 'light' | 'deep' | 'intense';       // Default: 'deep'
      minimumChemistry?: number;                         // Default: 50
      minimumAffinity?: number;                          // Default: 60
      minimumLevel?: string;                             // Default: 'intimate'
    };
    restricted: {
      minimumBand?: 'light' | 'deep' | 'intense';       // Default: 'intense'
      minimumChemistry?: number;                         // Default: 70
      minimumAffinity?: number;                          // Default: 70
      minimumLevel?: string;                             // Default: 'very_intimate'
    };
  };

  // Interaction-specific gates
  interactions: {
    seduction: {
      minimumAffinity?: number;                          // Default: 30
      minimumChemistry?: number;                         // Default: 20
      appropriateLevels?: string[];                      // Default: ['light_flirt', 'flirting', ...]
    };
    sensualTouch: {
      minimumAffinity?: number;                          // Default: 50
      minimumLevel?: string;                             // Default: undefined
    };
  };
}
```

#### 2. Default Values (Backwards Compatible)

These defaults exactly match current hardcoded behavior:

```typescript
const DEFAULT_INTIMACY_GATING: IntimacyGatingConfig = {
  version: 1,
  intimacyBands: {
    light: { chemistry: 25, affinity: 60 },              // chemistry >= 25 OR affinity >= 60
    deep: { chemistry: 50 },                             // chemistry >= 50
    intense: { chemistry: 70, affinity: 70 },            // chemistry >= 70 AND affinity >= 70
  },
  contentRatings: {
    romantic: {
      minimumBand: 'light',
      minimumChemistry: 25,
      minimumAffinity: 40,
    },
    mature_implied: {
      minimumBand: 'deep',
      minimumChemistry: 50,
      minimumAffinity: 60,
      minimumLevel: 'intimate',
    },
    restricted: {
      minimumBand: 'intense',
      minimumChemistry: 70,
      minimumAffinity: 70,
      minimumLevel: 'very_intimate',
    },
  },
  interactions: {
    seduction: {
      minimumAffinity: 30,
      minimumChemistry: 20,
      appropriateLevels: [
        'light_flirt', 'flirting', 'romantic_interest',
        'intimate', 'lovers', 'deep_bond'
      ],
    },
    sensualTouch: {
      minimumAffinity: 50,
    },
  },
};
```

#### 3. Integration with StatDefinition

The helper will:
1. **Read from world config** if `world.meta.intimacy_gating` exists
2. **Fall back to defaults** if not configured
3. **Use StatDefinition levels** for level-based checks (e.g., `intimacyLevelId`)
4. **Use raw metric values** for threshold checks (affinity, chemistry)

#### 4. Benefits

- **Config-driven**: Worlds can customize thresholds without code changes
- **Backwards compatible**: Defaults match existing behavior exactly
- **Stat-aware**: Integrates with StatDefinition levels from relationships package
- **Flexible**: Can gate by band, metrics, or intimacy level
- **Simple**: No backend changes, pure frontend config

---

## Phase 3 – Implement a Shared Intimacy Gating Helper

**Goal:** Centralize gating logic in one place so all TS consumers share the same rules.

**Status:** ✅ COMPLETED

**Implementation:** `apps/main/src/lib/intimacy/intimacyGating.ts`

### Exported Functions

1. **`getIntimacyGatingConfig(worldConfig?)`**
   - Merges world config with defaults
   - Returns complete config with all thresholds

2. **`deriveIntimacyBand(state, config?)`**
   - Determines intimacy band ('none' | 'light' | 'deep' | 'intense')
   - Uses configured thresholds instead of hardcoded values
   - Replaces `deriveIntimacyBandFromMetrics` in socialContextDerivation.ts

3. **`supportsContentRating(state, rating, config?)`**
   - Checks if relationship supports a content rating
   - Returns detailed feedback with reasons and suggested minimums
   - Replaces hardcoded checks in `supportsContentRating` (socialContextDerivation.ts)

4. **`getContentRatingRequirements(rating, config?)`**
   - Returns minimum requirements for a rating
   - Useful for showing users what they need to unlock

5. **`canAttemptSeduction(state, config?)`**
   - Checks if seduction interaction is available
   - Validates affinity, chemistry, and intimacy level
   - Replaces checks in persuade.ts

6. **`canAttemptSensualTouch(state, config?)`**
   - Checks if sensual touch interaction is available
   - Validates affinity and intimacy level
   - Replaces checks in sensualize.ts

### Key Features

- **Config-driven**: All thresholds read from config, not hardcoded
- **Backwards compatible**: Defaults exactly match existing behavior
- **Type-safe**: Full TypeScript types for config and return values
- **Detailed feedback**: Functions return reasons for failures and suggested minimums
- **No backend deps**: Pure frontend logic, no API calls

---

## Phase 4 – Refactor TS Call Sites to Use Helper

**Goal:** Replace hardcoded thresholds with calls into the shared gating helper, without changing behavior.

**Status:** ✅ COMPLETED

### Refactoring Checklist

#### 1. `apps/main/src/lib/intimacy/socialContextDerivation.ts`

**Lines 96-124: `deriveIntimacyBandFromMetrics`**
```typescript
// BEFORE:
function deriveIntimacyBandFromMetrics(metrics) {
  if (chemistry >= 70 && affinity >= 70) return 'intense';
  if (chemistry >= 50) return 'deep';
  if (chemistry >= 25 || affinity >= 60) return 'light';
  return 'none';
}

// AFTER:
import { deriveIntimacyBand } from './intimacyGating';

function deriveIntimacyBandFromMetrics(metrics) {
  // Use helper with default config
  return deriveIntimacyBand(metrics);
}
```

**Lines 275-328: `supportsContentRating`**
```typescript
// BEFORE:
Hard-coded switch cases with specific thresholds

// AFTER:
import { supportsContentRating as checkContentRating } from './intimacyGating';

export function supportsContentRating(state, rating) {
  return checkContentRating(state, rating);
}
```

#### 2. `apps/main/src/lib/game/interactions/persuade.ts`

**Lines 558-589: Seduction checks**
```typescript
// BEFORE:
if (affinity < config.minAffinityForSeduction) { ... }
if (chemistry < config.minChemistryForSeduction) { ... }
if (!isIntimacyLevelAppropriate(intimacyLevel)) { ... }

// AFTER:
import { canAttemptSeduction } from '@/lib/intimacy/intimacyGating';

const seductionCheck = canAttemptSeduction(relState);
if (!seductionCheck.allowed) {
  context.onError(seductionCheck.reason);
  return { success: false, message: seductionCheck.reason };
}
```

**Note:** Keep config fields (minAffinityForSeduction, etc.) for backwards compatibility,
but use them to build an IntimacyGatingConfig override

#### 3. `apps/main/src/lib/game/interactions/sensualize.ts`

**Lines 150-154 and 223: Affinity checks**
```typescript
// BEFORE:
if (currentAffinity < config.minimumAffinity) { ... }
// and
return affinity >= 50;

// AFTER:
import { canAttemptSensualTouch } from '@/lib/intimacy/intimacyGating';

const touchCheck = canAttemptSensualTouch(relState);
if (!touchCheck.allowed) {
  context.onError(touchCheck.reason);
  return { success: false, message: touchCheck.reason };
}
```

### Changes Made

#### 1. `apps/main/src/lib/intimacy/socialContextDerivation.ts` ✅
- **Added imports**: `deriveIntimacyBand`, `supportsContentRating`, types from `intimacyGating`
- **Refactored `deriveIntimacyBandFromMetrics`**: Now delegates to `deriveIntimacyBandFromGatingHelper`
- **Refactored `supportsContentRating`**: Now uses `checkContentRatingWithHelper`
- **Backwards compatible**: Added optional `config` parameter to both functions
- **Removed**: All hardcoded threshold constants (70/70, 50, 25/60, etc.)

#### 2. `apps/main/src/lib/game/interactions/persuade.ts` ✅
- **Added import**: `canAttemptSeduction`, `IntimacyGatingConfig` from `intimacyGating`
- **Refactored `executeSeduce`**: Builds `gatingConfig` from interaction config, uses `canAttemptSeduction` helper
- **Removed function**: `isIntimacyLevelAppropriate` (no longer needed)
- **Backwards compatible**: Config fields preserved, dynamically converted to gating config
- **Better error messages**: Now uses reason from helper

#### 3. `apps/main/src/lib/game/interactions/sensualize.ts` ✅
- **Added import**: `canAttemptSensualTouch`, `IntimacyGatingConfig` from `intimacyGating`
- **Refactored `execute`**: Uses `canAttemptSensualTouch` instead of direct affinity check
- **Refactored `isAvailable`**: Uses helper for gating instead of hardcoded `>= 50`
- **Backwards compatible**: Config fields preserved, dynamically converted to gating config
- **Removed**: Hardcoded affinity threshold (50)

### Testing Requirements

After refactoring each file:
1. **Manual testing**: Verify same behavior for various metric combinations
2. **Edge cases**: Test boundary values (e.g., chemistry = 50, affinity = 70)
3. **UI feedback**: Ensure error messages are still clear and helpful
4. **Config override**: Test that custom world configs work correctly

### Verification

All refactored functions:
- ✅ Use config-driven thresholds instead of hardcoded values
- ✅ Maintain backwards compatibility (same defaults)
- ✅ Support optional world config overrides
- ✅ Provide better error feedback with reasons
- ✅ Are type-safe with full TypeScript types

---

## Phase 5 – Validate Behavior Parity & Document Usage

**Goal:** Confirm that behavior is unchanged by default and that the new config layer is documented for future use.

**Status:** ⏳ PENDING (Requires manual testing)

### What's Needed

#### Testing
- [ ] **Unit tests** for `intimacyGating.ts`:
  - Test `deriveIntimacyBand` with various metric combinations
  - Test `supportsContentRating` for each rating level
  - Test `canAttemptSeduction` with different affinity/chemistry values
  - Test `canAttemptSensualTouch` with different affinity values
  - Test edge cases (boundary values: 25, 50, 60, 70)
  - Test config overrides work correctly

- [ ] **Integration testing** of refactored files:
  - Verify socialContextDerivation produces same results as before
  - Verify persuade.ts seduction checks behave identically
  - Verify sensualize.ts gating works as before
  - Test with custom world configs to ensure overrides work

#### Documentation
- [ ] Update `docs/RELATIONSHIPS_AND_ARCS.md`:
  - Document that intimacy/content gating is now config-driven
  - Explain `world.meta.intimacy_gating` structure
  - Show examples of customizing thresholds
  - Note backwards compatibility with existing worlds

- [ ] Add usage examples to task file showing:
  - Default behavior (no config)
  - Custom thresholds per world
  - How to adjust for different game types

### Notes for Future Work

Once Phase 5 is complete:
- Worlds can customize intimacy gating via `world.meta.intimacy_gating` without code changes
- All thresholds are centralized and config-driven
- Stat packages can provide their own default gating configs
- UI tools can be built to edit gating configs visually

---

## Notes

- This task is intentionally **frontend-focused** and configuration-driven. It does not change how stats are stored or normalized (that’s Task 107).
- When implementing, keep functions and types generic enough that other stat packages (e.g., a different relationship system) could plug in later with minimal changes.

