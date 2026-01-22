**Task: NPC Brain Hardcoding Cleanup & BrainState API Hardening**

**Status:** completed  
**Area:** BrainState consumers (frontend + mock core), API surface hygiene  
**Related work:**  
- `claude-tasks/19-npc-brain-derivations-and-toolkits.md`  
- `packages/shared/types/src/brain.ts`  
- `apps/main/src/components/shapes/BrainShape.tsx`  
- `apps/main/src/components/examples/BrainShapeExample.tsx`  
- `apps/main/src/lib/core/mockCore.ts`  
- `apps/main/src/plugins/brainTools/*`  

---

## Background

The brain system has recently been consolidated around a data-driven `BrainState`:

- Backend: `BrainEngine` + stat/derivation packages compute `BrainState` and derived values (mood, logic strategies, instincts, memories, etc.).
- Shared types: `packages/shared/types/src/brain.ts` provides the canonical `BrainState` shape and helpers (`getMood`, `getAxisValue`, `getLogicStrategies`, `getInstincts`, `getMemories`, etc.).
- Frontend: `PixSim7Core.getNpcBrainState`, `NpcBrainLab`, `SimulationPlayground`, brain tools, `BrainShape`, and `BrainShapeExample` now use `BrainState`.

During the migration, some **UI/mocks** still rely on:

- Direct string keys on `brain.stats`/`brain.derived` (e.g., `'relationships'`, `'persona_tags'`, `'relationship_flags'`) without going through helpers.
- Ad hoc fallback values or visual logic in React components rather than via a uniform helper surface.

The backend remains data-driven; the hardcoding is mostly in **frontend and mock layers**. This task aims to make those layers consume `BrainState` via a small, well-defined API and reduce scattered magic strings.

---

## Goals

1. **Minimize raw string access** to `brain.stats[...]` and `brain.derived[...]` in UI/mocks where helpers exist or make sense.
2. **Centralize common interpretations** of `BrainState` into helpers in `packages/shared/types/src/brain.ts` (or small adjacent utilities), not individual components.
3. **Clean up visual/behavioral hardcoding** in BrainShape/BrainShapeExample where better abstractions now exist (e.g., use derived helpers instead of manual derived keys).
4. Keep the backend brain/stat/derivation system **unchanged and data-driven**; this task is about consumers, not the engine.

---

## Scope

In scope:

- Frontend code that renders or inspects NPC brain state:
  - `apps/main/src/components/shapes/BrainShape.tsx`
  - `apps/main/src/components/examples/BrainShapeExample.tsx`
  - Brain tools under `apps/main/src/plugins/brainTools/*`
  - World tools that construct or inspect BrainState-like data (`npcBrainDebug`).
- Mock core and any brain-related preview helpers:
  - `apps/main/src/lib/core/mockCore.ts`

Out of scope:

- Backend `BrainEngine`, stat packages, and derivation definitions (already data-driven).

---

## Implementation Phases

### Phase 1 – Audit helpers vs. direct key usage

**Goal:** Identify all places where UI/mocks are using bare strings instead of helpers.

**Key Steps:**

1. Scan for direct `brain.stats[...]` and `brain.derived[...]` usage in:
   - `BrainShape.tsx`
   - `BrainShapeExample.tsx`
   - `apps/main/src/plugins/brainTools/*`
   - `apps/main/src/plugins/worldTools/npcBrainDebug.tsx`
   - `apps/main/src/lib/core/mockCore.ts`
2. Categorize each usage:
   - **Expected core keys** (e.g., `'personality'`, `'relationships'`, `'mood'`) that are part of the BrainState contract.
   - **Derived keys with helpers** (e.g., `'mood'`, `'conversation_style'`, `'logic_strategies'`, `'instincts'`, `'memories'`) where a helper now exists.
   - **Custom/experimental keys** that should stay as raw access (e.g., world-specific or tool-specific derived values).
3. Update `claude-tasks/19-npc-brain-derivations-and-toolkits.md` or this file with a short list of “blessed” keys vs. “helper-backed” keys.

