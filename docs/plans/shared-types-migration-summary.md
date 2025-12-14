# @shared/types Migration - Final Plan

**Date:** 2025-12-14
**Status:** Ready to Execute

---

## 📊 Final Classification

**Before:** 18 type modules in `@shared/types`
**After:** 7 stay, 11 move to features

---

## ✅ STAY in @shared/types (7 files)

These are **cross-cutting contracts** used by multiple features and backend:

```
@shared/types/
├── ids.ts               ✅ Core ID types (with IDs namespace!)
├── game.ts              ✅ API DTOs (GameSessionDTO, etc.)
├── brain.ts             ✅ Brain state model
├── characterGraph.ts    ✅ Character identity system
├── userPreferences.ts   ✅ User settings contract
├── assetProvider.ts     ✅ Asset system types
└── interactions.ts      ✅ Canonical interaction contract (NEW: stays!)
```

**Why interactions.ts stays:**
- Used across multiple features (not just @features/interactions)
- Backend contract type (like game.ts, brain.ts)
- Defines core interaction model (surfaces, gating, branch intents)
- **Pattern:** @features/interactions re-exports for convenience (see below)

---

## 🔄 MOVE to @features (11 files)

### → @features/graph (4 files)

```
@features/graph/lib/nodeTypes/
├── arc.ts           ← arcNodeTypes.ts
├── builtin.ts       ← builtinNodeTypes.ts
├── npcResponse.ts   ← npcResponseNode.ts
└── registry.ts      ← nodeTypeRegistry.ts
```

**Exports:**
```typescript
export * as NodeTypes from './lib/nodeTypes';
export { nodeTypeRegistry } from './lib/nodeTypes/registry';
```

---

### → @features/generation (1 file)

```
@features/generation/lib/
└── types.ts         ← generation.ts
```

**Contains:** GenerationStrategy, GenerationSocialContext, etc.

---

### → @features/interactions (2 files) ✨

**Architecture:** Intimacy as specialized sub-module + contract re-export pattern

```
@features/interactions/lib/
├── types.ts                    ← Local interaction UI types
└── intimacy/                   ← NEW: Intimacy extension
    ├── types.ts                ← intimacy.ts (relationship gates, content rating)
    └── nodeTypes.ts            ← intimacyNodeTypes.ts
```

**Exports:**
```typescript
// @features/interactions/index.ts

// Re-export contract from @shared/types (convenience)
export * from '@shared/types/interactions';

// Intimacy domain logic
export * from './lib/intimacy/types';
export * from './lib/intimacy/nodeTypes';
export * as Intimacy from './lib/intimacy/types';

// UI components
export { InteractionMenu, InteractionEditor, /* ... */ };
```

**Usage:**
```typescript
// ✅ RECOMMENDED - Import from feature (convenient)
import {
  InteractionMenu,          // UI component
  NpcInteractionSurface,    // Contract (re-exported from @shared/types)
  Intimacy                  // Domain logic
} from '@features/interactions';

// ✅ ALSO VALID - Import contract directly (explicit)
import { NpcInteractionDefinition } from '@shared/types';
```

**Why this structure:**
- Intimacy is a specialized extension of interactions (not separate)
- Natural hierarchy: interactions → intimacy
- Single feature ownership for all interaction-related concerns
- Clean namespace: `Intimacy.*` types

---

### → @features/gizmos (2 files)

```
@features/gizmos/lib/bodyMap/
├── zones.ts         ← npcZones.ts
└── tracking.ts      ← npcZoneTracking.ts
```

**Context:** Body map zones for interactive tools (tickle, pleasure sensitivity, tool effectiveness)
**Already used by:** `BodyMapGizmo.tsx` component

---

### → @features/narrative (1 file) ✅ NEW FEATURE

```
@features/narrative/
├── lib/
│   └── types.ts     ← narrative.ts
└── index.ts
```

**Why create new feature:**
- Substantial standalone system (dialogue trees, action blocks, scene transitions)
- Shared between multiple other features
- Warrants dedicated module

---

## 📈 Migration Phases

