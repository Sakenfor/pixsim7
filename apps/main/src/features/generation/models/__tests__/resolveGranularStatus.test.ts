/**
 * Tests for resolveGranularStatus — focuses on the deferredAction branch
 * that ensures the UI shows "Cancelling" / "Pausing" labels while a
 * deferred action is pending, instead of falling through to the activity
 * label (Starting / Submitting / Polling).
 */
import { describe, expect, it } from 'vitest';

import {
  resolveGranularStatus,
  RENDER_CONFIRMED_AFTER_MS,
  type GenerationModel,
} from '../generation';

type GranularInput = Pick<
  GenerationModel,
  | 'status'
  | 'retryCount'
  | 'attemptCount'
  | 'latestSubmissionPayload'
  | 'latestSubmissionProviderJobId'
  | 'waitReason'
  | 'deferredAction'
  | 'errorCode'
  | 'createdAt'
>;

function input(overrides: Partial<GranularInput> = {}): GranularInput {
  return {
    status: 'processing',
    retryCount: 0,
    attemptCount: 1,
    latestSubmissionPayload: { foo: 'bar' },
    latestSubmissionProviderJobId: 'job-1',
    waitReason: null,
    deferredAction: null,
    errorCode: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveGranularStatus — deferred action overrides', () => {
  it("returns 'cancelling' when status is processing and deferredAction='cancel'", () => {
    expect(
      resolveGranularStatus(input({ status: 'processing', deferredAction: 'cancel' })),
    ).toBe('cancelling');
  });

  it("returns 'cancelling' even when submit evidence is missing (the i2i-Gemini bug)", () => {
    // Reproduces the user-reported bug: cancel response loses
    // attemptCount / latestSubmissionPayload, which previously sent the
    // status to 'starting' even though the user had clicked cancel.
    expect(
      resolveGranularStatus(
        input({
          status: 'processing',
          deferredAction: 'cancel',
          attemptCount: null,
          latestSubmissionPayload: null,
          latestSubmissionProviderJobId: null,
        }),
      ),
    ).toBe('cancelling');
  });

  it("returns 'pausing' when status is processing and deferredAction='pause'", () => {
    expect(
      resolveGranularStatus(input({ status: 'processing', deferredAction: 'pause' })),
    ).toBe('pausing');
  });

  it("does NOT override once the generation has reached the terminal cancelled state", () => {
    expect(
      resolveGranularStatus(input({ status: 'cancelled', deferredAction: 'cancel' })),
    ).toBe('cancelled');
  });

  it("does NOT override once the generation has reached the paused state", () => {
    expect(
      resolveGranularStatus(input({ status: 'paused', deferredAction: 'pause' })),
    ).toBe('paused');
  });

  it("applies cancelling to a deferred-cancel from the pending queue too", () => {
    // Deferred cancel from a still-pending generation should also surface
    // as 'cancelling' — the user's intent has the same primacy regardless
    // of whether provider submission has happened.
    expect(
      resolveGranularStatus(input({ status: 'pending', deferredAction: 'cancel' })),
    ).toBe('cancelling');
  });
});

describe('resolveGranularStatus — base behaviour preserved', () => {
  it("returns 'starting' when processing without submit evidence and no deferred action", () => {
    expect(
      resolveGranularStatus(
        input({
          status: 'processing',
          attemptCount: null,
          latestSubmissionPayload: null,
          latestSubmissionProviderJobId: null,
        }),
      ),
    ).toBe('starting');
  });

  it("returns 'submitting' when there is submit evidence but no provider job id", () => {
    expect(
      resolveGranularStatus(
        input({ status: 'processing', latestSubmissionProviderJobId: null }),
      ),
    ).toBe('submitting');
  });

  it("returns 'polling' when both submit evidence and provider job id are present", () => {
    expect(resolveGranularStatus(input({ status: 'processing' }))).toBe('polling');
  });

  it("returns 'queued' for a fresh pending generation", () => {
    expect(
      resolveGranularStatus(
        input({
          status: 'pending',
          attemptCount: null,
          latestSubmissionPayload: null,
          latestSubmissionProviderJobId: null,
        }),
      ),
    ).toBe('queued');
  });

  it("passes terminal statuses through unchanged", () => {
    expect(resolveGranularStatus(input({ status: 'completed' }))).toBe('completed');
    expect(resolveGranularStatus(input({ status: 'failed' }))).toBe('failed');
  });
});

describe('resolveGranularStatus — render-moderation (fast-filter) retries', () => {
  it("returns 'refiltering' when a pending retry carries the render-moderated error code", () => {
    expect(
      resolveGranularStatus(
        input({ status: 'pending', retryCount: 1, errorCode: 'content_render_moderated' }),
      ),
    ).toBe('refiltering');
  });

  it("takes priority over a cooldown wait reason on the same retry", () => {
    expect(
      resolveGranularStatus(
        input({
          status: 'pending',
          retryCount: 2,
          errorCode: 'content_render_moderated',
          waitReason: 'adaptive cooldown',
        }),
      ),
    ).toBe('refiltering');
  });

  it("stays 'retrying' when the retry is for a different error", () => {
    expect(
      resolveGranularStatus(
        input({ status: 'pending', retryCount: 1, errorCode: 'provider_timeout' }),
      ),
    ).toBe('retrying');
  });

  it("does not fire on the first attempt (retryCount 0) even with the error code set", () => {
    expect(
      resolveGranularStatus(
        input({
          status: 'pending',
          retryCount: 0,
          errorCode: 'content_render_moderated',
          attemptCount: null,
          latestSubmissionPayload: null,
          latestSubmissionProviderJobId: null,
        }),
      ),
    ).toBe('queued');
  });
});

describe("resolveGranularStatus — 'rendering' (polled past the fast-fail window)", () => {
  const T0 = 1_700_000_000_000;
  // Anchored on createdAt (stable across retries), not the resettable startedAt.
  const createdAtIso = new Date(T0).toISOString();

  it("stays 'polling' when no nowMs is given (back-compat / filters)", () => {
    expect(
      resolveGranularStatus(input({ status: 'processing', createdAt: createdAtIso })),
    ).toBe('polling');
  });

  it("returns 'rendering' once age >= the fast-fail threshold", () => {
    const now = T0 + RENDER_CONFIRMED_AFTER_MS + 1;
    expect(
      resolveGranularStatus(input({ status: 'processing', createdAt: createdAtIso }), now),
    ).toBe('rendering');
  });

  it("stays 'polling' while still inside the fast-fail window", () => {
    const now = T0 + RENDER_CONFIRMED_AFTER_MS - 500;
    expect(
      resolveGranularStatus(input({ status: 'processing', createdAt: createdAtIso }), now),
    ).toBe('polling');
  });

  it("stays 'polling' when createdAt is missing", () => {
    expect(
      resolveGranularStatus(input({ status: 'processing', createdAt: '' }), T0 + 60_000),
    ).toBe('polling');
  });

  it("does not apply before provider acceptance (still 'submitting')", () => {
    const now = T0 + RENDER_CONFIRMED_AFTER_MS + 1;
    expect(
      resolveGranularStatus(
        input({ status: 'processing', createdAt: createdAtIso, latestSubmissionProviderJobId: null }),
        now,
      ),
    ).toBe('submitting');
  });
});
