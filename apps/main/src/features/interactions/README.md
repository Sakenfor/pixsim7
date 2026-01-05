# Interactions Feature

This feature provides **UI components** and **domain logic** for NPC interactions and intimacy systems.

---

## Architecture: Contract vs. Implementation

### 📜 Canonical Contract: `@shared/types/interactions.ts`

The **interaction contract** lives in `@shared/types/interactions.ts` (not here).

**Why?** It's a **cross-cutting contract** shared between:
- Backend (Python/Pydantic schemas)
- Frontend UI (this feature)
- Other features (graph, generation, etc.)

**What's in the contract:**
```typescript
// @shared/types/interactions.ts
export type NpcInteractionSurface = 'inline' | 'dialogue' | 'scene' | ...;
export type NpcInteractionBranchIntent = 'escalate' | 'cool_down' | ...;
export interface NpcInteractionDefinition { /* ... */ }
export interface StatGating { /* ... */ }
```

Think of it like `game.ts` (API DTOs) or `brain.ts` (state model) - it defines **what an interaction IS**, not how to display it.

---

### 🎨 This Feature: UI + Domain Logic

**What this feature provides:**

1. **UI Components** - Visual representation of interactions
   - `InteractionMenu` - Display available interactions
   - `InteractionEditor` - Edit interaction definitions
   - `InteractionHistory` - Show past interactions
   - `MoodIndicator` - Visual mood display

2. **Intimacy Sub-module** (`lib/intimacy/`) - Relationship-specific logic
   - `RelationshipGate` - Advanced gating beyond base contract
   - `ContentRating` - Rating system for intimate content
   - Intimacy node types for scene graph

---

## Import Patterns

### ✅ Recommended: Import from Feature (Convenient)

The feature **re-exports** the shared contract for convenience:

```typescript
// ✅ RECOMMENDED - Import everything from the feature
import {
  InteractionMenu,           // UI component (from this feature)
  NpcInteractionSurface,     // Contract type (re-exported from @shared/types)
  Intimacy                   // Domain logic (from this feature)
} from '@features/interactions';

// Use both UI and contract types together
const menu = <InteractionMenu surface="dialogue" />;
const gate: Intimacy.RelationshipGate = { /* ... */ };
```

### ✅ Also Valid: Import Contract Directly (Explicit)

For code that only needs the contract (no UI):

```typescript
// ✅ ALSO VALID - Direct import from shared contract
import {
  NpcInteractionSurface,
  NpcInteractionDefinition
} from '@shared/types';

// Backend, validators, or other features use this
```

---

## Structure

```
@features/interactions/
├── README.md                     ← You are here
├── index.ts                      ← Barrel: re-exports contract + UI
├── components/
│   ├── InteractionMenu.tsx       ← UI: Display interactions
│   ├── InteractionEditor.tsx     ← UI: Edit interactions
│   ├── InteractionHistory.tsx    ← UI: Show history
│   └── MoodIndicator.tsx         ← UI: Visual mood
└── lib/
    └── intimacy/                 ← Domain logic (migrated from @shared/types)
        ├── types.ts              ← Relationship gates, content rating
        └── nodeTypes.ts          ← Intimacy node registrations

@shared/types/
└── interactions.ts               ← Canonical contract (source of truth)
```

---

## Single Source of Truth

**Contract Definition:** `@shared/types/interactions.ts`
**UI Implementation:** `@features/interactions/components/`
**Domain Logic:** `@features/interactions/lib/intimacy/`

**Never duplicate** the contract - always import from `@shared/types` (or via the feature re-export).

---

## Examples

### Using UI Components with Contract Types

```typescript
import { InteractionMenu, NpcInteractionSurface } from '@features/interactions';

function MyComponent() {
  const surface: NpcInteractionSurface = 'dialogue';

  return <InteractionMenu surface={surface} />;
}
```

### Using Intimacy Domain Logic

```typescript
import { Intimacy } from '@features/interactions';

const gate: Intimacy.RelationshipGate = {
  id: 'romance_gate',
  requiredTier: 'lover',
  minAffinity: 75,
  minTrust: 60
};

function checkGate(playerState: any) {
  return Intimacy.checkRelationshipGate(gate, playerState);
}
```

### Backend/Validation Code (Contract Only)

```typescript
// Backend or shared validator - no UI needed
import { NpcInteractionDefinition } from '@shared/types';

function validateInteraction(def: NpcInteractionDefinition) {
  // Validation logic using contract types only
}
```

---

## Migration Note

This feature was part of the **@shared/types migration** (Phase 3):
- Intimacy types moved here from `@shared/types/intimacy.ts`
- Core interaction contract stayed in `@shared/types/interactions.ts`
- See: `docs/plans/shared-types-migration-summary.md`