### Phase 1: Low-Risk (Week 1)

**Target:** Files with minimal/no dependencies

1. ✅ Create `@features/narrative` directory structure
2. Move `generation.ts` → `@features/generation/lib/types.ts`
3. Move `npcZones.ts` + `npcZoneTracking.ts` → `@features/gizmos/lib/bodyMap/`
4. Move `npcResponseNode.ts` → `@features/graph/lib/nodeTypes/npcResponse.ts`

**Validation:**
```bash
pnpm run build
pnpm run lint
```

---

### Phase 2: Medium-Risk (Week 2)

**Target:** Files re-exported via @lib/registries

1. Move `arcNodeTypes.ts` → `@features/graph/lib/nodeTypes/arc.ts`
2. Move `builtinNodeTypes.ts` → `@features/graph/lib/nodeTypes/builtin.ts`
3. Move `nodeTypeRegistry.ts` → `@features/graph/lib/nodeTypes/registry.ts`
4. Update `@lib/registries.ts` re-exports

**Required updates:**
```typescript
// Before (in @lib/registries.ts)
export { nodeTypeRegistry } from '@pixsim7/shared.types';

// After
export { nodeTypeRegistry } from '@features/graph';
```

---

### Phase 3: Intimacy + Narrative (Week 3)

**Target:** Structural changes

1. Create `@features/interactions/lib/intimacy/` subdirectory
2. Move `intimacy.ts` → `@features/interactions/lib/intimacy/types.ts`
3. Move `intimacyNodeTypes.ts` → `@features/interactions/lib/intimacy/nodeTypes.ts`
4. Add namespace export to `@features/interactions/index.ts`
5. Move `narrative.ts` → `@features/narrative/lib/types.ts`

**New exports:**
```typescript
// @features/interactions/index.ts
export * as Intimacy from './lib/intimacy';
```

---

## 🎯 Import Update Strategy

### Automated via Find/Replace

Most imports can be updated with simple find/replace:

```typescript
// Generation types
- import { GenerationSocialContext } from '@shared/types';
+ import { GenerationSocialContext } from '@features/generation';

// Node types (via @lib/registries - already abstracted!)
// No change needed! Already imports from @lib/registries

// Intimacy types (NEW namespace pattern)
- import { RelationshipGate } from '@shared/types';
+ import { Intimacy } from '@features/interactions';
+ const gate: Intimacy.RelationshipGate = { /* ... */ };
```

### Backward Compatibility (Temporary)

During migration, keep re-exports in @shared/types:

```typescript
// @shared/types/index.ts (temporary)
/** @deprecated Import from @features/generation instead */
export * from './generation';
```

Remove after all imports updated.

---

## 📝 Post-Migration Structure

```
@shared/types/          (7 files - cross-cutting only)
├── ids.ts              ← IDs namespace ✨
├── game.ts
├── brain.ts
├── characterGraph.ts
├── userPreferences.ts
├── assetProvider.ts
└── interactions.ts     ← Canonical contract

@features/graph/
└── lib/nodeTypes/      ← 4 node type files

@features/generation/
└── lib/types.ts        ← Generation types

@features/interactions/
└── lib/intimacy/       ← 2 intimacy files ✨

@features/gizmos/
└── lib/bodyMap/        ← 2 zone files

@features/narrative/    ← NEW ✨
└── lib/types.ts        ← Narrative types
```

---

## ✅ Success Criteria

- [ ] All 11 files moved to appropriate features
- [ ] @shared/types contains only 7 cross-cutting contracts
- [ ] All imports updated and working
- [ ] TypeScript compilation succeeds
- [ ] All tests pass
- [ ] No breaking changes for external packages
- [ ] Namespace exports added where beneficial

---

## 🚀 Ready to Start?

The plan is complete and ready to execute. All architectural decisions made:

✅ **Intimacy** → Sub-module of @features/interactions
✅ **NPC Zones** → @features/gizmos
✅ **Narrative** → New @features/narrative module
✅ **interactions.ts** → Stays in @shared/types

Start with Phase 1 (low-risk moves)?
