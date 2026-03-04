import { describe, it, expect, vi } from 'vitest';

import type { BackendRoutineGraph } from '@lib/api/gameBehavior';

import type { RoutineGraph } from '../../types';
import {
  toBackendGraph,
  fromBackendGraph,
  fromBackendRoutines,
} from '../routineGraphConversion';

// ============================================================================
// Fixtures
// ============================================================================

function makeGraph(overrides?: Partial<RoutineGraph>): RoutineGraph {
  return {
    id: 'routine-1',
    version: 1,
    name: 'Morning Routine',
    nodes: [
      {
        id: 'node-1',
        nodeType: 'time_slot',
        position: { x: 100, y: 200 },
        label: 'Wake Up',
        timeRangeSeconds: { start: 21600, end: 28800 },
        preferredActivities: [{ activityId: 'eat_breakfast', weight: 2.0 }],
        meta: { custom: 'data' },
      },
      {
        id: 'node-2',
        nodeType: 'activity',
        position: { x: 300, y: 400 },
        label: 'Exercise',
        preferredActivities: [],
      },
    ],
    edges: [
      {
        id: 'edge-1',
        from: 'node-1',
        to: 'node-2',
        weight: 1.5,
        label: 'then',
        conditions: [{ type: 'energy_above', threshold: 30 }],
        meta: { hint: 'prefer morning' },
      },
    ],
    ...overrides,
  };
}

// ============================================================================
// toBackendGraph
// ============================================================================

describe('toBackendGraph', () => {
  it('stashes node position and label into meta.__editor', () => {
    const graph = makeGraph();
    const backend = toBackendGraph(graph);

    const backendNode = backend.nodes[0];
    expect(backendNode.meta?.__editor).toEqual({
      position: { x: 100, y: 200 },
      label: 'Wake Up',
    });
    // position and label should NOT be at top level
    expect(backendNode).not.toHaveProperty('position');
    expect(backendNode).not.toHaveProperty('label');
  });

  it('stashes edge id and label into meta.__editor', () => {
    const graph = makeGraph();
    const backend = toBackendGraph(graph);

    const backendEdge = backend.edges[0];
    expect(backendEdge.meta?.__editor).toEqual({
      id: 'edge-1',
      label: 'then',
    });
    // edge should NOT have id or label at top level
    expect(backendEdge).not.toHaveProperty('id');
    expect(backendEdge).not.toHaveProperty('label');
  });

  it('converts edge from/to to fromNodeId/toNodeId', () => {
    const graph = makeGraph();
    const backend = toBackendGraph(graph);

    expect(backend.edges[0].fromNodeId).toBe('node-1');
    expect(backend.edges[0].toNodeId).toBe('node-2');
  });

  it('preserves existing meta alongside __editor', () => {
    const graph = makeGraph();
    const backend = toBackendGraph(graph);

    // Node meta had { custom: 'data' }
    expect(backend.nodes[0].meta?.custom).toBe('data');
    expect(backend.nodes[0].meta?.__editor).toBeDefined();

    // Edge meta had { hint: 'prefer morning' }
    expect(backend.edges[0].meta?.hint).toBe('prefer morning');
    expect(backend.edges[0].meta?.__editor).toBeDefined();
  });

  it('preserves graph-level fields', () => {
    const graph = makeGraph({ startNodeId: 'node-1' });
    const backend = toBackendGraph(graph);

    expect(backend.id).toBe('routine-1');
    expect(backend.version).toBe(1);
    expect(backend.name).toBe('Morning Routine');
    expect(backend.startNodeId).toBe('node-1');
  });

  it('omits label from __editor when node has no label', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'n', nodeType: 'activity', position: { x: 0, y: 0 }, preferredActivities: [] },
      ],
      edges: [],
    });
    const backend = toBackendGraph(graph);
    expect(backend.nodes[0].meta?.__editor).toEqual({ position: { x: 0, y: 0 } });
  });
});

// ============================================================================
// fromBackendGraph
// ============================================================================

