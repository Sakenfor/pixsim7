import { describe, expect, it, vi } from 'vitest';
import type { GameSessionDTO, SessionUpdatePayload } from '@pixsim7/shared.types';

import { createSessionHelpers } from '../session/sessionAdapter';
import type { SessionAPI } from '../interactions/registry';

function createSession(version: number, flags: Record<string, unknown> = {}): GameSessionDTO {
  return {
    id: 42,
    user_id: 7,
    scene_id: 3,
    current_node_id: 9,
    world_id: 21,
    flags,
    stats: {},
    world_time: 0,
    version,
  };
}

describe('createSessionHelpers conflict retry', () => {
  it('uses the latest server version when retrying after conflict', async () => {
    vi.useFakeTimers();
    try {
      const payloads: SessionUpdatePayload[] = [];
      const api: SessionAPI = {
        updateSession: vi.fn(async (_sessionId, payload) => {
          payloads.push(payload);
          if (payloads.length === 1) {
            return {
              conflict: true,
              serverSession: createSession(5, { source: 'server' }),
            };
          }
          return {
            session: createSession(6, (payload.flags as Record<string, unknown>) ?? {}),
          };
        }),
      };

      const onUpdate = vi.fn();
      const helpers = createSessionHelpers(createSession(1), onUpdate, api);

      const updatePromise = helpers.updateArcStage('intro_arc', 2);
      await vi.runAllTimersAsync();
      const updated = await updatePromise;

      expect(payloads).toHaveLength(2);
      expect(payloads[0]?.expected_version).toBe(1);
      expect(payloads[1]?.expected_version).toBe(5);
      expect((payloads[1]?.flags as Record<string, any>)?.arcs?.intro_arc?.stage).toBe(2);
      expect(updated.version).toBe(6);
      expect(onUpdate).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createSessionHelpers optimistic updates', () => {
  it('returns a new session object and keeps the source session immutable', async () => {
    const source = createSession(1);
    const onUpdate = vi.fn();
    const helpers = createSessionHelpers(source, onUpdate);

    const updated = await helpers.updateArcStage('intro_arc', 2);
    const optimistic = onUpdate.mock.calls[0]?.[0] as GameSessionDTO;
    const arcs = (updated.flags as Record<string, any>).arcs as Record<string, any>;

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(updated).toBe(optimistic);
    expect(updated).not.toBe(source);
    expect(arcs?.intro_arc?.stage).toBe(2);
    expect((source.flags as Record<string, any>).arcs).toBeUndefined();
  });

  it('applies inventory changes exactly once without an API client', async () => {
    const source = createSession(1);
    const onUpdate = vi.fn();
    const helpers = createSessionHelpers(source, onUpdate);

    const updated = await helpers.addInventoryItem('flower', 2);
    const items = ((updated.flags as Record<string, any>).inventory?.items ?? []) as Array<
      Record<string, unknown>
    >;

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'flower',
      itemId: 'flower',
      qty: 2,
      quantity: 2,
    });
  });
});
