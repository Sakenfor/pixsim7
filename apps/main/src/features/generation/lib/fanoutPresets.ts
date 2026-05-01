import { type CombinationStrategy } from './combinationStrategies';

export type FanoutDispatchMode = 'auto' | 'frontend' | 'backend_fanout';
export type FanoutOnError = 'continue' | 'stop';
export type FanoutExecutionMode = 'fanout' | 'sequential';

export interface FanoutRunOptions {
  strategy: CombinationStrategy;
  repeatCount: number;
  seed?: number;
  onError: FanoutOnError;
  dispatch: FanoutDispatchMode;
  executionMode: FanoutExecutionMode;
  reusePreviousOutputAsInput: boolean;
}

export interface FanoutPreset extends FanoutRunOptions {
  id: string;
  label: string;
  description?: string;
}

export const DEFAULT_FANOUT_RUN_OPTIONS: FanoutRunOptions = {
  strategy: 'each',
  repeatCount: 1,
  seed: undefined,
  onError: 'continue',
  dispatch: 'auto',
  executionMode: 'fanout',
  reusePreviousOutputAsInput: false,
};

export const BUILTIN_FANOUT_PRESETS: FanoutPreset[] = [
  {
    id: 'each-default',
    label: 'Each Default',
    description: 'Current Each behavior (one per group/input)',
    ...DEFAULT_FANOUT_RUN_OPTIONS,
  },
  {
    id: 'each-sample-4',
    label: 'Sample 4',
    description: 'Repeat each generated group 4 times',
    ...DEFAULT_FANOUT_RUN_OPTIONS,
    repeatCount: 4,
  },
  {
    id: 'backend-fanout',
    label: 'Backend Fanout',
    description: 'Submit Each through backend fanout orchestration',
    ...DEFAULT_FANOUT_RUN_OPTIONS,
    dispatch: 'backend_fanout',
  },
  {
    id: 'each-sequential',
    label: 'Each Sequential',
    description: 'Run Each groups one-by-one, waiting for completion between steps',
    ...DEFAULT_FANOUT_RUN_OPTIONS,
    dispatch: 'frontend',
    executionMode: 'sequential',
  },
  {
    id: 'each-sequential-chain',
    label: 'Each Sequential + Pipe Prev',
    description: 'Sequential Each; reuse previous result as next input when possible',
    ...DEFAULT_FANOUT_RUN_OPTIONS,
    dispatch: 'frontend',
    executionMode: 'sequential',
    reusePreviousOutputAsInput: true,
  },
  {
    id: 'overnight-harvest-12',
    label: 'Overnight Harvest x12',
    description: 'Backend fanout with 12 repeats per planned group; continue on errors',
    ...DEFAULT_FANOUT_RUN_OPTIONS,
    repeatCount: 12,
    dispatch: 'backend_fanout',
    onError: 'continue',
  },
  {
    id: 'overnight-harvest-24',
    label: 'Overnight Harvest x24',
    description: 'Long unattended backend fanout run with 24 repeats per planned group',
    ...DEFAULT_FANOUT_RUN_OPTIONS,
    repeatCount: 24,
    dispatch: 'backend_fanout',
    onError: 'continue',
  },
  {
    id: 'progression-scan-backend-x6',
    label: 'Progression Scan x6',
    description: 'Backend fanout progression scan preset for template/beat exploration',
    ...DEFAULT_FANOUT_RUN_OPTIONS,
    repeatCount: 6,
    dispatch: 'backend_fanout',
    onError: 'continue',
  },
];

export function normalizeFanoutRunOptions(
  input?: Partial<FanoutRunOptions> | null,
): FanoutRunOptions {
  const merged: FanoutRunOptions = {
    ...DEFAULT_FANOUT_RUN_OPTIONS,
    ...(input || {}),
    strategy: (input?.strategy ?? DEFAULT_FANOUT_RUN_OPTIONS.strategy) as CombinationStrategy,
  };
  const repeatCount = Number.isFinite(merged.repeatCount) ? Math.floor(merged.repeatCount) : 1;
  merged.repeatCount = Math.min(50, Math.max(1, repeatCount || 1));

  if (merged.seed == null || merged.seed === 0 || !Number.isFinite(merged.seed)) {
    merged.seed = undefined;
  } else {
    merged.seed = Math.trunc(merged.seed);
  }

  merged.executionMode = merged.executionMode === 'sequential' ? 'sequential' : 'fanout';
  merged.reusePreviousOutputAsInput = Boolean(merged.reusePreviousOutputAsInput);

  if (merged.executionMode === 'sequential' && merged.dispatch === 'backend_fanout') {
    merged.dispatch = 'frontend';
  }

  return merged;
}

export function expandGroupsByRepeat<T>(groups: T[][], repeatCount: number): T[][] {
  const count = Math.min(50, Math.max(1, Math.floor(repeatCount || 1)));
  if (count <= 1) return groups;
  const out: T[][] = [];
  for (const group of groups) {
    for (let i = 0; i < count; i++) out.push(group);
  }
  return out;
}

function createSeededRng(seed?: number): () => number {
  if (seed == null) return Math.random;
  let state = (seed >>> 0) || 1;
  return () => {
    // Mulberry32
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomForFanoutSeed(seed?: number): () => number {
  return createSeededRng(seed);
}
