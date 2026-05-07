import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenerationModel } from '@features/generation/models';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';

import { useTickerSettingsStore } from '../../stores/tickerSettingsStore';
import { stuckOrFailedSource } from '../stuckOrFailedSource';
import type { TickerEvent } from '../../lib/sourceRegistry';

const stub = (over: Partial<GenerationModel>): GenerationModel =>
  ({
    id: 0,
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    completedAt: null,
    scheduledAt: null,
    status: 'pending',
    errorMessage: null,
    errorCode: null,
    retryCount: 0,
    deferredAction: null,
    attemptCount: null,
    priority: 0,
    waitReason: null,
    name: null,
    description: null,
    operationType: 'text-to-image',
    providerId: 'noop',
    finalPrompt: null,
    promptSourceType: null,
    promptVersionId: null,
    promptConfig: null,
    canonicalParams: {},
    latestSubmissionPayload: null,
    latestSubmissionProviderJobId: null,
    inputs: [],
    reproducibleHash: null,
    account: null,
    accountEmail: null,
    asset: null,
    assetId: null,
    user: null,
    workspace: null,
    parentGeneration: null,
    ...over,
  } as GenerationModel);

const NOW_ISO = '2026-05-06T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

function isoDelta(ms: number): string {
  return new Date(NOW_MS - ms).toISOString();
}

describe('stuckOrFailedSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    useGenerationsStore.setState({
      generations: new Map(),
      watchingGenerationId: null,
    });
    useTickerSettingsStore.setState({ enabledSources: {}, sourceSettings: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes correct metadata', () => {
    expect(stuckOrFailedSource.id).toBe('stuck-or-failed');
    expect(stuckOrFailedSource.defaultEnabled).toBe(false);
  });

  it('emits a stuck event for an active gen older than the threshold', () => {
    useGenerationsStore.getState().addOrUpdate(
      stub({
        id: 1,
        status: 'processing',
        startedAt: isoDelta(15 * 60 * 1000), // 15min old
        createdAt: isoDelta(15 * 60 * 1000),
        updatedAt: NOW_ISO,
      }),
    );

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = stuckOrFailedSource.subscribe(emit);

    expect(emit).toHaveBeenCalledTimes(1);
    const event = emit.mock.calls[0][0];
    expect(event.id).toBe('stuck-1');
    expect(event.message).toContain('#1 stuck for 15m');
    expect(event.refType).toBe('generation');
    expect(event.refId).toBe('1');
    expect(event.icon).toBe('🐌');
    unsub();
  });

  it('does NOT emit for an active gen younger than the threshold', () => {
    useGenerationsStore.getState().addOrUpdate(
      stub({
        id: 2,
        status: 'processing',
        startedAt: isoDelta(2 * 60 * 1000),
        createdAt: isoDelta(2 * 60 * 1000),
        updatedAt: NOW_ISO,
      }),
    );

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = stuckOrFailedSource.subscribe(emit);
    expect(emit).not.toHaveBeenCalled();
    unsub();
  });

  it('re-emits stuck events on each tick (so they stay live)', () => {
    useGenerationsStore.getState().addOrUpdate(
      stub({
        id: 3,
        status: 'processing',
        startedAt: isoDelta(20 * 60 * 1000),
        createdAt: isoDelta(20 * 60 * 1000),
        updatedAt: NOW_ISO,
      }),
    );

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = stuckOrFailedSource.subscribe(emit);
    expect(emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30 * 1000);
    expect(emit).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30 * 1000);
    expect(emit).toHaveBeenCalledTimes(3);
    unsub();
  });

  it('emits a recent-failure event once per id and not again after the same status persists', () => {
    useGenerationsStore.getState().addOrUpdate(
      stub({
        id: 4,
        status: 'failed',
        errorMessage: 'short err',
        updatedAt: isoDelta(60 * 1000), // 1 min ago
      }),
    );

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = stuckOrFailedSource.subscribe(emit);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].id).toBe('recent-fail-4');
    expect(emit.mock.calls[0][0].message).toContain('short err');

    // Tick again — failure should NOT re-emit.
    vi.advanceTimersByTime(30 * 1000);
    expect(emit).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('does not emit recent-failure for an old (outside window) failure', () => {
    useGenerationsStore.getState().addOrUpdate(
      stub({
        id: 5,
        status: 'failed',
        errorMessage: 'old err',
        updatedAt: isoDelta(20 * 60 * 1000), // 20 min ago, outside 5-min window
      }),
    );

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = stuckOrFailedSource.subscribe(emit);
    expect(emit).not.toHaveBeenCalled();
    unsub();
  });

  it('truncates long error messages in recent-failure events', () => {
    useGenerationsStore.getState().addOrUpdate(
      stub({
        id: 6,
        status: 'failed',
        errorMessage: 'a'.repeat(60),
        updatedAt: isoDelta(60 * 1000),
      }),
    );

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = stuckOrFailedSource.subscribe(emit);
    expect(emit.mock.calls[0][0].message).toContain('…');
    unsub();
  });

  it('unsubscribe stops the tick loop', () => {
    useGenerationsStore.getState().addOrUpdate(
      stub({
        id: 7,
        status: 'processing',
        startedAt: isoDelta(20 * 60 * 1000),
        createdAt: isoDelta(20 * 60 * 1000),
        updatedAt: NOW_ISO,
      }),
    );

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = stuckOrFailedSource.subscribe(emit);
    expect(emit).toHaveBeenCalledTimes(1);

    unsub();
    vi.advanceTimersByTime(60 * 1000);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
