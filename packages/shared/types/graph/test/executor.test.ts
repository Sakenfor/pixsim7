import { describe, it, expect } from 'vitest';
import {
  makeRng,
  splitRng,
  evaluateCondition,
  evaluateNode,
  executeGraphStep,
  type EvalContext,
  type EntityState,
} from '../src/index';

describe('RNG', () => {
  it('should be deterministic with same seed', () => {
    const rng1 = makeRng(12345);
    const rng2 = makeRng(12345);

    const values1 = Array.from({ length: 10 }, () => rng1());
    const values2 = Array.from({ length: 10 }, () => rng2());

    expect(values1).toEqual(values2);
  });

  it('should produce different sequences with different seeds', () => {
    const rng1 = makeRng(12345);
    const rng2 = makeRng(54321);

    const values1 = Array.from({ length: 10 }, () => rng1());
    const values2 = Array.from({ length: 10 }, () => rng2());

    expect(values1).not.toEqual(values2);
  });

  it('should split RNG for entities', () => {
    const worldRng = makeRng(42);
    const npc1Rng = splitRng(worldRng, 'npc_001');
    const npc2Rng = splitRng(worldRng, 'npc_002');

    const npc1Values = Array.from({ length: 5 }, () => npc1Rng());
    const npc2Values = Array.from({ length: 5 }, () => npc2Rng());

    expect(npc1Values).not.toEqual(npc2Values);
  });
});

describe('Condition Evaluation', () => {
  const baseContext: EvalContext = {
    tick: 100,
    timeOfDay: 600, // 10:00 AM
    dayOfWeek: 2, // Tuesday
    state: {
      id: 'test',
      needs: { hunger: 50, energy: 70 },
      money: 100,
      flags: new Set(['has_job', 'awake']),
      location: 'home',
      activity: 'idle',
    },
    rng: makeRng(42),
  };

  it('should evaluate weekday condition', () => {
    expect(evaluateCondition({ kind: 'weekday' }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'weekend' }, baseContext)).toBe(false);
  });

  it('should evaluate time conditions', () => {
    expect(evaluateCondition({ kind: 'timeBetween', range: [540, 720] }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'timeBetween', range: [800, 900] }, baseContext)).toBe(false);
    expect(evaluateCondition({ kind: 'timeAfter', value: 500 }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'timeBefore', value: 500 }, baseContext)).toBe(false);
  });

  it('should evaluate need conditions', () => {
    expect(evaluateCondition({ kind: 'needLt', need: 'hunger', value: 60 }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'needGt', need: 'energy', value: 60 }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'needBetween', need: 'hunger', range: [40, 60] }, baseContext)).toBe(true);
  });

  it('should evaluate flag conditions', () => {
    expect(evaluateCondition({ kind: 'hasFlag', flag: 'has_job' }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'hasFlag', flag: 'unemployed' }, baseContext)).toBe(false);
    expect(evaluateCondition({ kind: 'notFlag', flag: 'unemployed' }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'anyFlag', flags: ['has_job', 'rich'] }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'allFlags', flags: ['has_job', 'awake'] }, baseContext)).toBe(true);
  });

  it('should evaluate location conditions', () => {
    expect(evaluateCondition({ kind: 'locationIs', location: 'home' }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'locationNot', location: 'work' }, baseContext)).toBe(true);
  });

  it('should evaluate money conditions', () => {
    expect(evaluateCondition({ kind: 'moneyGt', value: 50 }, baseContext)).toBe(true);
    expect(evaluateCondition({ kind: 'moneyLt', value: 50 }, baseContext)).toBe(false);
  });

  it('should evaluate logical operators', () => {
    const andCond = {
      kind: 'and',
      conditions: [
        { kind: 'weekday' },
        { kind: 'hasFlag', flag: 'has_job' },
      ],
    };
    expect(evaluateCondition(andCond, baseContext)).toBe(true);

    const orCond = {
      kind: 'or',
      conditions: [
        { kind: 'weekend' },
        { kind: 'hasFlag', flag: 'has_job' },
      ],
    };
    expect(evaluateCondition(orCond, baseContext)).toBe(true);

    const notCond = {
      kind: 'not',
      conditions: [{ kind: 'weekend' }],
    };
    expect(evaluateCondition(notCond, baseContext)).toBe(true);
  });
});

