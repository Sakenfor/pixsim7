"""
Task 43 – Graph Architecture: Cross-Layer Validation & Dependency Tracking

Goal

Improve data integrity and UX across the multi-layer graph system (Scene Graph → Arc Graph → Character Graph) by adding cross-layer reference validation, dependency tracking, and expanded validation depth.

This task focuses on preventing broken references, providing clear dependency visibility, and establishing shared validation patterns that can be reused across graph types.

Background

PixSim7 has a sophisticated multi-layer graph architecture:

- **Scene Graph** (Layer 1): Node-based branching narrative within scenes. Uses `DraftScene` with validation for unreachable nodes, dead ends, cycles, etc.
- **Arc Graph** (Layer 2): Story arcs, quests, and milestones that organize scenes. Arc nodes reference scenes via `sceneId` field.
- **Character Graph** (Layer 3): Meta-layer query system connecting characters, NPCs, scenes, assets, and relationships.

Current gaps:

1. **No cross-layer validation:** Arc nodes can reference `sceneId` values that don't exist in the scene graph store.
2. **No dependency tracking:** Deleting a scene doesn't warn about arc nodes that reference it.
3. **Shallow arc validation:** Arc graph validation only checks structural issues (duplicate IDs, invalid edges), not semantic issues (unreachable nodes, cycles, broken references).
4. **No undo/redo:** Both stores lack history/temporal middleware.
5. **No visual indicators:** Scene editor doesn't show which arcs use a scene; arc editor doesn't show broken scene references.

This task addresses items 1-3 as high-priority improvements. Items 4-5 are follow-up tasks.

Scope

Includes:

- `apps/main/src/modules/arc-graph/` - Add validation.ts module
- `apps/main/src/modules/scene-builder/validation.ts` - Align ValidationIssue types
- `apps/main/src/stores/arcGraphStore/` - Use validation in operations
- `apps/main/src/stores/graphStore/` - Provide scene index for validation
- `apps/main/src/hooks/` - Add dependency tracking hooks
- `apps/main/src/lib/graph/` - Shared validation utilities

Out of scope:

- Undo/redo implementation (deferred to Task 44)
- Visual dependency indicators in UI components (deferred to Task 45)
- World/campaign graph layer above arcs (deferred to Task 46)
- Scene lineage graph implementation (deferred to Task 47)

Problems & Proposed Work

1. Cross-Layer Reference Validation

Problem:

- Arc nodes have `sceneId?: string` field that references scenes in the scene graph store.
- Arc graph validation (`validateArcGraph` in `arc-graph/utils.ts`) only checks structural issues:
  - Duplicate node/edge IDs
  - Invalid edge references (edges pointing to non-existent nodes)
  - Start node exists
- It does NOT check if `sceneId` references actually exist in the scene store.
- Runtime errors occur when double-clicking arc nodes with broken scene references.
- No visual feedback in the arc graph editor that a reference is broken.

Proposed:

Create `apps/main/src/modules/arc-graph/validation.ts` with cross-layer validation:

```typescript
import type { ArcGraph, ArcGraphNode } from './types';

export type ArcValidationIssueType =
  | 'missing-start'
  | 'unreachable'
  | 'dead-end'
  | 'cycle'
  | 'broken-scene-reference'
  | 'broken-quest-reference'
  | 'broken-character-reference'
  | 'invalid-requirements'
  | 'orphaned-node';

export interface ArcValidationIssue {
  type: ArcValidationIssueType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  details?: string;
}

export interface ArcValidationResult {
  valid: boolean;
  issues: ArcValidationIssue[];
  errors: ArcValidationIssue[];
  warnings: ArcValidationIssue[];
}

/**
 * Validate arc graph scene references against available scenes.
 *
 * @param arcGraph - The arc graph to validate
 * @param sceneIds - Set of valid scene IDs (from useGraphStore)
 * @param worldId - Optional world ID for world-scoped validation
 * @returns Validation issues for broken scene references
 */
export function validateArcGraphReferences(
  arcGraph: ArcGraph,
  sceneIds: Set<string>,
  worldId?: string
): ArcValidationIssue[] {
  const issues: ArcValidationIssue[] = [];

  for (const node of arcGraph.nodes) {
    // Check scene reference
    if (node.type !== 'arc_group' && node.sceneId) {
      if (!sceneIds.has(node.sceneId)) {
        issues.push({
          type: 'broken-scene-reference',
          severity: 'error',
          message: `${node.type} node "${node.label}" references non-existent scene: ${node.sceneId}`,
          nodeId: node.id,
          details: worldId ? `Scene not found in world: ${worldId}` : undefined,
        });
      }
    }
  }

  return issues;
}

/**
 * Validate arc graph structure (reachability, cycles, dead ends)
 */
export function validateArcGraphStructure(
  arcGraph: ArcGraph
): ArcValidationIssue[] {
  const issues: ArcValidationIssue[] = [];

  // Check for missing start node (ERROR)
  if (!arcGraph.startNodeId) {
    issues.push({
      type: 'missing-start',
      severity: 'error',
      message: 'Arc graph has no start node',
    });
    return issues; // Can't validate reachability without start
  }

  if (!arcGraph.nodes.some(n => n.id === arcGraph.startNodeId)) {
    issues.push({
      type: 'missing-start',
      severity: 'error',
      message: `Start node ${arcGraph.startNodeId} does not exist`,
    });
    return issues;
  }

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const edge of arcGraph.edges) {
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }
    adjacency.get(edge.from)!.push(edge.to);
  }

  // Check for unreachable nodes (WARNING - may be intentional)
  const reachable = new Set<string>();
  const queue = [arcGraph.startNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    const neighbors = adjacency.get(nodeId) || [];
    queue.push(...neighbors);
  }

  for (const node of arcGraph.nodes) {
    if (!reachable.has(node.id) && node.id !== arcGraph.startNodeId) {
      issues.push({
        type: 'unreachable',
        severity: 'warning',
        message: `${node.type} node "${node.label}" is unreachable from start`,
        nodeId: node.id,
        details: 'This may be intentional (e.g., conditional arc unlocks)',
      });
    }
  }

  // Check for dead ends (WARNING - may be intentional)
  for (const node of arcGraph.nodes) {
    const outgoing = adjacency.get(node.id) || [];
    if (outgoing.length === 0 && node.type !== 'milestone') {
      issues.push({
        type: 'dead-end',
        severity: 'warning',
        message: `${node.type} node "${node.label}" has no outgoing edges`,
        nodeId: node.id,
        details: 'This may be intentional (e.g., story endpoint)',
      });
    }
  }

  // Check for cycles (WARNING - may be intentional)
  const visited = new Set<string>();
  const stack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (stack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    stack.add(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (hasCycle(neighbor)) return true;
    }

    stack.delete(nodeId);
    return false;
  }

  for (const node of arcGraph.nodes) {
    if (hasCycle(node.id)) {
      issues.push({
        type: 'cycle',
        severity: 'warning',
        message: `Cycle detected involving ${node.type} node "${node.label}"`,
        nodeId: node.id,
        details: 'Cycles may be valid (e.g., repeatable quests)',
      });
      break; // Report once
    }
  }

  return issues;
}

/**
 * Comprehensive arc graph validation
 */
export function validateArcGraph(
  arcGraph: ArcGraph,
  sceneIds: Set<string>,
  options?: {
    worldId?: string;
    validateQuests?: boolean;
    validateCharacters?: boolean;
    questIds?: Set<string>;
    characterIds?: Set<string>;
  }
): ArcValidationResult {
  const issues: ArcValidationIssue[] = [];

  // Structural validation (from utils.ts, now migrated here)
  const nodeIds = new Set<string>();
  for (const node of arcGraph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        type: 'invalid-requirements',
        severity: 'error',
        message: `Duplicate node ID: ${node.id}`,
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);
  }

  for (const edge of arcGraph.edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({
        type: 'invalid-requirements',
        severity: 'error',
        message: `Edge ${edge.id} references non-existent source node: ${edge.from}`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        type: 'invalid-requirements',
        severity: 'error',
        message: `Edge ${edge.id} references non-existent target node: ${edge.to}`,
      });
    }
  }

  // Cross-layer reference validation
  issues.push(...validateArcGraphReferences(arcGraph, sceneIds, options?.worldId));

  // Structure validation (reachability, cycles, dead ends)
  issues.push(...validateArcGraphStructure(arcGraph));

  // Optional: Quest/character reference validation
  if (options?.validateQuests && options.questIds) {
    for (const node of arcGraph.nodes) {
      if (node.type === 'quest' && !options.questIds.has(node.id)) {
        issues.push({
          type: 'broken-quest-reference',
          severity: 'warning',
          message: `Quest node references undefined quest: ${node.id}`,
          nodeId: node.id,
        });
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
  };
}
```

Design notes (incorporating GPT's feedback):

- **Minimal dependencies:** `validateArcGraphReferences` takes only `sceneIds: Set<string>` (not the full graph store) to avoid tight coupling.
- **World-scoped validation:** Accepts optional `worldId` parameter for future per-world scene scoping.
- **Errors vs warnings:** Structural issues (unreachable, dead ends, cycles) are `severity: 'warning'` because they may be intentional design patterns. Only truly broken references are `severity: 'error'`.
- **Shared types:** `ArcValidationIssue` follows the same pattern as scene graph's `ValidationIssue` for UI consistency.

Acceptance:

- `arc-graph/validation.ts` exists with comprehensive validation.
- Arc graph store calls validation before operations (see section 2).
- Scene graph provides `getSceneIds()` selector for efficient validation.
- No broken scene references can be created without warning.

2. Dependency Tracking (Derived Views)

Problem:

- When deleting a scene, there's no way to know which arc nodes reference it.
- No "used by N arcs" indicator in scene toolbar.
- No cascade delete policy or warning modal.

Proposed:

**Do NOT store dependency index in Zustand state.** Instead, compute it as a derived view:

Create `apps/main/src/lib/graph/dependencies.ts`:

```typescript
import type { ArcGraph } from '../../modules/arc-graph';

export interface ArcSceneDependencyIndex {
  /** Map of sceneId → set of arc node IDs that reference it */
  sceneToArcNodes: Map<string, Set<string>>;
  /** Map of arc node ID → scene ID it references */
  arcNodeToScene: Map<string, string>;
}

/**
 * Build dependency index from all arc graphs.
 * This is a pure function - no state mutation.
 */
export function buildArcSceneDependencyIndex(
  arcGraphs: Record<string, ArcGraph>
): ArcSceneDependencyIndex {
  const sceneToArcNodes = new Map<string, Set<string>>();
  const arcNodeToScene = new Map<string, string>();

  for (const graph of Object.values(arcGraphs)) {
    for (const node of graph.nodes) {
      if (node.type !== 'arc_group' && node.sceneId) {
        // sceneId → arc nodes
        if (!sceneToArcNodes.has(node.sceneId)) {
          sceneToArcNodes.set(node.sceneId, new Set());
        }
        sceneToArcNodes.get(node.sceneId)!.add(node.id);

        // arc node → sceneId
        arcNodeToScene.set(node.id, node.sceneId);
      }
    }
  }

  return { sceneToArcNodes, arcNodeToScene };
}

/**
 * Get all arc nodes that reference a specific scene
 */
export function getArcNodesForScene(
  index: ArcSceneDependencyIndex,
  sceneId: string
): string[] {
  return Array.from(index.sceneToArcNodes.get(sceneId) || []);
}

/**
 * Get the scene referenced by an arc node
 */
export function getSceneForArcNode(
  index: ArcSceneDependencyIndex,
  arcNodeId: string
): string | undefined {
  return index.arcNodeToScene.get(arcNodeId);
}

/**
 * Check if a scene has any arc node dependencies
 */
export function sceneHasDependencies(
  index: ArcSceneDependencyIndex,
  sceneId: string
): boolean {
  return (index.sceneToArcNodes.get(sceneId)?.size ?? 0) > 0;
}
```

Create hooks in `apps/main/src/hooks/useArcSceneDependencies.ts`:

```typescript
import { useMemo } from 'react';
import { useArcGraphStore } from '../stores/arcGraphStore';
import { buildArcSceneDependencyIndex, type ArcSceneDependencyIndex } from '../lib/graph/dependencies';

/**
 * Hook to get the full dependency index.
 * Memoized based on arc graph store state.
 */
export function useArcSceneDependencyIndex(): ArcSceneDependencyIndex {
  const arcGraphs = useArcGraphStore(s => s.arcGraphs);

  return useMemo(
    () => buildArcSceneDependencyIndex(arcGraphs),
    [arcGraphs]
  );
}

/**
 * Get all arc nodes that reference a specific scene
 */
export function useSceneArcDependencies(sceneId: string): string[] {
  const index = useArcSceneDependencyIndex();

  return useMemo(
    () => Array.from(index.sceneToArcNodes.get(sceneId) || []),
    [index, sceneId]
  );
}

/**
 * Get the scene referenced by an arc node
 */
export function useArcSceneDependency(arcNodeId: string): string | undefined {
  const index = useArcSceneDependencyIndex();

  return useMemo(
    () => index.arcNodeToScene.get(arcNodeId),
    [index, arcNodeId]
  );
}

/**
 * Check if a scene has any dependencies (for delete warnings)
 */
export function useSceneHasDependencies(sceneId: string): boolean {
  const index = useArcSceneDependencyIndex();

  return useMemo(
    () => (index.sceneToArcNodes.get(sceneId)?.size ?? 0) > 0,
    [index, sceneId]
  );
}
```

Design notes (incorporating GPT's feedback):

- **Derived, not stored:** Dependencies are computed from arc graphs, not stored as separate state. This maintains single source of truth.
- **Pure functions:** `buildArcSceneDependencyIndex` is pure - no side effects, easy to test.
- **Memoized hooks:** `useMemo` ensures recomputation only when arc graphs change.
- **No sync burden:** No need to update dependency index on every mutation - it's always derived from current state.

Acceptance:

- `lib/graph/dependencies.ts` provides pure dependency tracking functions.
- `hooks/useArcSceneDependencies.ts` provides memoized hooks.
- Hooks are used in delete operations (see section 6).
- No stored dependency state in Zustand stores.

3. Shared Validation Types

Problem:

- Scene graphs use `ValidationIssue` type.
- Arc graphs need similar structure but different issue types.
- UI components (validation panel, node badges) should render both consistently.

Proposed:

Create `apps/main/src/modules/validation/types.ts`:

```typescript
/**
 * Shared validation types for scene graphs and arc graphs
 */

export type SceneValidationIssueType =
  | 'missing-start'
  | 'unreachable'
  | 'dead-end'
  | 'cycle'
  | 'empty-media'
  | 'invalid-selection'
  | 'no-nodes';

export type ArcValidationIssueType =
  | 'missing-start'
  | 'unreachable'
  | 'dead-end'
  | 'cycle'
  | 'broken-scene-reference'
  | 'broken-quest-reference'
  | 'broken-character-reference'
  | 'invalid-requirements'
  | 'orphaned-node';

export type ValidationIssueType = SceneValidationIssueType | ArcValidationIssueType;

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

/**
 * Severity levels for UI rendering
 */
export const SEVERITY_COLORS = {
  error: {
    bg: 'bg-red-500',
    text: 'text-red-500',
    icon: '🔴',
  },
  warning: {
    bg: 'bg-amber-500',
    text: 'text-amber-500',
    icon: '⚠️',
  },
  info: {
    bg: 'bg-blue-500',
    text: 'text-blue-500',
    icon: 'ℹ️',
  },
} as const;
```

Update `scene-builder/validation.ts` to import shared types:

```typescript
import type { ValidationIssue, ValidationResult, SceneValidationIssueType } from '../validation/types';

// Use imported types instead of local definitions
export type { ValidationIssue, ValidationResult, SceneValidationIssueType };
```

Update `arc-graph/validation.ts` to import shared types:

```typescript
import type { ValidationIssue, ValidationResult, ArcValidationIssueType } from '../validation/types';

// Use imported types instead of local definitions
export type { ValidationIssue, ValidationResult, ArcValidationIssueType };
```

Design notes:

- **Single source of truth:** Validation types live in one place.
- **UI consistency:** All validation panels can import `SEVERITY_COLORS` for consistent rendering.
- **Type safety:** `ValidationIssueType` is a union of both scene and arc types, allowing polymorphic handling.

Acceptance:

- `modules/validation/types.ts` exists with shared types.
- Scene and arc validation both use shared `ValidationIssue` structure.
- UI components can import shared severity rendering constants.

4. Integration with Arc Graph Store

Problem:

- Arc graph store operations (`addArcNode`, `updateArcNode`, etc.) don't validate.
- Store allows creation of broken references.

Proposed:

Update `stores/arcGraphStore/arcNodeSlice.ts` to call validation:

```typescript
import { validateArcGraphReferences } from '../../modules/arc-graph/validation';
import { useGraphStore } from '../graphStore';

// In addArcNode:
addArcNode: (node: ArcGraphNode) => {
  const { currentArcGraphId, arcGraphs } = get();
  if (!currentArcGraphId) {
    // ... error handling
    return;
  }

  const graph = arcGraphs[currentArcGraphId];
  if (!graph) {
    // ... error handling
    return;
  }

  // Validate scene reference if present
  if (node.type !== 'arc_group' && node.sceneId) {
    const sceneIds = new Set(Object.keys(useGraphStore.getState().scenes));
    const issues = validateArcGraphReferences(
      { ...graph, nodes: [...graph.nodes, node] },
      sceneIds
    );

    const errors = issues.filter(i => i.severity === 'error');
    if (errors.length > 0) {
      useToastStore.getState().addToast({
        type: 'warning',
        message: `Scene reference may be invalid: ${node.sceneId}`,
        duration: 5000,
      });
      // Allow with warning, don't block
    }
  }

  set((state) => ({
    // ... existing logic
  }), false, 'addArcNode');
},
```

**Note:** Validation is **non-blocking** (warning only) to allow workflow flexibility. Users can reference scenes they plan to create later.

Acceptance:

- Arc store validates scene references on add/update operations.
- Warnings are shown via toast, but operations are not blocked.
- Store imports validation from `arc-graph/validation.ts`, not inline.

5. Scene Graph Enhancements

Problem:

- Scene graph store needs to provide scene IDs efficiently for arc validation.

Proposed:

Add selector to `stores/graphStore/sceneSlice.ts`:

```typescript
/**
 * Get set of all scene IDs (for validation)
 */
getSceneIds: () => {
  const { scenes } = get();
  return new Set(Object.keys(scenes));
},
```

Acceptance:

- `graphStore` provides `getSceneIds()` selector.
- Arc validation uses this selector instead of accessing `scenes` object directly.

6. Cascade Delete Policies (Follow-up in Task 45)

Out of scope for this task, but define design direction:

When deleting a scene that has arc dependencies:

1. **Check dependencies** using `useSceneHasDependencies(sceneId)`
2. **Show modal** listing dependent arc nodes (via `useSceneArcDependencies(sceneId)`)
3. **Offer policies:**
   - **PREVENT:** Don't allow delete (default)
   - **SET_NULL:** Clear `sceneId` references in arc nodes
   - **CASCADE:** Delete referencing arc nodes (dangerous)
4. **Require explicit confirmation** for SET_NULL/CASCADE

This will be implemented in Task 45 (Visual Dependency Indicators).

Testing Plan

Unit Tests:

- `lib/graph/dependencies.test.ts`:
  - `buildArcSceneDependencyIndex` correctly maps scenes to arc nodes
  - Handles empty arc graphs
  - Handles arc nodes without scene references

- `modules/arc-graph/validation.test.ts`:
  - `validateArcGraphReferences` detects broken scene references
  - `validateArcGraphStructure` detects unreachable nodes, dead ends, cycles
  - Severity levels are correct (errors vs warnings)
  - World-scoped validation works correctly

Integration Tests:

- Create arc node with valid scene reference → no errors
- Create arc node with invalid scene reference → warning toast
- Delete scene → dependency hooks return correct arc nodes
- Update arc node scene reference → validation runs

Manual Testing:

- Open arc graph editor
- Add arc node and set `sceneId` to non-existent scene
- Verify warning toast appears
- Double-click node → verify error message is clear
- Delete scene with arc dependencies → (Task 45) verify warning modal

Documentation Updates

- Update `ARCHITECTURE.md`:
  - Add section "Graph Cross-Layer Validation"
  - Document dependency tracking design (derived views, not stored)
  - Document validation issue types and severity levels

- Update `docs/GRAPH_SYSTEM.md` (new file):
  - Comprehensive guide to multi-layer graph architecture
  - Scene graph → Arc graph → Character graph relationships
  - Validation strategies and best practices
  - Dependency tracking and cascade policies

- Add comments to `modules/arc-graph/validation.ts` explaining:
  - Why dependencies are derived, not stored
  - Why structural issues are warnings, not errors
  - World-scoped validation design (for future multi-world support)

Migration Notes

No breaking changes to existing stores or data structures. This task is purely additive:

- New validation module
- New dependency tracking utilities
- New hooks
- Enhanced store operations (non-blocking validation)

Existing arc graphs will continue to work. Validation warnings will surface broken references but won't block operations.

Follow-Up Tasks

This task is part of a larger graph architecture improvement series:

- **Task 43** (this task): Cross-layer validation and dependency tracking
- **Task 44**: Undo/Redo system with temporal middleware
- **Task 45**: Visual dependency indicators and cascade delete UI
- **Task 46**: World/Campaign graph layer above arcs
- **Task 47**: Scene lineage graph implementation

Related Work

- Task 33 Phase 33.5: Legacy component cleanup (ArcGraphPanel moved to modern architecture)
- Character Identity Graph (already implemented): Query-based meta layer
- Scene Graph Validation (already implemented): Structural validation patterns to reuse

Success Criteria

- [ ] `modules/arc-graph/validation.ts` exists with comprehensive validation
- [ ] `lib/graph/dependencies.ts` provides pure dependency tracking functions
- [ ] `hooks/useArcSceneDependencies.ts` provides memoized hooks
- [ ] Arc graph store validates scene references on add/update (non-blocking warnings)
- [ ] Scene graph store provides `getSceneIds()` selector
- [ ] All validation uses shared `ValidationIssue` types
- [ ] Unit tests cover validation and dependency tracking
- [ ] Documentation updated (ARCHITECTURE.md, new GRAPH_SYSTEM.md)
- [ ] No regressions: existing arc graphs continue to work
- [ ] No broken scene references can be created silently (warnings always shown)
"""
