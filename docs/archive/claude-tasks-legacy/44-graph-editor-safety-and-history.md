"""
Task 44 – Graph Editor Safety & History: Undo/Redo, Delete Warnings & Visual Feedback

Goal

Make graph editing safer and more forgiving by adding:

1. **Undo/Redo system** - Recover from mistakes with temporal middleware
2. **Cascade delete warnings** - Show dependencies before deleting scenes/arcs
3. **Visual dependency indicators** - Surface cross-layer relationships in UI
4. **Change tracking** - Track who/when modified (optional for collaboration)

This task focuses on **editor safety** and **preventing data loss**, using existing dependency tracking from Task 43.

Background

Current state:

- **No undo/redo** - Mistakes are permanent
- **No delete warnings** - Can delete scenes without knowing which arcs reference them
- **Dependencies hidden** - No visual indication that a scene is used by arcs
- **No change tracking** - Can't see modification history

Existing infrastructure to leverage:

```typescript
// Dependency tracking (from Task 43)
import {
  buildCompleteDependencyIndex,
  useSceneHasAnyDependencies,
  useArcHasCampaignDependencies
} from '../lib/graph/dependencies';

// Shared UI components
import { Modal, Button, Badge, Toast } from '@pixsim7/shared.ui';

// Stores to enhance
import { useGraphStore } from '../stores/graphStore';
import { useArcGraphStore } from '../stores/arcGraphStore';
import { useSceneCollectionStore } from '../stores/sceneCollectionStore';
import { useCampaignStore } from '../stores/campaignStore';
```

Dependencies:

- **Task 43** ✅ - Dependency tracking infrastructure (buildCompleteDependencyIndex)
- **Task 48** ✅ - Scene collections and campaigns (adds more layers to track)

Scope

Includes:

- `apps/main/src/stores/_shared/temporal.ts` - Temporal middleware wrapper
- `apps/main/src/components/delete-confirmation/` - Delete warning modals
- `apps/main/src/components/dependency-badge/` - Visual dependency indicators
- `apps/main/src/hooks/useUndo.ts` - Undo/redo hook
- Integration with all graph stores (scene, arc, collection, campaign)
  - Each store defines its own minimal `partialize` so only structural graph state (scenes/arcs/collections/campaigns and their current IDs) is tracked, and transient UI (selection/hover) is excluded.

Out of scope:

- Multi-user collaboration (real-time editing) - deferred to future task
- Conflict resolution - deferred to future task
- Version history beyond undo/redo - deferred to future task

Problems & Proposed Work

1. Undo/Redo System with Temporal Middleware

Problem:

- No way to recover from accidental deletions or edits
- Mistakes are permanent
- Users afraid to experiment
- No "oops" button

Proposed:

Create `apps/main/src/stores/_shared/temporal.ts`:

```typescript
import { temporal } from 'zundo';
import type { StateCreator } from 'zustand';

/**
 * Shared temporal middleware configuration
 *
 * Wraps Zustand stores with undo/redo history
 * Based on zundo (https://github.com/charkour/zundo)
 */
export interface TemporalConfig<T> {
  /** Max history entries to keep (default: 50) */
  limit?: number;

  /** Which state properties to track (omit for all) */
  partialize?: (state: T) => Partial<T>;

  /** Equality function for detecting changes */
  equality?: (a: Partial<T>, b: Partial<T>) => boolean;

  /** Diff algorithm (default: 'patch' for minimal storage) */
  diff?: 'patch' | 'snapshot';
}

/**
 * Create temporal store wrapper
 *
 * @example
 * const useGraphStore = create<GraphState>()(
 *   createTemporalStore(
 *     (set, get) => ({ ... }),
 *     {
 *       limit: 50,
 *       partialize: (state) => ({
 *         scenes: state.scenes,
 *         currentSceneId: state.currentSceneId,
 *       }),
 *     }
 *   )
 * );
 */
export function createTemporalStore<T>(
  stateCreator: StateCreator<T>,
  config?: TemporalConfig<T>
) {
  return temporal(stateCreator, {
    limit: config?.limit ?? 50,
    partialize: config?.partialize,
    equality: config?.equality ?? ((a, b) => a === b),
    handleSet: (handleSet) =>
      (state) => {
        // Only track if state actually changed
        handleSet(state);
      },
  });
}

/**
 * Default partialize for graph stores
 * Excludes transient UI state from history
 */
export function graphStorePartialize<T extends {
  scenes?: any;
  currentSceneId?: string;
  selectedNodeIds?: string[];
}>(state: T) {
  const { selectedNodeIds, ...tracked } = state;
  return tracked;
}
```

Update `stores/graphStore/index.ts`:

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createTemporalStore, graphStorePartialize } from '../_shared/temporal';

export const useGraphStore = create<GraphState>()(
  devtools(
    createTemporalStore(
      (set, get) => ({
        // ... existing slices
      }),
      {
        limit: 50,
        partialize: graphStorePartialize,
      }
    ),
    { name: 'GraphStore' }
  )
);

// Export temporal actions
export const useGraphStoreUndo = () => useGraphStore.temporal.undo;
export const useGraphStoreRedo = () => useGraphStore.temporal.redo;
export const useGraphStoreCanUndo = () => useGraphStore.temporal.getState().pastStates.length > 0;
export const useGraphStoreCanRedo = () => useGraphStore.temporal.getState().futureStates.length > 0;
```

Apply to all graph stores:

```typescript
// arcGraphStore
export const useArcGraphStore = create<ArcGraphState>()(
  devtools(
    createTemporalStore(
      (set, get) => ({ ... }),
      { limit: 50, partialize: (s) => ({ arcGraphs: s.arcGraphs, currentArcGraphId: s.currentArcGraphId }) }
    ),
    { name: 'ArcGraphStore' }
  )
);

// sceneCollectionStore
export const useSceneCollectionStore = create<SceneCollectionState>()(
  devtools(
    createTemporalStore(
      (set, get) => ({ ... }),
      { limit: 50, partialize: (s) => ({ collections: s.collections }) }
    ),
    { name: 'SceneCollectionStore' }
  )
);

// campaignStore
export const useCampaignStore = create<CampaignState>()(
  devtools(
    createTemporalStore(
      (set, get) => ({ ... }),
      { limit: 50, partialize: (s) => ({ campaigns: s.campaigns }) }
    ),
    { name: 'CampaignStore' }
  )
);
```

Create `hooks/useUndo.ts`:

```typescript
import { useCallback } from 'react';
import { useToast } from '@pixsim7/shared.ui';
import {
  useGraphStore, useGraphStoreUndo, useGraphStoreRedo,
  useGraphStoreCanUndo, useGraphStoreCanRedo
} from '../stores/graphStore';

/**
 * Unified undo/redo hook for graph stores
 *
 * Provides keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z)
 */
export function useGraphUndo() {
  const toast = useToast();
  const undo = useGraphStoreUndo();
  const redo = useGraphStoreRedo();
  const canUndo = useGraphStoreCanUndo();
  const canRedo = useGraphStoreCanRedo();

  const handleUndo = useCallback(() => {
    if (canUndo) {
      undo();
      toast.info('Undone');
    }
  }, [canUndo, undo, toast]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      redo();
      toast.info('Redone');
    }
  }, [canRedo, redo, toast]);

  // Keyboard shortcuts (attached to window)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  return { undo: handleUndo, redo: handleRedo, canUndo, canRedo };
}
```

Add undo/redo buttons to toolbar:

```typescript
// In WorkspaceToolbar or GraphPanel toolbar
import { Button } from '@pixsim7/shared.ui';
import { useGraphUndo } from '../hooks/useUndo';

export function GraphToolbar() {
  const { undo, redo, canUndo, canRedo } = useGraphUndo();

  return (
    <div className="flex gap-2">
      <Button onClick={undo} disabled={!canUndo} size="sm" title="Undo (Ctrl+Z)">
        ↶ Undo
      </Button>
      <Button onClick={redo} disabled={!canRedo} size="sm" title="Redo (Ctrl+Shift+Z)">
        ↷ Redo
      </Button>
      {/* ... other toolbar buttons */}
    </div>
  );
}
```

**Key design decisions:**

- ✅ **Use zundo** - Battle-tested temporal middleware for Zustand
- ✅ **Shared wrapper** - `createTemporalStore` used by all stores
- ✅ **Partialize state** - Only track graph data, exclude UI state (selections, hover, etc.)
- ✅ **50-state limit** - Balance memory vs history depth
- ✅ **Standard shortcuts** - Ctrl+Z (undo), Ctrl+Shift+Z (redo)
- ✅ **Toast feedback** - Confirm undo/redo actions

Acceptance:

- All graph stores (scene, arc, collection, campaign) have undo/redo
- Ctrl+Z undoes last action
- Ctrl+Shift+Z redoes
- Toolbar shows undo/redo buttons (disabled when no history)
- Toast notifications confirm actions
- History limited to 50 states (configurable)
- Transient UI state (selections) excluded from history

2. Cascade Delete Warnings

Problem:

- Can delete a scene without knowing 5 arc nodes reference it
- Can delete an arc without knowing it's part of 2 campaigns
- No warning about breaking references
- No options for handling dependents (clear refs vs prevent delete)

Proposed:

Create `components/delete-confirmation/DeleteConfirmationModal.tsx`:

```typescript
import { useMemo } from 'react';
import { Modal, Button, Badge } from '@pixsim7/shared.ui';
import { useSceneHasAnyDependencies } from '../../hooks/useArcSceneDependencies';
import { useArcHasCampaignDependencies } from '../../hooks/useCampaignDependencies';

export type DeletePolicy = 'PREVENT' | 'SET_NULL' | 'CASCADE';

interface DeleteConfirmationModalProps {
  type: 'scene' | 'arc' | 'collection' | 'campaign';
  id: string;
  name: string;
  onConfirm: (policy: DeletePolicy) => void;
  onCancel: () => void;
}

/**
 * Delete Confirmation Modal with Dependency Warnings
 *
 * Shows all dependencies and lets user choose how to handle them
 */
export function DeleteConfirmationModal({
  type,
  id,
  name,
  onConfirm,
  onCancel,
}: DeleteConfirmationModalProps) {
  const deps = useDependencies(type, id);

  const hasDeps = deps.total > 0;
  const defaultPolicy: DeletePolicy = hasDeps ? 'PREVENT' : 'SET_NULL';

  return (
    <Modal isOpen={true} onClose={onCancel} title="Confirm Delete">
      <div className="space-y-4">
        <p className="text-sm">
          Are you sure you want to delete <strong>{name}</strong>?
        </p>

        {/* Dependency warnings */}
        {hasDeps && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                ⚠️ Warning: This {type} is used by:
              </span>
            </div>

            <ul className="text-sm space-y-1 ml-4">
              {deps.arcNodes.length > 0 && (
                <li>
                  <Badge variant="warning">{deps.arcNodes.length}</Badge> arc node(s)
                </li>
              )}
              {deps.collections.length > 0 && (
                <li>
                  <Badge variant="warning">{deps.collections.length}</Badge> scene collection(s)
                </li>
              )}
              {deps.campaigns.length > 0 && (
                <li>
                  <Badge variant="warning">{deps.campaigns.length}</Badge> campaign(s)
                </li>
              )}
            </ul>

            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              Deleting will break these references. Choose how to handle them:
            </p>
          </div>
        )}

        {/* Policy selection */}
        <div className="space-y-2">
          <PolicyOption
            policy="PREVENT"
            label="Cancel Delete"
            description="Don't delete. Fix dependencies first."
            recommended={hasDeps}
            onClick={() => onCancel()}
          />

          {hasDeps && (
            <PolicyOption
              policy="SET_NULL"
              label="Clear References"
              description="Delete and clear references (arc nodes will have broken scene links)"
              onClick={() => onConfirm('SET_NULL')}
            />
          )}

          {hasDeps && (
            <PolicyOption
              policy="CASCADE"
              label="Cascade Delete (Dangerous)"
              description="Delete this AND all referencing items"
              dangerous
              onClick={() => onConfirm('CASCADE')}
            />
          )}

          {!hasDeps && (
            <Button onClick={() => onConfirm('SET_NULL')} variant="danger" className="w-full">
              Delete
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PolicyOption({
  policy, label, description, recommended, dangerous, onClick
}: {
  policy: DeletePolicy;
  label: string;
  description: string;
  recommended?: boolean;
  dangerous?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full p-3 rounded border text-left transition-colors
        ${recommended ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}
        ${dangerous ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}
        ${!recommended && !dangerous ? 'border-neutral-300 dark:border-neutral-600' : ''}
        hover:bg-neutral-100 dark:hover:bg-neutral-800
      `}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{label}</span>
        {recommended && <Badge variant="success">Recommended</Badge>}
        {dangerous && <Badge variant="danger">Dangerous</Badge>}
      </div>
      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
        {description}
      </p>
    </button>
  );
}
```

Create dependency lookup hook:

```typescript
// hooks/useDependencies.ts
import { useMemo } from 'react';
import { useArcSceneDependencyIndex } from './useArcSceneDependencies';
import { useSceneCollectionStore } from '../stores/sceneCollectionStore';
import { useCampaignStore } from '../stores/campaignStore';

export function useDependencies(type: 'scene' | 'arc' | 'collection' | 'campaign', id: string) {
  const index = useArcSceneDependencyIndex();
  const collections = useSceneCollectionStore(s => s.collections);
  const campaigns = useCampaignStore(s => s.campaigns);

  return useMemo(() => {
    const result = {
      arcNodes: [] as string[],
      collections: [] as string[],
      campaigns: [] as string[],
      total: 0,
    };

    if (type === 'scene') {
      // Find arc nodes referencing this scene
      result.arcNodes = Array.from(index.sceneToArcNodes.get(id) || []);

      // Find collections containing this scene
      result.collections = Object.values(collections)
        .filter(c => c.scenes.some(s => s.sceneId === id))
        .map(c => c.id);
    }

    if (type === 'arc') {
      // Find campaigns containing this arc
      result.campaigns = Object.values(campaigns)
        .filter(c => c.arcs.some(a => a.arcGraphId === id))
        .map(c => c.id);
    }

    result.total = result.arcNodes.length + result.collections.length + result.campaigns.length;
    return result;
  }, [type, id, index, collections, campaigns]);
}
```

Integrate with delete operations:

```typescript
// In graphStore deleteScene action
deleteScene: (id: string, policy?: DeletePolicy) => {
  const { scenes } = get();
  const scene = scenes[id];
  if (!scene) return;

  // Check dependencies
  const deps = getDependencies('scene', id);

  if (deps.total > 0 && policy === 'PREVENT') {
    // Show modal (handled by UI component)
    return;
  }

  if (policy === 'SET_NULL') {
    // Clear references in arc nodes
    clearSceneReferences(id);
  }

  if (policy === 'CASCADE') {
    // Delete arc nodes that reference this scene
    cascadeDeleteScene(id);
  }

  // Proceed with delete
  const { [id]: removed, ...rest } = scenes;
  set({ scenes: rest });
},
```

**Key design decisions:**

- ✅ **Use dependency index** - From Task 43, already built
- ✅ **Three policies** - PREVENT (default), SET_NULL, CASCADE
- ✅ **Visual warnings** - Show exactly what will be affected
- ✅ **Recommended actions** - Guide users toward safe choices
- ✅ **Dangerous badges** - Warn about CASCADE delete

Acceptance:

- Deleting scene shows dependencies (arc nodes, collections)
- Deleting arc shows dependencies (campaigns)
- Modal offers policy options (prevent, clear refs, cascade)
- PREVENT is default for items with dependencies
- CASCADE shows danger warning
- Uses dependency tracking from Task 43

3. Visual Dependency Indicators

Problem:

- No way to see "this scene is used by 5 arcs" without opening a modal
- Dependencies hidden until delete attempt
- Can't quickly scan for orphaned or heavily-used content

Proposed:

Create `components/dependency-badge/DependencyBadge.tsx`:

```typescript
import { useMemo } from 'react';
import { Badge, Tooltip } from '@pixsim7/shared.ui';
import { useDependencies } from '../../hooks/useDependencies';

/**
 * Dependency Badge - Shows usage count
 *
 * Displays on scenes/arcs to show how many other items reference them
 */
export function DependencyBadge({
  type,
  id,
}: {
  type: 'scene' | 'arc' | 'collection' | 'campaign';
  id: string;
}) {
  const deps = useDependencies(type, id);

  if (deps.total === 0) return null;

  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-semibold">Used by:</div>
      {deps.arcNodes.length > 0 && <div>• {deps.arcNodes.length} arc node(s)</div>}
      {deps.collections.length > 0 && <div>• {deps.collections.length} collection(s)</div>}
      {deps.campaigns.length > 0 && <div>• {deps.campaigns.length} campaign(s)</div>}
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <Badge variant="info" size="sm">
        🔗 {deps.total}
      </Badge>
    </Tooltip>
  );
}
```

Integrate into scene list/cards:

```typescript
// In SceneLibraryPanel or SceneCard
import { DependencyBadge } from '../dependency-badge/DependencyBadge';

export function SceneCard({ scene }: { scene: DraftScene }) {
  return (
    <div className="scene-card p-3 border rounded">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{scene.title}</h3>

        {/* NEW: Dependency badge */}
        <DependencyBadge type="scene" id={scene.id} />
      </div>
      {/* ... rest of card */}
    </div>
  );
}
```

Add to arc graph nodes:

```typescript
// In ArcNode.tsx
export function ArcNode({ id, data, selected }: NodeProps<ArcNodeData>) {
  return (
    <div className="arc-node">
      {/* Header with dependency badge */}
      <div className="header flex items-center justify-between">
        <span>{data.label}</span>
        <DependencyBadge type="arc" id={id} />
      </div>
      {/* ... rest of node */}
    </div>
  );
}
```

**Key design decisions:**

- ✅ **Use shared Badge/Tooltip** - From @pixsim7/shared.ui
- ✅ **Non-intrusive** - Only shows if dependencies exist
- ✅ **Hover for details** - Tooltip shows breakdown
- ✅ **Consistent placement** - Top-right of cards/nodes

Acceptance:

- Scenes show "🔗 5" badge if used by 5 arc nodes
- Arcs show badge if used by campaigns
- Hover tooltip shows breakdown (3 arcs, 2 collections)
- Badge only appears when deps > 0
- Uses shared Badge and Tooltip components

4. Change Tracking (Optional Enhancement)

Problem:

- No record of who modified what
- Can't see modification history
- Useful for team collaboration (future)

Proposed (minimal implementation):

Add `updatedAt` tracking to all entities:

```typescript
// Already exists in types, just enforce usage
interface DraftScene {
  // ...
  createdAt?: string;
  updatedAt?: string;  // Update on every modification
  modifiedBy?: string; // Optional: user ID/name
}
```

Update stores to track timestamps:

```typescript
// In all CRUD operations
updateScene: (id, patch) => {
  set((state) => ({
    scenes: {
      ...state.scenes,
      [id]: {
        ...state.scenes[id],
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    },
  }));
},
```

Display in inspector:

```typescript
// In InspectorPanel
export function SceneMetadata({ scene }: { scene: DraftScene }) {
  return (
    <div className="text-xs text-neutral-500">
      {scene.createdAt && (
        <div>Created: {formatDate(scene.createdAt)}</div>
      )}
      {scene.updatedAt && (
        <div>Modified: {formatDate(scene.updatedAt)}</div>
      )}
    </div>
  );
}
```

**Key design decisions:**

- ✅ **Timestamps only** - No complex change log (defer to future)
- ✅ **ISO 8601 format** - Standard date format
- ✅ **Optional user tracking** - `modifiedBy` field for future collaboration

Acceptance:

- All scenes/arcs/collections/campaigns track `updatedAt`
- Inspector shows last modified time
- Optional `modifiedBy` field populated if user system exists

Testing Plan

Unit Tests:

- `stores/_shared/temporal.test.ts`:
  - Undo/redo works correctly
  - History limited to 50 states
  - Partialize excludes UI state

- `hooks/useDependencies.test.ts`:
  - Correctly counts dependencies across layers
  - Handles missing dependencies

Integration Tests:

- Undo scene delete → Scene restored
- Delete scene with dependencies → Warning modal appears
- Choose SET_NULL policy → References cleared
- Choose CASCADE policy → Dependents deleted
- Dependency badges show correct counts
- Ctrl+Z/Ctrl+Shift+Z keyboard shortcuts work

Manual Testing:

- Create scene → Delete → Undo → Scene restored
- Edit arc → Undo → Changes reverted
- Delete scene with 3 arc dependencies → Modal shows "Used by 3 arc nodes"
- Choose "Clear References" → Arc nodes have broken scene links
- Dependency badges visible on all scenes/arcs
- Hover badge → Tooltip shows breakdown

Documentation Updates

- Update `ARCHITECTURE.md`:
  - Document temporal middleware pattern
  - Explain cascade delete policies

- Create `docs/UNDO_REDO.md`:
  - How undo/redo works
  - What's tracked vs excluded
  - History limits and configuration

- Update `docs/GRAPH_SYSTEM.md`:
  - Add dependency visualization section
  - Document delete policies

Migration Notes

No breaking changes. All features are additive:

- Undo/redo wraps existing stores (transparent)
- Delete modals replace direct deletes (UX improvement)
- Dependency badges are optional additions
- Timestamps added to existing entities (backward compatible)

Dependencies

- **zundo** - Temporal middleware for Zustand (install: `pnpm add zundo`)
- **Task 43** ✅ - Dependency tracking (buildCompleteDependencyIndex)
- **Task 48** ✅ - Collections/campaigns (adds more layers)

Follow-Up Tasks

- **Task 50**: Advanced collaboration (real-time editing, conflict resolution)
- **Task 51**: Version history beyond undo/redo (git-like commits)
- **Task 52**: Audit log (comprehensive change tracking)

Success Criteria

- [ ] All graph stores have undo/redo (scene, arc, collection, campaign)
- [ ] `createTemporalStore` wrapper used consistently
- [ ] Ctrl+Z undoes, Ctrl+Shift+Z redoes
- [ ] Toolbar shows undo/redo buttons
- [ ] Delete operations show dependency warnings
- [ ] Delete modal offers PREVENT/SET_NULL/CASCADE policies
- [ ] Dependency badges visible on scenes and arcs
- [ ] Tooltip shows dependency breakdown
- [ ] Timestamps tracked on all entities
- [ ] Unit and integration tests pass
- [ ] zundo installed and configured
- [ ] Documentation complete
"""
