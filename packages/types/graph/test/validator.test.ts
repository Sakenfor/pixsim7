import { describe, it, expect } from 'vitest';
import { validateGraph, isDeterministic, getGraphStats } from '../src/validator';

describe('Graph Validation', () => {
  it('should validate a valid graph', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'valid-graph',
      entry: 'start',
      nodes: {
        start: {
          type: 'Action',
          edges: ['end'],
        },
        end: {
          type: 'Action',
          edges: [],
        },
      },
    };

    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('should detect missing entry node', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'bad-graph',
      entry: 'missing',
      nodes: {
        start: {
          type: 'Action',
          edges: [],
        },
      },
    };

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.type === 'missing_entry')).toBe(true);
  });

  it('should detect missing edge targets', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'bad-graph',
      entry: 'start',
      nodes: {
        start: {
          type: 'Action',
          edges: ['missing_node'],
        },
      },
    };

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.type === 'missing_target')).toBe(true);
  });

  it('should detect unreachable nodes', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'unreachable-graph',
      entry: 'start',
      nodes: {
        start: {
          type: 'Action',
          edges: [],
        },
        unreachable: {
          type: 'Action',
          edges: [],
        },
      },
    };

    const result = validateGraph(graph);
    expect(result.issues.some(i => i.type === 'unreachable_node' && i.nodeId === 'unreachable')).toBe(true);
  });

  it('should detect infinite cycles', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'cycle-graph',
      entry: 'a',
      nodes: {
        a: {
          type: 'Action',
          edges: ['b'],
        },
        b: {
          type: 'Action',
          edges: ['c'],
        },
        c: {
          type: 'Action',
          edges: ['a'], // Cycle back to a
        },
      },
    };

    const result = validateGraph(graph);
    expect(result.issues.some(i => i.type === 'infinite_cycle')).toBe(true);
  });

  it('should allow cycles with escape conditions', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'safe-cycle',
      entry: 'start',
      nodes: {
        start: {
          type: 'Condition',
          conditions: [{ kind: 'randomChance', probability: 0.5 }],
          edges: ['continue', 'exit'],
        },
        continue: {
          type: 'Action',
          edges: ['start'], // Cycle back
        },
        exit: {
          type: 'Action',
          edges: [],
        },
      },
    };

    const result = validateGraph(graph);
    expect(result.issues.some(i => i.type === 'infinite_cycle')).toBe(false);
  });

  it('should warn about Choice nodes with no edges', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'bad-choice',
      entry: 'choose',
      nodes: {
        choose: {
          type: 'Choice',
          edges: [],
        },
      },
    };

    const result = validateGraph(graph);
    expect(result.issues.some(i => i.type === 'choice_no_edges')).toBe(true);
  });

  it('should warn about dead ends', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'dead-end',
      entry: 'start',
      nodes: {
        start: {
          type: 'Decision',
          edges: [],
        },
      },
    };

    const result = validateGraph(graph);
    expect(result.issues.some(i => i.type === 'dead_end')).toBe(true);
  });
});

describe('Determinism Check', () => {
  it('should detect deterministic graphs', () => {
    const graph = {
      nodes: {
        a: { type: 'Action', edges: ['b'] },
        b: { type: 'Action', edges: [] },
      },
    };

    expect(isDeterministic(graph)).toBe(true);
  });

  it('should detect non-deterministic graphs with Random', () => {
    const graph = {
      nodes: {
        a: { type: 'Random', edges: ['b', 'c'] },
        b: { type: 'Action', edges: [] },
        c: { type: 'Action', edges: [] },
      },
    };

    expect(isDeterministic(graph)).toBe(false);
  });

  it('should detect non-deterministic graphs with Choice', () => {
    const graph = {
      nodes: {
        a: { type: 'Choice', edges: ['b', 'c'] },
        b: { type: 'Action', edges: [] },
        c: { type: 'Action', edges: [] },
      },
    };

    expect(isDeterministic(graph)).toBe(false);
  });

  it('should detect non-deterministic graphs with randomChance condition', () => {
    const graph = {
      nodes: {
        a: {
          type: 'Condition',
          conditions: [{ kind: 'randomChance', probability: 0.5 }],
          edges: ['b'],
        },
        b: { type: 'Action', edges: [] },
      },
    };

    expect(isDeterministic(graph)).toBe(false);
  });
});

describe('Graph Statistics', () => {
  it('should compute graph statistics', () => {
    const graph = {
      nodes: {
        start: { type: 'Action', edges: ['choose'] },
        choose: { type: 'Decision', edges: ['a', 'b'] },
        a: { type: 'Action', edges: [] },
        b: { type: 'Action', conditions: [{ kind: 'weekday' }], edges: [] },
      },
    };

    const stats = getGraphStats(graph);

    expect(stats.totalNodes).toBe(4);
    expect(stats.nodeTypes.Action).toBe(3);
    expect(stats.nodeTypes.Decision).toBe(1);
    expect(stats.totalEdges).toBe(3);
    expect(stats.conditionalNodes).toBe(1);
    expect(stats.terminalNodes).toBe(2);
    expect(stats.isDeterministic).toBe(true);
  });
});
