import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenerationModel } from '@features/generation/models';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';

import type { TickerEvent } from '../../lib/sourceRegistry';
import { generationsSource } from '../generationsSource';

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

describe('generationsSource', () => {
  let unsub: (() => void) | undefined;
  let emit: ReturnType<typeof vi.fn<[TickerEvent], void>>;

  beforeEach(() => {
    useGenerationsStore.setState({
      generations: new Map(),
      watchingGenerationId: null,
    });
    emit = vi.fn();
  });

  afterEach(() => {
    unsub?.();
    unsub = undefined;
  });

  it('exposes the expected metadata', () => {
    expect(generationsSource.id).toBe('generations');
    expect(generationsSource.defaultEnabled).toBe(true);
    expect(typeof generationsSource.subscribe).toBe('function');
  });

  it('emits a "started" event when a new active generation appears', () => {
    unsub = generationsSource.subscribe(emit);

    useGenerationsStore.getState().addOrUpdate(stub({ id: 1, status: 'pending' }));

    expect(emit).toHaveBeenCalledTimes(1);
    const event = emit.mock.calls[0][0];
    expect(event.message).toBe('#1 started');
    expect(event.refType).toBe('generation');
    expect(event.refId).toBe('1');
    expect(event.icon).toBe('🚀');
  });

  it('emits a "completed" event with check icon when status flips to completed', () => {
    useGenerationsStore.getState().addOrUpdate(stub({ id: 2, status: 'processing' }));
    unsub = generationsSource.subscribe(emit);

    useGenerationsStore.getState().addOrUpdate(stub({ id: 2, status: 'completed' }));

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].message).toBe('#2 completed ✓');
    expect(emit.mock.calls[0][0].color).toBe('text-green-500');
  });

  it('emits a "failed" event with truncated error snippet', () => {
    useGenerationsStore.getState().addOrUpdate(stub({ id: 3, status: 'processing' }));
    unsub = generationsSource.subscribe(emit);

    const longErr = 'a'.repeat(50);
    useGenerationsStore.getState().addOrUpdate(
      stub({ id: 3, status: 'failed', errorMessage: longErr }),
    );

    const event = emit.mock.calls[0][0];
    expect(event.message.startsWith('#3 ')).toBe(true);
    expect(event.message).toContain('…');
    // 30-char snippet + ellipsis
    expect(event.message.length).toBeLessThan('#3 '.length + 32);
    expect(event.icon).toBe('❌');
  });

  it('does NOT emit for generations that already existed at subscribe time', () => {
    useGenerationsStore.getState().addOrUpdate(stub({ id: 4, status: 'pending' }));
    unsub = generationsSource.subscribe(emit);

    // No state change → no emit
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not emit when the status is unchanged', () => {
    useGenerationsStore.getState().addOrUpdate(stub({ id: 5, status: 'pending' }));
    unsub = generationsSource.subscribe(emit);

    useGenerationsStore.getState().patch(5, { errorMessage: 'noise' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('unsubscribe stops emissions', () => {
    unsub = generationsSource.subscribe(emit);
    unsub();
    unsub = undefined;

    useGenerationsStore.getState().addOrUpdate(stub({ id: 6, status: 'pending' }));
    expect(emit).not.toHaveBeenCalled();
  });
});
