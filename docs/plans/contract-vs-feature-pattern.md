# Contract vs. Feature Pattern

**Created:** 2025-12-14
**Status:** Architectural Pattern

---

## Problem

Some type modules define **contracts** (API schemas, state models) used across:
- Backend (Python/Pydantic)
- Frontend UI (React components)
- Multiple features (graph, generation, etc.)

These shouldn't live in a single feature module, but developers want convenient imports.

---

## Solution: Re-export Pattern

### 1. Contract stays in @shared/types (source of truth)

```typescript
// @shared/types/interactions.ts
export interface NpcInteractionDefinition {
  id: string;
  surface: NpcInteractionSurface;
  gating: RelationshipGating;
  outcomes: InteractionOutcome[];
}
```

### 2. Feature re-exports for convenience

```typescript
// @features/interactions/index.ts

// Re-export contract (single source of truth maintained)
export * from '@shared/types/interactions';

// Feature's UI components
export { InteractionMenu } from './components/InteractionMenu';
export { InteractionEditor } from './components/editor/InteractionEditor';

// Feature's domain logic
export * as Intimacy from './lib/intimacy';
```

### 3. Developers import from feature

```typescript
// ✅ CONVENIENT - Import everything from feature
import {
  InteractionMenu,          // UI (from feature)
  NpcInteractionSurface,    // Contract (re-exported from @shared/types)
  Intimacy                  // Domain logic (from feature)
} from '@features/interactions';

function MyComponent() {
  const surface: NpcInteractionSurface = 'dialogue';
  return <InteractionMenu surface={surface} />;
}
```

---

## Benefits

✅ **Single source of truth** - Contract defined once in `@shared/types`
✅ **Convenient imports** - Developers import from feature, not multiple places
✅ **Clear ownership** - Contract vs. implementation separation documented
✅ **No duplication** - Re-export pattern, not copy
✅ **Backend compat** - Backend can import contract without frontend dependencies

---

## When to Use This Pattern

Use this pattern when:

1. **Contract is cross-cutting** - Used by backend + multiple features
2. **Feature provides UI/logic** - Feature needs to work with the contract
3. **Developer convenience matters** - Avoid import ceremony

**Examples:**
- `@shared/types/interactions.ts` + `@features/interactions`
- `@shared/types/game.ts` (API DTOs) - Could be re-exported by game-related features
- `@shared/types/brain.ts` (state model) + `@features/brainTools`

---

## Pattern Template

### @shared/types/thing.ts (Contract)

```typescript
/**
 * Canonical Thing Contract
 *
 * Used by: backend, @features/thing, @features/other
 */
export interface ThingDefinition { /* ... */ }
export interface ThingConfig { /* ... */ }
```

### @features/thing/index.ts (Feature + Re-export)

```typescript
/**
 * Thing Feature
 *
 * **Architecture Note:**
 * - Contract lives in @shared/types/thing.ts
 * - This feature provides UI + domain logic
 * - Contract re-exported for convenience
 *
 * See: README.md for details
 */

// Re-export contract
export * from '@shared/types/thing';

// Feature UI
export { ThingEditor } from './components/ThingEditor';

// Feature domain logic
export * as Domain from './lib/domain';
```

### @features/thing/README.md (Documentation)

```markdown
# Thing Feature

## Architecture: Contract vs. Implementation

**Contract:** `@shared/types/thing.ts` (source of truth)
**UI:** `@features/thing/components/`
**Domain Logic:** `@features/thing/lib/`

Import from feature for convenience:
\`\`\`typescript
import { ThingEditor, ThingDefinition } from '@features/thing';
\`\`\`

See: docs/plans/contract-vs-feature-pattern.md
```

---

## Anti-Patterns (Don't Do This)

❌ **Duplicate contract in feature**
```typescript
// @features/thing/lib/types.ts
export interface ThingDefinition { /* duplicate! */ }
```

❌ **Move contract to feature when it's cross-cutting**
```typescript
// Backend now has to import from frontend feature - BAD!
import { ThingDefinition } from '@features/thing';
```

❌ **Require imports from multiple places**
```typescript
// Developer imports from two places - confusing
import { ThingEditor } from '@features/thing';
import { ThingDefinition } from '@shared/types/thing';  // ❌ Ceremony
```

---

## Real-World Example: @features/interactions

### Before (Confusing)

```typescript
// Developer has to know about the split
import { InteractionMenu } from '@features/interactions';      // UI
import { NpcInteractionSurface } from '@shared/types';         // Contract
```

### After (Convenient)

```typescript
// Developer imports from one place
import {
  InteractionMenu,          // UI
  NpcInteractionSurface     // Contract (re-exported)
} from '@features/interactions';
```

**Under the hood:**
- Contract stays in `@shared/types/interactions.ts` (backend can import it)
- Feature re-exports via `export * from '@shared/types/interactions'`
- README explains the architecture
- Single source of truth maintained

---

## References

- [Frontend-Backend Boundaries](../architecture/frontend-backend-boundaries.md)
- [Shared Types Migration Summary](./shared-types-migration-summary.md)
- [@features/interactions/README.md](../../apps/main/src/features/interactions/README.md)