describe('fromBackendGraph', () => {
  it('restores position and label from meta.__editor', () => {
    const graph = makeGraph();
    const backend = toBackendGraph(graph);
    const restored = fromBackendGraph(backend);

    expect(restored.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(restored.nodes[0].label).toBe('Wake Up');
  });

  it('restores edge id and label from meta.__editor', () => {
    const graph = makeGraph();
    const backend = toBackendGraph(graph);
    const restored = fromBackendGraph(backend);

    expect(restored.edges[0].id).toBe('edge-1');
    expect(restored.edges[0].label).toBe('then');
  });

  it('converts fromNodeId/toNodeId back to from/to', () => {
    const graph = makeGraph();
    const backend = toBackendGraph(graph);
    const restored = fromBackendGraph(backend);

    expect(restored.edges[0].from).toBe('node-1');
    expect(restored.edges[0].to).toBe('node-2');
  });

  it('strips __editor from restored meta', () => {
    const graph = makeGraph();
    const backend = toBackendGraph(graph);
    const restored = fromBackendGraph(backend);

    // Node had custom: 'data' in meta - should survive, __editor should not
    expect(restored.nodes[0].meta?.custom).toBe('data');
    expect(restored.nodes[0].meta?.__editor).toBeUndefined();

    // Edge had hint: 'prefer morning' in meta
    expect(restored.edges[0].meta?.hint).toBe('prefer morning');
    expect(restored.edges[0].meta?.__editor).toBeUndefined();
  });

  it('auto-layouts nodes when meta.__editor.position is missing', () => {
    const backend: BackendRoutineGraph = {
      id: 'r1',
      version: 1,
      name: 'Test',
      nodes: [
        { id: 'n1', nodeType: 'time_slot', meta: {} },
        { id: 'n2', nodeType: 'activity', meta: {} },
        { id: 'n3', nodeType: 'decision' },
      ],
      edges: [],
    };

    const restored = fromBackendGraph(backend);

    // All nodes should have positions (auto-layout)
    expect(restored.nodes[0].position).toBeDefined();
    expect(restored.nodes[1].position).toBeDefined();
    expect(restored.nodes[2].position).toBeDefined();

    // Positions should be vertically stacked
    expect(restored.nodes[0].position.y).toBeLessThan(restored.nodes[1].position.y);
    expect(restored.nodes[1].position.y).toBeLessThan(restored.nodes[2].position.y);
  });

  it('generates fallback edge id when meta.__editor.id is missing', () => {
    const backend: BackendRoutineGraph = {
      id: 'r1',
      version: 1,
      name: 'Test',
      nodes: [
        { id: 'n1', nodeType: 'time_slot' },
        { id: 'n2', nodeType: 'activity' },
      ],
      edges: [
        { fromNodeId: 'n1', toNodeId: 'n2', weight: 1.0 },
      ],
    };

    const restored = fromBackendGraph(backend);
    expect(restored.edges[0].id).toBeTruthy();
    expect(typeof restored.edges[0].id).toBe('string');
  });
});

// ============================================================================
// Round-trip
// ============================================================================

describe('round-trip (toBackend → fromBackend)', () => {
  it('preserves all fields through a full round-trip', () => {
    const original = makeGraph();
    const backend = toBackendGraph(original);
    const restored = fromBackendGraph(backend);

    // Node fields
    expect(restored.nodes[0].id).toBe(original.nodes[0].id);
    expect(restored.nodes[0].nodeType).toBe(original.nodes[0].nodeType);
    expect(restored.nodes[0].position).toEqual(original.nodes[0].position);
    expect(restored.nodes[0].label).toBe(original.nodes[0].label);
    expect(restored.nodes[0].timeRangeSeconds).toEqual(original.nodes[0].timeRangeSeconds);
    expect(restored.nodes[0].preferredActivities).toEqual(original.nodes[0].preferredActivities);

    // Edge fields
    expect(restored.edges[0].id).toBe(original.edges[0].id);
    expect(restored.edges[0].from).toBe(original.edges[0].from);
    expect(restored.edges[0].to).toBe(original.edges[0].to);
    expect(restored.edges[0].weight).toBe(original.edges[0].weight);
    expect(restored.edges[0].label).toBe(original.edges[0].label);
    expect(restored.edges[0].conditions).toEqual(original.edges[0].conditions);

    // Graph-level
    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
    expect(restored.version).toBe(original.version);
  });
});

// ============================================================================
// fromBackendRoutines
// ============================================================================

describe('fromBackendRoutines', () => {
  it('converts a record of backend routines', () => {
    const graph = makeGraph();
    const backend = toBackendGraph(graph);

    const result = fromBackendRoutines({ [backend.id]: backend });

    expect(Object.keys(result)).toHaveLength(1);
    expect(result[backend.id].name).toBe('Morning Routine');
  });

  it('skips malformed entries with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = fromBackendRoutines({
      good: {
        id: 'good',
        version: 1,
        name: 'Good',
        nodes: [],
        edges: [],
      },
      bad_no_id: { version: 1, name: 'Bad', nodes: [] } as any,
      bad_null: null as any,
      bad_no_nodes: { id: 'x', version: 1, name: 'X' } as any,
    });

    expect(Object.keys(result)).toHaveLength(1);
    expect(result.good).toBeDefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('returns empty object for empty/null input', () => {
    expect(fromBackendRoutines({})).toEqual({});
  });
});
