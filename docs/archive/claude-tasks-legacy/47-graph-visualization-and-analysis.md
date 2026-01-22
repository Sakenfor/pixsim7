"""
Task 47 – Graph Visualization & Analysis: Lineage, Dependencies & Impact Analysis

Goal

Add visualization and analysis tools to help understand graph structure and relationships:

1. **Scene lineage graph** - Visualize scene call hierarchy (what calls what)
2. **Cross-layer dependency visualization** - See connections between scenes/arcs/collections/campaigns
3. **Impact analysis** - "What will break if I change/delete this?"
4. **Graph analytics panel** - Stats, orphans, broken refs, complexity metrics

This task focuses on **understanding the graph** rather than editing it, complementing Task 44's safety features.

Background

Current state:

- **No lineage visualization** - Can't see scene_call hierarchy
- **Dependencies hidden** - Task 43 tracks deps, but no visual representation
- **No impact analysis** - Can't predict consequences of changes
- **No analytics** - No visibility into graph health/complexity

Existing infrastructure to leverage:

```typescript
// Dependency tracking (from Task 43)
import { buildCompleteDependencyIndex } from '../lib/graph/dependencies';

// Shared UI
import { Panel, Tabs, Button, Badge } from '@pixsim7/shared.ui';

// Graph data
import { useGraphStore } from '../stores/graphStore';
import { useArcGraphStore } from '../stores/arcGraphStore';
import { useSceneCollectionStore } from '../stores/sceneCollectionStore';
import { useCampaignStore } from '../stores/campaignStore';
```

Dependencies:

- **Task 43** ✅ - Dependency tracking infrastructure
- **Task 48** ✅ - Collections/campaigns (more layers to visualize)

Scope

Includes:

- `apps/main/src/components/lineage-graph/` - Scene call lineage visualization
- `apps/main/src/components/dependency-graph/` - Cross-layer dependency viz
- `apps/main/src/components/impact-analysis/` - Impact analysis tool
- `apps/main/src/components/graph-analytics/` - Analytics panel
- `apps/main/src/lib/graph/lineage.ts` - Lineage computation utilities
- `apps/main/src/lib/graph/analytics.ts` - Graph analysis functions

Out of scope:

- Real-time graph updates (static analysis only)
- Advanced graph algorithms (betweenness centrality, etc.) - deferred
- Export to external graph tools - deferred
- 3D graph visualization - deferred

Problems & Proposed Work

1. Scene Lineage Graph

Problem:

- `scene_call` nodes create parent/child relationships between scenes
- No way to visualize "Scene A calls Scene B, which calls Scene C and D"
- Can't see call depth or hierarchy
- Difficult to understand reusable scene patterns

Proposed:

Create `lib/graph/lineage.ts`:

```typescript
import type { DraftScene, DraftSceneNode } from '../../modules/scene-builder';

export interface LineageNode {
  sceneId: string;
  sceneName: string;
  depth: number;
  children: LineageNode[];
  callCount: number; // How many times this scene is called
}

/**
 * Build scene lineage tree from scene_call relationships
 *
 * @param rootSceneId - Starting scene (usually from arc or campaign)
 * @param scenes - All scenes
 * @param maxDepth - Max recursion depth (default: 10)
 */
export function buildSceneLineage(
  rootSceneId: string,
  scenes: Record<string, DraftScene>,
  maxDepth = 10
): LineageNode | null {
  const visited = new Set<string>();

  function buildNode(sceneId: string, depth: number): LineageNode | null {
    if (depth > maxDepth) return null;
    if (visited.has(sceneId)) {
      // Circular reference detected
      return {
        sceneId,
        sceneName: scenes[sceneId]?.title || sceneId,
        depth,
        children: [],
        callCount: 0,
      };
    }

    visited.add(sceneId);

    const scene = scenes[sceneId];
    if (!scene) return null;

    // Find all scene_call nodes
    const sceneCallNodes = scene.nodes.filter(n => n.type === 'scene_call');
    const children: LineageNode[] = [];

    for (const callNode of sceneCallNodes) {
      const calledSceneId = (callNode as any).called_scene_id;
      if (calledSceneId) {
        const childNode = buildNode(calledSceneId, depth + 1);
        if (childNode) {
          childNode.callCount++;
          children.push(childNode);
        }
      }
    }

    return {
      sceneId,
      sceneName: scene.title,
      depth,
      children,
      callCount: 0,
    };
  }

  return buildNode(rootSceneId, 0);
}

/**
 * Get all scenes called by a given scene (direct children)
 */
export function getDirectChildren(
  sceneId: string,
  scenes: Record<string, DraftScene>
): string[] {
  const scene = scenes[sceneId];
  if (!scene) return [];

  const sceneCallNodes = scene.nodes.filter(n => n.type === 'scene_call');
  return sceneCallNodes
    .map(n => (n as any).called_scene_id)
    .filter(Boolean);
}

/**
 * Get all scenes that call a given scene (parents)
 */
export function getParentScenes(
  sceneId: string,
  scenes: Record<string, DraftScene>
): string[] {
  const parents: string[] = [];

  for (const [id, scene] of Object.entries(scenes)) {
    const children = getDirectChildren(id, scenes);
    if (children.includes(sceneId)) {
      parents.push(id);
    }
  }

  return parents;
}
```

Create `components/lineage-graph/LineageGraphPanel.tsx`:

```typescript
import { useState, useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import { Panel, Button } from '@pixsim7/shared.ui';
import { useGraphStore } from '../../stores/graphStore';
import { buildSceneLineage } from '../../lib/graph/lineage';

/**
 * Scene Lineage Graph Panel
 *
 * Visualizes scene_call hierarchy as a tree
 */
export function LineageGraphPanel({ rootSceneId }: { rootSceneId: string }) {
  const scenes = useGraphStore(s => s.scenes);

  const lineageTree = useMemo(
    () => buildSceneLineage(rootSceneId, scenes),
    [rootSceneId, scenes]
  );

  // Convert lineage tree to ReactFlow nodes/edges
  const { nodes, edges } = useMemo(() => {
    if (!lineageTree) return { nodes: [], edges: [] };

    const nodes: any[] = [];
    const edges: any[] = [];

    function traverse(node: LineageNode, parentId?: string) {
      const nodeId = `${node.sceneId}-${node.depth}`;

      nodes.push({
        id: nodeId,
        type: 'lineage',
        position: { x: node.depth * 250, y: nodes.filter(n => n.position.x === node.depth * 250).length * 100 },
        data: {
          sceneId: node.sceneId,
          sceneName: node.sceneName,
          callCount: node.callCount,
          depth: node.depth,
        },
      });

      if (parentId) {
        edges.push({
          id: `${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          type: 'smoothstep',
        });
      }

      node.children.forEach(child => traverse(child, nodeId));
    }

    traverse(lineageTree);

    return { nodes, edges };
  }, [lineageTree]);

  return (
    <Panel title="Scene Lineage">
      <div className="h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ lineage: LineageNode }}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </Panel>
  );
}

// Custom node component for lineage
function LineageNode({ data }: any) {
  return (
    <div className="px-3 py-2 bg-white dark:bg-neutral-800 border-2 border-purple-500 rounded shadow">
      <div className="font-semibold text-sm">{data.sceneName}</div>
      <div className="text-xs text-neutral-500">Depth: {data.depth}</div>
      {data.callCount > 1 && (
        <div className="text-xs text-amber-600">Called {data.callCount}x</div>
      )}
    </div>
  );
}
```

**Key design decisions:**

- ✅ **Reuse ReactFlow** - Same library as scene/arc graphs
- ✅ **Tree layout** - Horizontal tree (depth = x-axis)
- ✅ **Detect cycles** - Show circular references
- ✅ **Call count** - Highlight heavily reused scenes

Acceptance:

- Lineage graph shows scene_call hierarchy
- Root scene at depth 0, children at depth 1, etc.
- Circular references detected and marked
- Reused scenes show call count
- Uses ReactFlow (consistent with other graphs)

2. Cross-Layer Dependency Visualization

Problem:

- Can't see full picture of "what depends on what" across all layers
- Dependency index (Task 43) exists but no visualization
- Hard to understand interconnections between scenes/arcs/collections/campaigns

Proposed:

Create `components/dependency-graph/DependencyGraphPanel.tsx`:

```typescript
import { useMemo } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import { Panel, Tabs } from '@pixsim7/shared.ui';
import { useArcSceneDependencyIndex } from '../../hooks/useArcSceneDependencies';
import { useGraphStore } from '../../stores/graphStore';
import { useArcGraphStore } from '../../stores/arcGraphStore';

/**
 * Cross-Layer Dependency Graph
 *
 * Shows connections between scenes, arc nodes, collections, campaigns
 */
export function DependencyGraphPanel() {
  const index = useArcSceneDependencyIndex();
  const scenes = useGraphStore(s => s.scenes);
  const arcGraphs = useArcGraphStore(s => s.arcGraphs);

  const { nodes, edges } = useMemo(() => {
    const nodes: any[] = [];
    const edges: any[] = [];

    // Add scene nodes (Layer 1)
    Object.values(scenes).forEach((scene, i) => {
      nodes.push({
        id: `scene-${scene.id}`,
        type: 'dependency',
        position: { x: 0, y: i * 80 },
        data: {
          type: 'scene',
          label: scene.title,
          id: scene.id,
        },
      });
    });

    // Add arc nodes (Layer 2) and edges to scenes
    let arcNodeY = 0;
    for (const [arcId, arcGraph] of Object.entries(arcGraphs)) {
      arcGraph.nodes.forEach(arcNode => {
        if (arcNode.sceneId) {
          nodes.push({
            id: `arc-${arcNode.id}`,
            type: 'dependency',
            position: { x: 300, y: arcNodeY * 80 },
            data: {
              type: 'arc',
              label: arcNode.label,
              id: arcNode.id,
            },
          });

          // Edge from scene to arc node
          edges.push({
            id: `${arcNode.sceneId}-${arcNode.id}`,
            source: `scene-${arcNode.sceneId}`,
            target: `arc-${arcNode.id}`,
            type: 'step',
            style: { stroke: '#6366f1' },
          });

          arcNodeY++;
        }
      });
    }

    return { nodes, edges };
  }, [index, scenes, arcGraphs]);

  return (
    <Panel title="Dependency Graph">
      <Tabs tabs={['Scene ↔ Arc', 'Arc ↔ Campaign', 'Full View']}>
        <div className="h-[600px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={{ dependency: DependencyNode }}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* Other tab views */}
      </Tabs>
    </Panel>
  );
}

function DependencyNode({ data }: any) {
  const colors = {
    scene: 'border-blue-500',
    arc: 'border-indigo-500',
    collection: 'border-purple-500',
    campaign: 'border-pink-500',
  };

  return (
    <div className={`px-3 py-2 bg-white dark:bg-neutral-800 border-2 ${colors[data.type]} rounded shadow`}>
      <div className="text-xs text-neutral-500">{data.type}</div>
      <div className="font-semibold text-sm">{data.label}</div>
    </div>
  );
}
```

**Key design decisions:**

- ✅ **Layer-based layout** - Scenes left, arcs middle, campaigns right
- ✅ **Color-coded** - Different colors for each layer
- ✅ **Tabbed views** - Filter by layer pair (Scene↔Arc, Arc↔Campaign, etc.)
- ✅ **Reuse ReactFlow** - Consistent with other graphs

Acceptance:

- Dependency graph shows all cross-layer connections
- Scenes on left, arcs in middle, campaigns on right
- Color-coded by layer
- Tabbed filtering (Scene↔Arc, Arc↔Campaign, Full View)
- Uses ReactFlow for consistency

3. Impact Analysis Tool

Problem:

- Before changing/deleting an item, can't see full impact
- "If I change this scene, what arcs/campaigns are affected?"
- No ripple effect visualization

Proposed:

Create `components/impact-analysis/ImpactAnalysisPanel.tsx`:

```typescript
import { useMemo } from 'react';
import { Panel, Badge } from '@pixsim7/shared.ui';
import { useDependencies } from '../../hooks/useDependencies';
import { useGraphStore } from '../../stores/graphStore';

/**
 * Impact Analysis Panel
 *
 * Shows ripple effects of changing/deleting an item
 */
export function ImpactAnalysisPanel({
  type,
  id,
}: {
  type: 'scene' | 'arc' | 'collection' | 'campaign';
  id: string;
}) {
  const deps = useDependencies(type, id);
  const scenes = useGraphStore(s => s.scenes);

  // Compute impact
  const impact = useMemo(() => {
    const result = {
      directDeps: deps.total,
      indirectDeps: 0,
      affectedItems: [] as Array<{ type: string; id: string; name: string }>,
      complexity: 'low' as 'low' | 'medium' | 'high',
    };

    // Direct dependencies
    deps.arcNodes.forEach(arcNodeId => {
      result.affectedItems.push({
        type: 'arc_node',
        id: arcNodeId,
        name: arcNodeId, // TODO: Get actual arc node name
      });
    });

    deps.collections.forEach(collId => {
      result.affectedItems.push({
        type: 'collection',
        id: collId,
        name: collId,
      });
    });

    deps.campaigns.forEach(campId => {
      result.affectedItems.push({
        type: 'campaign',
        id: campId,
        name: campId,
      });
    });

    // Compute indirect dependencies (dependencies of dependencies)
    // For example, if changing a scene affects arc nodes, and those arc nodes
    // are in campaigns, those campaigns are indirectly affected
    // TODO: Implement recursive dependency traversal

    // Complexity assessment
    if (result.directDeps === 0) result.complexity = 'low';
    else if (result.directDeps < 5) result.complexity = 'medium';
    else result.complexity = 'high';

    return result;
  }, [deps, type, id]);

  return (
    <Panel title="Impact Analysis">
      <div className="p-4 space-y-4">
        {/* Impact summary */}
        <div className="flex items-center gap-4">
          <div>
            <div className="text-2xl font-bold">{impact.directDeps}</div>
            <div className="text-xs text-neutral-500">Direct Dependencies</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{impact.indirectDeps}</div>
            <div className="text-xs text-neutral-500">Indirect Dependencies</div>
          </div>
          <div>
            <Badge
              variant={
                impact.complexity === 'low' ? 'success' :
                impact.complexity === 'medium' ? 'warning' : 'danger'
              }
            >
              {impact.complexity.toUpperCase()} Complexity
            </Badge>
          </div>
        </div>

        {/* Affected items list */}
        <div>
          <h3 className="font-semibold mb-2">Affected Items</h3>
          {impact.affectedItems.length === 0 ? (
            <p className="text-sm text-neutral-500">No dependencies. Safe to modify or delete.</p>
          ) : (
            <div className="space-y-1">
              {impact.affectedItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm p-2 bg-neutral-100 dark:bg-neutral-800 rounded">
                  <Badge size="sm">{item.type}</Badge>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
          <div className="font-semibold text-sm mb-1">Recommendations</div>
          <ul className="text-xs space-y-1 list-disc list-inside">
            {impact.complexity === 'low' && (
              <li>Low risk. Safe to proceed with changes.</li>
            )}
            {impact.complexity === 'medium' && (
              <>
                <li>Moderate risk. Review affected items before proceeding.</li>
                <li>Consider creating a backup or using version control.</li>
              </>
            )}
            {impact.complexity === 'high' && (
              <>
                <li>High risk. Major impact on other content.</li>
                <li>Strongly recommend reviewing all affected items.</li>
                <li>Consider breaking into smaller changes.</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
```

**Key design decisions:**

- ✅ **Complexity rating** - Low/Medium/High based on dep count
- ✅ **Direct + indirect deps** - Show ripple effects
- ✅ **Recommendations** - Guide users based on impact
- ✅ **Actionable** - Clear list of affected items

Acceptance:

- Impact panel shows direct dependencies
- Complexity rating (low/medium/high) displayed
- List of affected items shown
- Recommendations provided based on complexity
- Uses dependency tracking from Task 43

4. Graph Analytics Panel

Problem:

- No overall health metrics for graphs
- Can't find orphaned content
- No visibility into broken references
- No complexity metrics

Proposed:

Create `lib/graph/analytics.ts`:

```typescript
import type { DraftScene } from '../../modules/scene-builder';
import type { ArcGraph } from '../../modules/arc-graph';

export interface GraphAnalytics {
  scenes: {
    total: number;
    orphaned: number; // Not referenced by any arc
    broken: number;   // Have broken references
    avgComplexity: number; // Avg nodes per scene
  };
  arcs: {
    total: number;
    orphaned: number; // Not in any campaign
    broken: number;   // Have broken scene refs
  };
  dependencies: {
    totalLinks: number;
    brokenLinks: number;
    circularRefs: number;
  };
}

export function analyzeGraphs(
  scenes: Record<string, DraftScene>,
  arcGraphs: Record<string, ArcGraph>,
  dependencyIndex: any
): GraphAnalytics {
  const analytics: GraphAnalytics = {
    scenes: {
      total: Object.keys(scenes).length,
      orphaned: 0,
      broken: 0,
      avgComplexity: 0,
    },
    arcs: {
      total: 0,
      orphaned: 0,
      broken: 0,
    },
    dependencies: {
      totalLinks: 0,
      brokenLinks: 0,
      circularRefs: 0,
    },
  };

  // Analyze scenes
  let totalNodes = 0;
  for (const scene of Object.values(scenes)) {
    totalNodes += scene.nodes.length;

    // Check if orphaned (not referenced by any arc)
    const refs = dependencyIndex.sceneToArcNodes.get(scene.id);
    if (!refs || refs.size === 0) {
      analytics.scenes.orphaned++;
    }

    // TODO: Check for broken references in scene nodes
  }
  analytics.scenes.avgComplexity = totalNodes / analytics.scenes.total || 0;

  // Analyze arcs
  for (const arcGraph of Object.values(arcGraphs)) {
    analytics.arcs.total += arcGraph.nodes.length;

    // Check for broken scene refs
    for (const arcNode of arcGraph.nodes) {
      if (arcNode.type !== 'arc_group' && arcNode.sceneId) {
        if (!scenes[arcNode.sceneId]) {
          analytics.arcs.broken++;
          analytics.dependencies.brokenLinks++;
        }
      }
    }
  }

  analytics.dependencies.totalLinks = dependencyIndex.sceneToArcNodes.size;

  return analytics;
}
```

Create `components/graph-analytics/GraphAnalyticsPanel.tsx`:

```typescript
import { useMemo } from 'react';
import { Panel, Badge } from '@pixsim7/shared.ui';
import { useGraphStore } from '../../stores/graphStore';
import { useArcGraphStore } from '../../stores/arcGraphStore';
import { useArcSceneDependencyIndex } from '../../hooks/useArcSceneDependencies';
import { analyzeGraphs } from '../../lib/graph/analytics';

export function GraphAnalyticsPanel() {
  const scenes = useGraphStore(s => s.scenes);
  const arcGraphs = useArcGraphStore(s => s.arcGraphs);
  const depIndex = useArcSceneDependencyIndex();

  const analytics = useMemo(
    () => analyzeGraphs(scenes, arcGraphs, depIndex),
    [scenes, arcGraphs, depIndex]
  );

  return (
    <Panel title="Graph Analytics">
      <div className="p-4 space-y-6">
        {/* Scene stats */}
        <div>
          <h3 className="font-semibold mb-2">Scenes</h3>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Total Scenes" value={analytics.scenes.total} />
            <StatCard
              label="Orphaned"
              value={analytics.scenes.orphaned}
              variant={analytics.scenes.orphaned > 0 ? 'warning' : 'success'}
            />
            <StatCard
              label="Broken"
              value={analytics.scenes.broken}
              variant={analytics.scenes.broken > 0 ? 'danger' : 'success'}
            />
            <StatCard
              label="Avg Complexity"
              value={analytics.scenes.avgComplexity.toFixed(1)}
            />
          </div>
        </div>

        {/* Arc stats */}
        <div>
          <h3 className="font-semibold mb-2">Arc Nodes</h3>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Total Arcs" value={analytics.arcs.total} />
            <StatCard
              label="Broken Refs"
              value={analytics.arcs.broken}
              variant={analytics.arcs.broken > 0 ? 'danger' : 'success'}
            />
          </div>
        </div>

        {/* Dependency stats */}
        <div>
          <h3 className="font-semibold mb-2">Dependencies</h3>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Total Links" value={analytics.dependencies.totalLinks} />
            <StatCard
              label="Broken Links"
              value={analytics.dependencies.brokenLinks}
              variant={analytics.dependencies.brokenLinks > 0 ? 'danger' : 'success'}
            />
          </div>
        </div>

        {/* Health score */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border rounded p-4">
          <div className="font-semibold mb-1">Overall Health</div>
          <div className="text-2xl font-bold">
            {calculateHealthScore(analytics)}%
          </div>
        </div>
      </div>
    </Panel>
  );
}

function StatCard({ label, value, variant }: any) {
  return (
    <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function calculateHealthScore(analytics: GraphAnalytics): number {
  let score = 100;

  // Deduct for issues
  score -= analytics.scenes.orphaned * 2;
  score -= analytics.scenes.broken * 5;
  score -= analytics.arcs.broken * 5;
  score -= analytics.dependencies.brokenLinks * 5;
  score -= analytics.dependencies.circularRefs * 3;

  return Math.max(0, Math.min(100, score));
}
```

**Key design decisions:**

- ✅ **Health score** - Single metric for graph quality
- ✅ **Orphan detection** - Find unused content
- ✅ **Broken ref detection** - Find data integrity issues
- ✅ **Complexity metrics** - Understand graph size

Acceptance:

- Analytics panel shows total scenes/arcs
- Orphaned content detected and counted
- Broken references detected and counted
- Health score calculated (0-100%)
- Uses shared Panel and Badge components

Testing Plan

Unit Tests:

- `lib/graph/lineage.test.ts`:
  - buildSceneLineage creates correct tree
  - Circular references detected
  - Call count accurate

- `lib/graph/analytics.test.ts`:
  - Orphan detection works
  - Broken ref detection works
  - Health score calculation correct

Integration Tests:

- Lineage graph shows scene call hierarchy
- Dependency graph shows cross-layer connections
- Impact analysis shows correct dep counts
- Analytics panel shows accurate stats

Manual Testing:

- Create scene with scene_call → Lineage graph updates
- View dependency graph → All layers visible
- Check impact of deleting heavily-used scene
- Analytics panel shows orphaned scenes

Documentation Updates

- Create `docs/GRAPH_VISUALIZATION.md`:
  - Lineage graph guide
  - Dependency graph guide
  - Impact analysis usage
  - Analytics interpretation

- Update `ARCHITECTURE.md`:
  - Document visualization layers

Migration Notes

No breaking changes. All features are additive:

- Lineage graph is new panel
- Dependency graph is new panel
- Impact analysis is new panel
- Analytics is new panel

Dependencies

- ReactFlow (already installed for scene/arc graphs)
- Task 43 dependency tracking
- Task 48 collections/campaigns

Follow-Up Tasks

- **Task 50**: Advanced graph algorithms (centrality, clustering)
- **Task 51**: 3D graph visualization
- **Task 52**: Export to graph analysis tools (Gephi, etc.)

Success Criteria

- [ ] Lineage graph visualizes scene_call hierarchy
- [ ] Circular references detected in lineage
- [ ] Dependency graph shows all cross-layer connections
- [ ] Color-coded layers (scene/arc/collection/campaign)
- [ ] Impact analysis calculates direct deps
- [ ] Complexity rating (low/medium/high) displayed
- [ ] Analytics panel shows orphaned/broken counts
- [ ] Health score calculated
- [ ] All panels use ReactFlow for consistency
- [ ] All panels use shared UI components
- [ ] Documentation complete
- [ ] Unit and integration tests pass
"""
