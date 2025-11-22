# Graph System Architecture

**Last Updated:** 2025-11-22
**Status:** ✅ **Production Ready** - Core validation and dependency tracking complete

---

## Overview

PixSim7 implements a sophisticated multi-layer graph architecture for interactive narrative design. This document describes the graph system, cross-layer validation, and dependency tracking mechanisms.

## Graph Layers

PixSim7's narrative system consists of three interconnected graph layers:

```
┌─────────────────────────────────────────────────────────┐
│         Layer 3: Character Graph (Meta-Layer)           │
│  - Query-based relationship system                      │
│  - Connects characters, NPCs, scenes, assets            │
│  - Relationship tracking (affinity, trust)              │
│  - Identity graph for character consistency             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│         Layer 2: Arc Graph (Story Structure)            │
│  - Story arcs, quests, milestones                       │
│  - References scenes via sceneId field                  │
│  - Conditional unlocks and requirements                 │
│  - Quest progression tracking                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│         Layer 1: Scene Graph (Narrative Flow)           │
│  - Node-based branching narrative                       │
│  - Video nodes, choices, scene calls                    │
│  - Selection strategies (sequential, pool, random)      │
│  - Cross-scene references                               │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: Scene Graph

**Location:** `modules/scene-builder/`

**Purpose:** Represents the flow of narrative content within individual scenes.

**Node Types:**
- `video`: Video content with segments, assets, selections
- `scene_call`: References to other scenes (reusable subscenes)
- `end`: Terminal nodes (story endpoints)

**Features:**
- Branching narrative paths
- Reusable scenes (scene-as-function pattern)
- Selection strategies for variation
- Cross-scene references with parameters

**Validation:** `modules/scene-builder/validation.ts`
- Missing start node detection
- Unreachable node detection
- Dead end warnings
- Cycle detection
- Empty media validation

### Layer 2: Arc Graph

**Location:** `modules/arc-graph/`

**Purpose:** Organizes scenes into higher-level story arcs and quest chains.

**Node Types:**
- `arc`: Story beat/stage with optional scene reference
- `quest`: Quest objective or branch
- `milestone`: Major story checkpoint
- `arc_group`: Organizational container for nodes

**Features:**
- Scene references via `sceneId` field
- Relationship requirements (character affinity/trust)
- Quest flag requirements
- Stage-based progression
- Conditional arc unlocks

**Validation:** `modules/arc-graph/validation.ts`
- Cross-layer scene reference validation
- Structural validation (reachability, cycles)
- Missing start node detection
- Broken reference detection

### Layer 3: Character Graph

**Location:** `modules/graph-system/`

**Purpose:** Meta-layer query system for character relationships and identity.

**Features:**
- Character identity tracking
- Relationship graphs (affinity, trust, flags)
- Query-based lookups
- Character-scene associations
- Asset-character bindings

**Status:** Already implemented, no changes in this task.

---

## Cross-Layer Validation

### Architecture

Cross-layer validation ensures referential integrity between graph layers. The system is designed to:

1. **Prevent broken references** (arc nodes → scenes)
2. **Provide clear error messages** with actionable guidance
3. **Allow flexibility** (non-blocking warnings for forward references)
4. **Minimize coupling** (validation only needs scene IDs, not full state)

### Validation Types

**Shared Types** (`modules/validation/types.ts`)

```typescript
export interface ValidationIssue {
  type: ValidationIssueType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  details?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
```

**Scene Validation Issues:**
- `missing-start`: No start node defined
- `unreachable`: Node not reachable from start
- `dead-end`: Node has no outgoing edges
- `cycle`: Circular path detected
- `empty-media`: Video node with no content
- `invalid-selection`: Invalid selection strategy
- `no-nodes`: Empty scene graph

**Arc Validation Issues:**
- `missing-start`: No start node defined
- `unreachable`: Node not reachable from start
- `dead-end`: Node has no outgoing edges (except milestones)
- `cycle`: Circular path detected
- `broken-scene-reference`: Scene ID doesn't exist (ERROR)
- `broken-quest-reference`: Quest ID doesn't exist (WARNING)
- `broken-character-reference`: Character ID doesn't exist (WARNING)
- `invalid-requirements`: Duplicate IDs, invalid edges (ERROR)
- `orphaned-node`: Node with no connections

### Severity Levels

- **ERROR**: Data integrity issue, prevents runtime execution
  - Broken scene references
  - Duplicate node IDs
  - Invalid edge references
  - Missing start node

- **WARNING**: Potential issue, may be intentional
  - Unreachable nodes (conditional unlocks)
  - Dead ends (story endpoints)
  - Cycles (repeatable quests)

- **INFO**: Informational, not blocking
  - Cycle detection in scene graphs (may be intentional)

### Validation Functions

**Arc Graph Reference Validation:**

```typescript
validateArcGraphReferences(
  arcGraph: ArcGraph,
  sceneIds: Set<string>,
  worldId?: string
): ValidationIssue[]
```

Checks if arc node `sceneId` references are valid. Only validates non-`arc_group` nodes.

**Arc Graph Structure Validation:**

```typescript
validateArcGraphStructure(
  arcGraph: ArcGraph
): ValidationIssue[]
```

Performs topology analysis: reachability, cycles, dead ends.

**Comprehensive Validation:**

```typescript
validateArcGraph(
  arcGraph: ArcGraph,
  sceneIds: Set<string>,
  options?: {
    worldId?: string;
    validateQuests?: boolean;
    validateCharacters?: boolean;
    questIds?: Set<string>;
    characterIds?: Set<string>;
  }
): ValidationResult
```

Combines all validation checks (structure + references + optional quest/character validation).

---

## Dependency Tracking

### Architecture

Dependencies are **derived, not stored**. This design maintains a single source of truth and eliminates sync burden.

**Key Principle:** Compute dependency index on-demand from current arc graph state.

### Dependency Index

**Location:** `lib/graph/dependencies.ts`

```typescript
export interface ArcSceneDependencyIndex {
  // Bidirectional lookup
  sceneToArcNodes: Map<string, Set<string>>;
  arcNodeToScene: Map<string, string>;
}
```

### Core Functions

**Build Index:**
```typescript
buildArcSceneDependencyIndex(
  arcGraphs: Record<string, ArcGraph>
): ArcSceneDependencyIndex
```

Pure function that computes dependency index from all arc graphs.

**Time Complexity:** O(n) where n = total arc nodes across all graphs
**Space Complexity:** O(m) where m = arc nodes with scene references

**Query Functions:**

```typescript
getArcNodesForScene(index, sceneId): string[]
getSceneForArcNode(index, arcNodeId): string | undefined
sceneHasDependencies(index, sceneId): boolean
getDependencyCount(index, sceneId): number
```

### React Hooks

**Location:** `hooks/useArcSceneDependencies.ts`

All hooks use `useMemo` to recompute only when arc graph state changes.

**Get Full Index:**
```typescript
const index = useArcSceneDependencyIndex();
```

**Get Arc Nodes for Scene:**
```typescript
const arcNodes = useSceneArcDependencies(sceneId);
// Returns: string[] of arc node IDs
```

**Check for Dependencies:**
```typescript
const hasDeps = useSceneHasDependencies(sceneId);
// Returns: boolean
```

**Get Dependency Count:**
```typescript
const count = useSceneDependencyCount(sceneId);
// Returns: number
```

### Use Cases

1. **Delete Warnings:**
   ```typescript
   const hasDeps = useSceneHasDependencies(sceneId);
   if (hasDeps) {
     showModal("This scene is used by N arcs. Delete anyway?");
   }
   ```

2. **Usage Indicators:**
   ```typescript
   const count = useSceneDependencyCount(sceneId);
   // Display: "Used by {count} arc nodes"
   ```

3. **Dependency Lists:**
   ```typescript
   const arcNodes = useSceneArcDependencies(sceneId);
   // Show list of dependent arc nodes in modal
   ```

---

## Store Integration

### Arc Graph Store

**Location:** `stores/arcGraphStore/arcNodeSlice.ts`

**Validation on Add:**
```typescript
addArcNode(node: ArcGraphNode) {
  // Validate scene reference if present
  if (node.sceneId) {
    const sceneIds = useGraphStore.getState().getSceneIds();
    const issues = validateArcGraphReferences(updatedGraph, sceneIds);

    if (issues.filter(i => i.severity === 'error').length > 0) {
      // Show warning toast (non-blocking)
      useToastStore.getState().addToast({
        type: 'warning',
        message: `Scene reference may be invalid: ${node.sceneId}`,
      });
    }
  }

  // Proceed with add (allow with warning)
}
```

**Validation on Update:**
```typescript
updateArcNode(id: string, patch: Partial<ArcGraphNode>) {
  // Validate if sceneId is being updated
  if ('sceneId' in patch && patch.sceneId) {
    // Same validation as addArcNode
  }
}
```

**Design Notes:**
- Validation is **non-blocking** (warning only)
- Allows forward references (users can reference scenes they plan to create)
- Warnings via toast, not errors
- No blocking modals or confirmations

### Scene Graph Store

**Location:** `stores/graphStore/sceneSlice.ts`

**New Selector:**
```typescript
getSceneIds(): Set<string> {
  const { scenes } = get();
  return new Set(Object.keys(scenes));
}
```

**Benefits:**
- Efficient validation (only scene IDs, not full scenes)
- Minimal coupling (arc store doesn't access scene objects)
- Type-safe (returns Set<string>)

---

## Testing

### Unit Tests

**Arc Validation Tests:** `modules/arc-graph/validation.test.ts`

Coverage:
- Valid scene references (no issues)
- Broken scene references (error detection)
- Arc group nodes (ignored, no sceneId)
- Nodes without scene references (no issues)
- World-scoped validation (error details include worldId)
- Missing start node (error)
- Unreachable nodes (warning)
- Dead ends (warning, except milestones)
- Cycles (warning)
- Duplicate node IDs (error)
- Invalid edge references (error)
- Well-formed arc graphs (valid result)

**Dependency Tracking Tests:** `lib/graph/dependencies.test.ts`

Coverage:
- Empty arc graphs (empty index)
- Arc graphs with scene references (correct index)
- Multiple arc nodes → same scene (set accumulation)
- Arc group nodes ignored
- Nodes without scene references ignored
- Multiple arc graphs (cross-graph dependencies)
- Query functions (getArcNodesForScene, etc.)
- Dependency checks (sceneHasDependencies, getDependencyCount)

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test validation.test.ts

# Watch mode
npm test -- --watch
```

---

## Best Practices

### Validation Design

1. **Errors vs Warnings:**
   - Use **errors** for data integrity issues (broken references, invalid IDs)
   - Use **warnings** for potentially intentional patterns (unreachable nodes, cycles)
   - Use **info** for informational messages (cycle details)

2. **Non-Blocking Validation:**
   - Don't prevent operations, just warn
   - Allow forward references (scenes created later)
   - Show clear, actionable error messages

3. **Minimal Coupling:**
   - Validation functions accept minimal data (sceneIds as Set, not full store)
   - Avoid circular dependencies between stores
   - Keep validation logic pure and testable

### Dependency Tracking Design

1. **Derived State:**
   - Never store dependency index in state
   - Compute on-demand from current graph state
   - Use memoization for performance

2. **Pure Functions:**
   - All dependency functions are pure (no side effects)
   - Easy to test and reason about
   - Predictable behavior

3. **React Hooks:**
   - Wrap pure functions in hooks with useMemo
   - Recompute only when dependencies change
   - Minimize unnecessary re-renders

### Store Integration

1. **Validation Timing:**
   - Validate on add/update operations
   - Don't validate on read operations
   - Show warnings immediately via toast

2. **Error Handling:**
   - Log validation errors to console
   - Show user-friendly messages in UI
   - Don't block operations

3. **Performance:**
   - Use Set for O(1) lookups
   - Validate only changed nodes, not entire graph
   - Memoize expensive computations

---

## Future Enhancements

### Task 44: Undo/Redo System
- Temporal middleware for state management
- History stack for all graph operations
- Undo/redo UI controls

### Task 45: Visual Dependency Indicators
- Badge in scene toolbar: "Used by N arcs"
- Broken reference badges in arc graph
- Cascade delete UI with policy options:
  - **PREVENT:** Don't allow delete (default)
  - **SET_NULL:** Clear sceneId in arc nodes
  - **CASCADE:** Delete referencing arc nodes (dangerous)
- Dependency list modal before delete

### Task 46: World/Campaign Graph Layer
- Layer above arc graphs
- World-scoped scene references
- Campaign progression tracking
- Multi-world support

### Task 47: Scene Lineage Graph
- Track scene creation lineage
- Parent-child relationships
- Version history
- Template tracking

---

## References

- **Task Specification:** `claude-tasks/43-graph-architecture-cross-layer-validation-and-dependencies.md`
- **Architecture:** `ARCHITECTURE.md` → Graph Cross-Layer Validation section
- **Scene Builder Validation:** `modules/scene-builder/validation.ts`
- **Arc Graph Types:** `modules/arc-graph/types.ts`
- **Arc Graph Store:** `stores/arcGraphStore/`
- **Scene Graph Store:** `stores/graphStore/`

---

## Changelog

### 2025-11-22: Initial Implementation
- Added shared validation types (`modules/validation/types.ts`)
- Implemented arc graph validation (`modules/arc-graph/validation.ts`)
- Implemented dependency tracking (`lib/graph/dependencies.ts`)
- Added React hooks (`hooks/useArcSceneDependencies.ts`)
- Integrated validation into arc graph store
- Added `getSceneIds()` selector to scene graph store
- Created comprehensive test coverage
- Updated ARCHITECTURE.md
- Created this documentation

---

**Maintained by:** PixSim7 Development Team
**Questions?** See `ARCHITECTURE.md` or ask in team chat.
