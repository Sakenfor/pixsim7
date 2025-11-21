# @pixsim7/graph

Canonical graph schema and execution engine for PixSim7. Provides a unified node-based system for both scene graphs (narrative/video) and simulation graphs (NPC behavior, world dynamics).

## Overview

This package implements the graph kernel foundation as specified in:
- `docs/ENGINE_LAYERING_FOUNDATION.md`
- `docs/NODE_ENGINE_DESIGN.md`

**Key principles:**
- **Single canonical schema**: One JSON Schema for all graph types
- **Deterministic execution**: Seeded RNG for reproducible results
- **Pure evaluation**: Effects are declarative, side effects handled by integration layer
- **Language-neutral**: Generated TypeScript (Zod) and Python (Pydantic) models

## Architecture

```
┌─────────────────────────────────────┐
│   graph.schema.json (canonical)     │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
  TypeScript         Python
  (Zod types)    (Pydantic models)
       │                │
       ▼                ▼
   Frontend        Backend
  (Editor/UI)   (Game Service)
```

## Directory Structure

```
packages/types/graph/
├── schema/
│   └── graph.schema.json       # Source of truth
├── src/
│   ├── index.ts               # Main exports + executor
│   ├── generated.ts           # Auto-generated Zod schemas
│   └── validator.ts           # Semantic validation
├── scripts/
│   ├── generate.ts            # Generate TypeScript from schema
│   ├── generate-python.ts     # Generate Python models
│   └── validate-schema.ts     # Validate schema + examples
├── examples/                  # Example graphs
│   ├── simple-action.json
│   ├── decision-tree.json
│   ├── video-choice.json
│   └── random-loop.json
└── test/                      # Tests
    ├── executor.test.ts
    └── validator.test.ts
```

## Node Types

| Type       | Purpose                                    |
|------------|--------------------------------------------|
| Action     | Apply effects (needs, money, flags, etc.)  |
| Decision   | Branch selection (first/random/weighted)   |
| Condition  | Gate execution on predicates               |
| Choice     | User-facing branching (blocks execution)   |
| Video      | Video segment selection + playback         |
| Random     | RNG-based branching                        |
| Timer      | Delay execution for N ticks                |
| SceneCall  | Invoke published scene                     |
| Subgraph   | Call another graph                         |

## Condition Types

Comprehensive condition system supporting:
- **Time**: `weekday`, `weekend`, `timeBetween`, `timeAfter`, `timeBefore`
- **Needs**: `needLt`, `needGt`, `needBetween`
- **Flags**: `hasFlag`, `notFlag`, `anyFlag`, `allFlags`
- **Location**: `locationIs`, `locationNot`
- **Money**: `moneyGt`, `moneyLt`
- **Relationships**: `relationshipGt`, `relationshipLt`
- **Activity**: `activityIs`, `activityNot`
- **Temporal**: `tickMod`, `randomChance`
- **Logical**: `and`, `or`, `not` (composable)

## Effect Types

Effects are declarative and batched by the integration layer:
- `needs`: Need deltas (e.g., `{hunger: 20, energy: -10}`)
- `money` / `moneyDelta`: Money changes
- `flagsAdd` / `flagsRemove` / `flagsToggle`: Flag management
- `moveTo`: Location transition
- `activity` / `activityDuration`: Activity state
- `relationships`: Relationship deltas with other entities
- `spawnEvent`: Emit events
- `log`: Logging messages
- `variables`: Context variables

## Usage

### Installation

```bash
cd packages/types/graph
pnpm install
```

### Generate Types

```bash
pnpm generate        # Generate TypeScript Zod schemas
tsx scripts/generate-python.ts  # Generate Python models
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

### Validate Schema

```bash
pnpm validate-schema
```

## Example: Executing a Graph

```typescript
import {
  executeGraphStep,
  makeRng,
  type EvalContext,
  type EntityState,
} from '@pixsim7/graph';

// Load graph
const graph = {
  schemaVersion: '1.0.0',
  name: 'npc-behavior',
  entry: 'decide_action',
  nodes: {
    decide_action: {
      type: 'Decision',
      decisionStrategy: 'first',
      edges: ['check_hunger', 'idle'],
    },
    check_hunger: {
      type: 'Condition',
      conditions: [{ kind: 'needLt', need: 'hunger', value: 40 }],
      edges: ['eat'],
    },
    eat: {
      type: 'Action',
      effect: {
        needs: { hunger: 30 },
        moneyDelta: -10,
        activity: 'eating',
      },
      edges: [],
    },
    idle: {
      type: 'Action',
      effect: { activity: 'idle' },
      edges: [],
    },
  },
};