Deliverable: A clear map of where we can replace raw key access with helpers.

---

### Phase 2 – Expand and refine helper APIs

**Goal:** Ensure `packages/shared/types/src/brain.ts` exposes helpers for all common concepts that UIs care about.

**Key Steps:**

1. Confirm existing helpers:
   - `getMood`, `getBehaviorUrgency`, `getConversationStyle`
   - `getAxisValue`, `getAxisTier`, `hasStat`, `hasDerived`, `getDerived`
   - `getLogicStrategies`, `getInstincts`, `getMemories`, `BrainMemory`
2. Add small targeted helpers where still missing:
   - Example ideas (to be validated by the Phase 1 audit):
     - `getPersonalityTraits(brain): Record<string, number>`
     - `getPersonaTags(brain): string[]`
     - `getRelationshipSnapshot(brain)` to encapsulate access to `'relationships'` axes and tier/levels.
3. Document in JSDoc that these helpers are the preferred access path for the UI, with a fallback to `getDerived`/`hasDerived` for custom tools.

Deliverable: A compact, documented helper surface that covers the fields commonly used by Brain Lab and debug tools.

---

### Phase 3 – Update BrainShape and BrainShapeExample

**Goal:** Make BrainShape and the example component rely primarily on helpers and minimal, well-defined keys.

**Key Steps:**

1. `apps/main/src/components/shapes/BrainShape.tsx`:
   - Confirm that the **behavior functions** already use BrainState stats (`'mood'`, `'relationships'`) appropriately.
   - For the per-face “item counts”:
     - Use helpers where available (e.g., `getMemories`, `getLogicStrategies`, `getInstincts`).
     - For core stats like `'personality'` and `'relationships'`, keep direct access but consider small wrapper helpers if repetition grows.
2. `apps/main/src/components/examples/BrainShapeExample.tsx`:
   - Replace `getDerived('logic_strategies' | 'instincts' | 'memories')` usage with `getLogicStrategies`, `getInstincts`, and `getMemories` respectively.
   - For persona tags and relationship flags, consider `getPersonaTags` / `getRelationshipSnapshot` helpers (Phase 2), or at least centralize the string keys at the top of the file as constants.
   - Clean up any remaining placeholder or garbled fallback strings in the status bar (e.g., replace odd glyphs with `'—'` or a clear fallback).

Deliverable: BrainShape + BrainShapeExample use helpers for higher-level concepts and only a small, explicit set of stat keys.

---

### Phase 4 – Align mock core with helper expectations

**Goal:** Ensure `MockPixSim7Core` produces BrainState data consistent with helper semantics and backend derivations.

**Key Steps:**

1. Review `apps/main/src/lib/core/mockCore.ts`:
   - Verify that the keys it populates in `derived` match what helpers expect:
     - `'mood'`, `'persona_tags'`, `'conversation_style'`, `'logic_strategies'`, `'instincts'`, `'memories'`, `'intimacy_level'`, `'relationship_flags'`.
   - Adjust any value scales (e.g., ensure mood valence/arousal are 0–100 to match the shared `DerivedMood` semantics).
2. Where applicable, reuse the same heuristic logic as backend derivation plugins for mock data, or at least keep them consistent in shape/range.
3. Optionally, centralize mock derivation formulas into small functions that mirror backend derivations for easier maintenance.

Deliverable: Mock brain states behave like “real” BrainState data as far as helpers and UIs are concerned.

---

### Phase 5 – World/debug tools and custom consumers

**Goal:** Bring world tools and debug plugins in line with the helper-based access pattern, while still allowing custom derived values.

**Key Steps:**

1. Update `apps/main/src/plugins/worldTools/npcBrainDebug.tsx`:
   - Where it inspects BrainState derived values (mood, conversation style, persona tags, intimacy), use the helpers rather than raw `getDerived` where possible.
   - Keep `getDerived` for truly ad hoc derived keys, but prefer named helpers for canonical concepts.