describe('Node Evaluation', () => {
  const baseState: EntityState = {
    id: 'test_npc',
    needs: { hunger: 50, energy: 70 },
    money: 100,
    flags: new Set(['awake']),
    location: 'home',
    cooldowns: new Map(),
  };

  const baseContext: EvalContext = {
    tick: 100,
    timeOfDay: 600,
    dayOfWeek: 2,
    state: baseState,
    rng: makeRng(42),
  };

  it('should evaluate Action node', () => {
    const node = {
      type: 'Action',
      effect: {
        needs: { hunger: 20 },
        moneyDelta: -10,
        flagsAdd: ['ate_breakfast'],
      },
      edges: ['next_node'],
    };

    const result = evaluateNode('eat', node, baseContext);

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual(node.effect);
    expect(result.nextNodes).toEqual(['next_node']);
    expect(result.blocked).toBeUndefined();
  });

  it('should evaluate Decision node with first strategy', () => {
    const node = {
      type: 'Decision',
      decisionStrategy: 'first',
      edges: ['option_a', 'option_b', 'option_c'],
    };

    const result = evaluateNode('decide', node, baseContext);
    expect(result.nextNodes).toEqual(['option_a']);
  });

  it('should evaluate Decision node with random strategy', () => {
    const node = {
      type: 'Decision',
      decisionStrategy: 'random',
      edges: ['option_a', 'option_b', 'option_c'],
    };

    const result = evaluateNode('decide', node, baseContext);
    expect(node.edges).toContain(result.nextNodes[0]);
  });

  it('should evaluate Choice node (blocking)', () => {
    const node = {
      type: 'Choice',
      edges: ['choice_a', 'choice_b'],
      choiceTimeout: 300,
    };

    const result = evaluateNode('choose', node, baseContext);
    expect(result.blocked).toBe(true);
    expect(result.instructions).toHaveLength(1);
    expect(result.instructions[0].kind).toBe('AwaitChoice');
  });

  it('should evaluate Timer node (blocking)', () => {
    const node = {
      type: 'Timer',
      durationTicks: 50,
      edges: ['after_wait'],
    };

    const result = evaluateNode('wait', node, baseContext);
    expect(result.blocked).toBe(true);
    expect(result.instructions).toHaveLength(1);
    expect(result.instructions[0]).toMatchObject({
      kind: 'Wait',
      ticks: 50,
      resumeAt: 150,
    });
  });

  it('should respect cooldowns', () => {
    const node = {
      type: 'Action',
      effect: { activity: 'work' },
      edges: [],
    };

    baseState.cooldowns!.set('work_node', 150);
    const result = evaluateNode('work_node', node, baseContext);

    expect(result.effects).toHaveLength(0);
    expect(result.nextNodes).toHaveLength(0);
  });

  it('should respect node conditions', () => {
    const node = {
      type: 'Action',
      conditions: [
        { kind: 'needGt', need: 'energy', value: 80 },
      ],
      effect: { activity: 'exercise' },
      edges: [],
    };

    const result = evaluateNode('exercise', node, baseContext);
    expect(result.effects).toHaveLength(0); // Should not execute (energy is 70)
  });
});

describe('Graph Execution', () => {
  it('should execute a simple graph step', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'test-graph',
      entry: 'start',
      nodes: {
        start: {
          type: 'Action',
          effect: { activity: 'started' },
          edges: ['end'],
        },
        end: {
          type: 'Action',
          effect: { activity: 'finished' },
          edges: [],
        },
      },
    };

    const ctx: EvalContext = {
      tick: 0,
      timeOfDay: 0,
      dayOfWeek: 1,
      state: {
        id: 'test',
        flags: new Set(),
        cooldowns: new Map(),
      },
      rng: makeRng(42),
    };

    const result = executeGraphStep(graph, 'start', ctx);
    expect(result.effects).toHaveLength(1);
    expect(result.nextNodes).toEqual(['end']);
  });

  it('should return error for missing node', () => {
    const graph = {
      schemaVersion: '1.0.0',
      name: 'test-graph',
      entry: 'start',
      nodes: {
        start: {
          type: 'Action',
          edges: [],
        },
      },
    };

    const ctx: EvalContext = {
      tick: 0,
      timeOfDay: 0,
      dayOfWeek: 1,
      state: { id: 'test', flags: new Set(), cooldowns: new Map() },
      rng: makeRng(42),
    };

    const result = executeGraphStep(graph, 'missing', ctx);
    expect(result.error).toBeDefined();
  });
});
