# @shared/types Migration Plan

**Status:** Draft
**Created:** 2025-12-14
**Goal:** Move feature-specific types from `@shared/types` to appropriate `@features/*` modules

---

## Executive Summary

**Current State:**
`@shared/types` contains 18 type modules, many of which are feature-specific and should live in `@features/*`.

**Impact:**
- Only **4 files** in main app directly import from `@shared/types`
- Only **6 total import statements** need updating
- Most types are re-exported through `@lib/registries` or feature barrels

**Recommendation:**
Migrate feature-specific types in phases, starting with clear-cut cases.

---

## File-by-File Audit

### ✅ KEEP in @shared/types (Cross-Cutting Contracts)

| File | Reason | Used By |
|------|--------|---------|
| **ids.ts** | Core ID types used everywhere | All features, API layer |
| **game.ts** | API DTOs (GameSessionDTO, LocationDTO, etc.) | Backend contract, multiple features |
| **brain.ts** | Brain state model used across features | brainTools, interactions, worldTools |
| **characterGraph.ts** | Character identity system (cross-cutting) | Multiple features, backend |
| **userPreferences.ts** | User settings contract | Settings, multiple features |
| **assetProvider.ts** | Asset system types (cross-cutting) | Generation, gallery, multiple features |
| **interactions.ts** | ✨ Canonical interaction contract (surfaces, gating, branch intents) | Multiple features, backend |

**Total:** 7 files stay ✅

**Why interactions.ts stays:**
- Used across multiple features (not just @features/interactions)
- Defines core interaction model (surfaces, gating, outcomes)
- Backend contract type
- Cross-cutting concern like game.ts and brain.ts

---

### 🔄 MOVE to @features (Feature-Specific)

#### → @features/graph

| File | Reason | Migration Complexity |
|------|--------|---------------------|
| **arcNodeTypes.ts** | Arc graph node registration | Low - only used by graph feature |
| **builtinNodeTypes.ts** | Scene node type definitions | Low - graph-specific |
| **nodeTypeRegistry.ts** | Node type registry system | Medium - re-exported via @lib/registries |
| **npcResponseNode.ts** | NPC response node type | Low - graph editor specific |

**Destination:** `apps/main/src/features/graph/lib/nodeTypes/`

**Exports:**
```typescript
// @features/graph/index.ts
export * as NodeTypes from './lib/nodeTypes';
export { nodeTypeRegistry } from './lib/nodeTypes/registry';
```

---

#### → @features/generation

| File | Reason | Migration Complexity |
|------|--------|---------------------|
| **generation.ts** | Generation config & social context | Low - generation-specific |

**Destination:** `apps/main/src/features/generation/lib/types.ts`

**Note:** `GenerationId` type stays in `@shared/types/ids.ts` (already there)

---

#### → @features/interactions (with Intimacy sub-module)

**Architecture Decision:** Intimacy is a specialized extension of interactions, not a separate concern.

| File | Destination | Reason |
|------|-------------|--------|
| **intimacy.ts** | `lib/intimacy/types.ts` | Relationship gating, content rating, progression arcs |
| **intimacyNodeTypes.ts** | `lib/intimacy/nodeTypes.ts` | Intimacy-specific node type registrations |

**Note:** `interactions.ts` STAYS in `@shared/types` - it's a cross-cutting contract used by multiple features.

**New Structure:**
```
@features/interactions/
├── lib/
│   ├── types.ts              ← Interaction UI types (local)
│   └── intimacy/             ← NEW: Intimacy specialization
│       ├── types.ts          ← From @shared/types/intimacy.ts
│       └── nodeTypes.ts      ← From @shared/types/intimacyNodeTypes.ts
└── index.ts                  ← Export both: core types + Intimacy namespace
```

**Exports:**
```typescript
// @features/interactions/index.ts
export * as Intimacy from './lib/intimacy';

// Usage
import { Intimacy } from '@features/interactions';
const gate: Intimacy.RelationshipGate = { /* ... */ };
```

---

#### → @features/gizmos

| File | Reason | Migration Complexity |
|------|--------|---------------------|
| **npcZones.ts** | Body map interactive zones (ticklishness, pleasure, tool effectiveness) | Low - Already used by BodyMapGizmo |
| **npcZoneTracking.ts** | Zone tracking across video segments | Low - Body map feature-specific |

**Destination:** `apps/main/src/features/gizmos/lib/bodyMap/types.ts`

**Context:** These types define clickable zones on NPC body maps for interaction tools (feathers, brushes, etc.). Used by `BodyMapGizmo.tsx` component.

---

#### → TBD (Need Feature Module?)

| File | Reason | Migration Complexity |
|------|--------|---------------------|
| **narrative.ts** | Narrative program schema (dialogue trees, action blocks, scene transitions) | Medium - Substantial standalone system |

**Options:**
1. Create `@features/narrative` - Narrative is a complete system with its own runtime
2. Move to `@features/scene` - If narrative is primarily scene-focused
3. Keep in `@shared/types` temporarily - If used across many features

---

## Migration Impact Analysis

### Current Imports (Main App)

```bash
# Only 4 files import from @shared/types:
apps/main/src/lib/api/game.ts          → IDs
apps/main/src/lib/api/interactions.ts  → IDs
apps/main/src/lib/api/generations.ts   → GenerationId
apps/main/src/lib/core/types.ts        → Brain types
```