2. Review other brain consumers (if any) for similar patterns and adjust.

Deliverable: All “official” brain UIs (Brain Lab tools, world debug tools, example components) follow the same helper-first access pattern.

---

## Acceptance Criteria

- **Helpers-first:** For core brain concepts (mood, personality traits, persona tags, logic strategies, instincts, memories, conversation style, basic relationship snapshot), UIs use helpers rather than raw string keys wherever a helper exists.
- **Minimal magic strings:** Direct string access to `brain.stats[...]`/`brain.derived[...]` is limited to a clearly documented set of keys and/or is wrapped in small localized helpers.
- **Mock consistency:** `MockPixSim7Core` emits BrainState data that matches helper semantics (shapes and value ranges) and doesn't rely on UI-local assumptions.
- **No backend changes:** BrainEngine, stat packages, and derivation configuration remain untouched; this task only adjusts consumers and shared helper APIs.
- **Docs updated:** A short note in `claude-tasks/19-npc-brain-derivations-and-toolkits.md` or a brief section in the NPC architecture docs explains the "helpers-first" pattern and lists the canonical helpers for BrainState.

---

## Implementation Summary

### New Helpers Added to `packages/shared/types/src/brain.ts`

Three new helpers were added to complete the helper API surface:

```typescript
// Get persona tags (e.g., "curious", "friendly")
getPersonaTags(brain: BrainState): string[]

// Get intimacy level (e.g., "light_flirt", "dating")
getIntimacyLevel(brain: BrainState): string | null

// Get relationship flags (e.g., "first_meeting", "helped_with_task")
getRelationshipFlags(brain: BrainState): string[]
```

### Complete Helper Reference

The following helpers are now available in `@pixsim7/shared.types`:

| Helper | Returns | Description |
|--------|---------|-------------|
| `getMood(brain)` | `DerivedMood \| undefined` | Mood valence/arousal/label |
| `getBehaviorUrgency(brain)` | `DerivedBehaviorUrgency` | Urgency scores for behaviors |
| `getConversationStyle(brain)` | `string` | Conversation style label |
| `getLogicStrategies(brain)` | `string[]` | Decision-making strategies |
| `getInstincts(brain)` | `string[]` | Base instincts/drives |
| `getMemories(brain)` | `BrainMemory[]` | Episodic memories |
| `getPersonaTags(brain)` | `string[]` | Personality-derived tags |
| `getIntimacyLevel(brain)` | `string \| null` | Relationship intimacy stage |
| `getRelationshipFlags(brain)` | `string[]` | Relationship event markers |
| `getAxisValue(brain, stat, axis, fallback)` | `number` | Specific axis value |
| `getAxisTier(brain, stat, axis)` | `string \| undefined` | Tier for an axis |
| `hasStat(brain, statDefId)` | `boolean` | Check if stat exists |
| `hasDerived(brain, key)` | `boolean` | Check if derived exists |
| `getDerived<T>(brain, key, fallback)` | `T` | Generic derived access |

### Files Updated

1. **`packages/shared/types/src/brain.ts`** - Added `getPersonaTags`, `getIntimacyLevel`, `getRelationshipFlags`
2. **`apps/main/src/components/shapes/BrainShape.tsx`** - Now uses `getLogicStrategies`, `getInstincts`, `getMemories`
3. **`apps/main/src/components/examples/BrainShapeExample.tsx`** - All inspectors now use helpers
4. **`apps/main/src/plugins/worldTools/npcBrainDebug.tsx`** - Uses `getPersonaTags`, `getIntimacyLevel`

### Remaining Direct Key Access (Acceptable)

The following direct `brain.stats[...]` access remains and is acceptable:

- `brain.stats['personality']` - Core stat snapshot for axes access
- `brain.stats['relationships']` - Core stat snapshot for axes access
- `brain.stats['mood']` - Core stat snapshot for axes access

These are **expected core keys** that are part of the BrainState contract. UI components need direct access to iterate over axes for rendering sliders/progress bars.