// Create context
const state: EntityState = {
  id: 'npc_001',
  needs: { hunger: 30, energy: 70 },
  money: 100,
  flags: new Set(['awake']),
  location: 'home',
  cooldowns: new Map(),
};

const ctx: EvalContext = {
  tick: 100,
  timeOfDay: 600, // 10:00 AM
  dayOfWeek: 2, // Tuesday
  state,
  rng: makeRng(42),
};

// Execute one step
const result = executeGraphStep(graph, 'decide_action', ctx);

console.log('Effects:', result.effects);
console.log('Next nodes:', result.nextNodes);
console.log('Instructions:', result.instructions);
console.log('Blocked:', result.blocked);
```

## Example: Validating a Graph

```typescript
import { validateGraph, getGraphStats } from '@pixsim7/graph';

const validation = validateGraph(graph);

if (!validation.valid) {
  console.error('Validation errors:');
  validation.issues
    .filter(i => i.severity === 'error')
    .forEach(issue => console.error(`  - ${issue.message}`));
}

const stats = getGraphStats(graph);
console.log('Graph statistics:', stats);
```

## Determinism

All randomness must use the provided seeded RNG:

```typescript
import { makeRng, splitRng } from '@pixsim7/graph';

// World-level RNG
const worldRng = makeRng(12345);

// Entity-specific RNG (deterministic split)
const npcRng = splitRng(worldRng, 'npc_001');

// Use in context
const ctx = {
  // ...
  rng: npcRng,
};
```

Same seed + same graph + same state → same results.

## Integration with Backend

The Python models can be generated in the backend:
```
pixsim7/backend/main/domain/game/graph/models.py
```

Example Python usage:

```python
from pixsim7.backend.main.domain.game.graph.models import Graph

# Load and validate
with open('graph.json') as f:
    graph_data = json.load(f)
    graph = Graph.model_validate(graph_data)

# Graph is now a validated Pydantic model
print(f"Graph: {graph.name}")
print(f"Entry: {graph.entry}")
```

**Note:** The game service was consolidated into `pixsim7.backend.main` as part of Phase 1 architecture simplification (2025-11-16).

## Schema Versioning

Current version: `1.0.0`

Version policy:
- **Patch** (1.0.x): Documentation updates only
- **Minor** (1.x.0): Additive changes (new node types, new condition kinds)
- **Major** (x.0.0): Breaking changes (removed/renamed fields)

## Examples

See `examples/` directory for complete graph examples:
- `simple-action.json`: Basic linear action sequence
- `decision-tree.json`: NPC behavior with decision tree
- `video-choice.json`: Scene with video segments and user choice
- `random-loop.json`: Event loop with random encounters

## Testing

Comprehensive test coverage for:
- RNG determinism
- Condition evaluation (all types)
- Node evaluation (all types)
- Graph validation (semantic checks)
- Cycle detection
- Reachability analysis

Run tests:
```bash
pnpm test
```

## Development

### Adding a New Node Type

1. Update `schema/graph.schema.json`:
   ```json
   {
     "type": {"enum": [..., "NewType"]}
   }
   ```

2. Regenerate types:
   ```bash
   pnpm generate
   ```

3. Add evaluator logic in `src/index.ts`:
   ```typescript
   case 'NewType': {
     // Evaluation logic
     break;
   }
   ```

4. Add tests in `test/executor.test.ts`

### Adding a New Condition Kind

1. Update `schema/graph.schema.json`:
   ```json
   {
     "kind": {"enum": [..., "newCondition"]}
   }
   ```

2. Regenerate types

3. Add evaluation in `evaluateCondition()`:
   ```typescript
   case 'newCondition':
     return /* evaluation logic */;
   ```

4. Add tests

## References

- Design docs: `docs/NODE_ENGINE_DESIGN.md`, `docs/ENGINE_LAYERING_FOUNDATION.md`
- JSON Schema spec: https://json-schema.org/
- Zod: https://zod.dev/
- Pydantic: https://docs.pydantic.dev/

---

**Status**: Foundation complete, ready for integration

**Next steps**:
- Backend integration (game service executor)
- Frontend editor integration (node palette + inspector)
- Performance profiling
- Advanced features (subgraph call stack, edge conditions, parallel execution)