✅ **All of these should stay in @shared/types** (cross-cutting)

### Re-exports via @lib/registries

```typescript
// apps/main/src/lib/registries.ts currently exports:
export { nodeTypeRegistry } from '@pixsim7/shared.types';
export type { NodeTypeDefinition, PortDefinition } from '@pixsim7/shared.types';
```

**After migration:**
```typescript
export { nodeTypeRegistry } from '@features/graph';
export type { NodeTypeDefinition, PortDefinition } from '@features/graph';
```

---

## Migration Phases

### Phase 1: Low-Risk Moves (Week 1)

**Target:** Files with no dependencies, used by single feature

1. `intimacyNodeTypes.ts` → `@features/intimacy/lib/nodeTypes.ts`
2. `npcResponseNode.ts` → `@features/graph/lib/nodeTypes/npcResponse.ts`
3. `generation.ts` → `@features/generation/lib/types.ts`

**Impact:** ~0-2 import updates per file

**Validation:**
```bash
pnpm run build      # Ensure all packages build
pnpm run lint       # Check for import errors
```

---

### Phase 2: Medium-Risk Moves (Week 2)

**Target:** Files re-exported via barrels

1. `arcNodeTypes.ts` → `@features/graph/lib/nodeTypes/arc.ts`
2. `builtinNodeTypes.ts` → `@features/graph/lib/nodeTypes/builtin.ts`
3. `nodeTypeRegistry.ts` → `@features/graph/lib/nodeTypes/registry.ts`

**Required Updates:**
- Update `@lib/registries.ts` re-exports
- Update any direct imports (likely 0-1 files)

**Migration Script:**
```typescript
// Automated codemod (optional)
// Find: import { nodeTypeRegistry } from '@pixsim7/shared.types'
// Replace: import { nodeTypeRegistry } from '@features/graph'
```

---

### Phase 3: Remaining Moves (Week 3)

**Target:** Clear homes identified

1. `npcZones.ts` + `npcZoneTracking.ts` → `@features/gizmos/lib/bodyMap/types.ts`
   - Already used by `BodyMapGizmo` component
   - Body map interaction system (zones, tools, tracking)

2. `narrative.ts` → `@features/narrative/lib/types.ts` ✅ **Confirmed**
   - Create new `@features/narrative` module
   - Dialogue trees, action blocks, scene transitions

3. Additional cleanup:
   - Option A: Create `@features/narrative` (recommended if standalone)
   - Option B: Merge with `@features/scene`
   - Option C: Keep in `@shared/types` if widely used

**Decision Point:**
- Does narrative warrant its own feature module? (Likely yes - it's substantial)

---

## Namespace Opportunities (Post-Migration)

After types are in the right features, add namespace exports:

### @features/graph
```typescript
// Export all node types under namespace
export * as NodeTypes from './lib/nodeTypes';

// Usage
import { NodeTypes } from '@features/graph';
const arcNode: NodeTypes.Arc.Definition = { /* ... */ };
```

### @features/generation
```typescript
export * as Types from './lib/types';

// Usage
import { Types } from '@features/generation';
const context: Types.SocialContext = { /* ... */ };
```

---

## Rollback Plan

If migration causes issues:

1. **Immediate:** Keep both imports working during transition
   ```typescript
   // @shared/types/index.ts (temporary)
   export * from './generation';  // Original
   export * from '@features/generation'; // Also re-export new location
   ```

2. **Gradual:** Deprecation warnings
   ```typescript
   /** @deprecated Import from @features/generation instead */
   export type { GenerationSocialContext } from './generation';
   ```

3. **Complete:** Remove old exports after all imports updated

---

## Success Metrics

- [ ] All feature-specific types in appropriate `@features/*` modules
- [ ] `@shared/types` contains only cross-cutting contracts (≤8 files)
- [ ] Zero breaking changes for external packages
- [ ] All tests pass
- [ ] TypeScript compilation succeeds

---

## Next Steps

1. ✅ **Review this plan** with team
2. **Create feature branches:**
   - `refactor/move-graph-types-to-feature`
   - `refactor/move-generation-types-to-feature`
   - etc.
3. **Execute Phase 1** (low-risk moves)
4. **Monitor for issues**, adjust plan if needed
5. **Continue with Phase 2 & 3**

---

## ✅ Decisions Made

1. ✅ **Narrative gets its own module** → Create `@features/narrative`
   - Substantial system (dialogue trees, action blocks, scene transitions)
   - Warrants dedicated feature module

2. ✅ **NPC zones** → `@features/gizmos/lib/bodyMap/`
   - Body map zones for interactive tools (tickle, pleasure, etc.)
   - Already used by `BodyMapGizmo.tsx` component

3. ✅ **Intimacy architecture** → Sub-module of `@features/interactions`
   - `intimacy.ts` → `@features/interactions/lib/intimacy/types.ts`
   - Exported as namespace: `import { Intimacy } from '@features/interactions'`
   - Reason: Intimacy is a specialized extension of interactions

4. **Namespace exports** → Add after moving, per-feature basis
   - Each feature decides if namespace pattern helps

---

## References

- [Frontend-Backend Boundaries](../architecture/frontend-backend-boundaries.md)
- [Repository Map](../repo-map.md)
- Original task: Namespace import pattern for IDs
