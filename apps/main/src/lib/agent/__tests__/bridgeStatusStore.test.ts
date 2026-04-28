/**
 * Bridge status store — single shared poller, reference-counted lifecycle.
 */
export const TEST_SUITE = {
  id: 'bridge-status-store',
  label: 'Bridge Status Store (shared poller)',
  kind: 'unit',
  category: 'frontend/agent',
  subcategory: 'bridge-status',
  covers: ['apps/main/src/lib/agent/bridgeStatusStore.ts'],
  order: 30,
};

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// pixsimClient is the only network dependency we need.
const pixsimGet = vi.fn();
vi.mock('@lib/api/client', () => ({
  pixsimClient: {
    get: (...args: unknown[]) => pixsimGet(...args),
  },
}));

// Stub the WS shim so tests don't transitively import generation stores or
// the actual WebSocket manager. We don't exercise WS push behavior here —
// that lives in its own integration test path.
const wsListeners = new Set<(msg: unknown) => void>();
let wsUnsubscribeCalls = 0;
const wsSubscribe = vi.fn((listener: (msg: unknown) => void) => {
  wsListeners.add(listener);
  return () => {
    wsListeners.delete(listener);
    wsUnsubscribeCalls += 1;
  };
});
vi.mock('@features/generation/hooks/useGenerationWebSocket', () => ({
  subscribeToWebSocketMessages: (listener: (msg: unknown) => void) => wsSubscribe(listener),
}));

async function freshStore() {
  // Each test gets a fresh store — clear the globalThis singleton and
  // reload the module so internal state is reset.
  delete (globalThis as Record<string, unknown>).__bridgeStatusStore;
  vi.resetModules();
  const mod = await import('../bridgeStatusStore');
  return mod.bridgeStatusStore;
}

beforeEach(() => {
  vi.useFakeTimers();
  pixsimGet.mockReset();
  wsListeners.clear();
  wsUnsubscribeCalls = 0;
  wsSubscribe.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bridgeStatusStore', () => {
  it('starts polling on first subscriber and stops after last unsubscribes', async () => {
    pixsimGet.mockResolvedValue({ connected: 1, available: 1, process_alive: true });
    const store = await freshStore();

    expect(pixsimGet).not.toHaveBeenCalled();

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    // Initial fetch fires immediately (both endpoints).
    await vi.advanceTimersByTimeAsync(0);
    expect(pixsimGet).toHaveBeenCalledTimes(2);

    // Each interval tick fires another pair of fetches.
    pixsimGet.mockClear();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(pixsimGet).toHaveBeenCalledTimes(2);

    // Unsubscribe — disconnect-delay debounce protects against StrictMode churn.
    pixsimGet.mockClear();
    unsubscribe();
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(pixsimGet).not.toHaveBeenCalled();
  });

  it('does not duplicate the poll loop with multiple subscribers', async () => {
    pixsimGet.mockResolvedValue({ connected: 0, available: 0 });
    const store = await freshStore();

    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    store.subscribe(a);
    await vi.advanceTimersByTimeAsync(0);
    // Initial fetch from first subscriber: 2 calls (bridge + agents).
    expect(pixsimGet).toHaveBeenCalledTimes(2);

    pixsimGet.mockClear();
    store.subscribe(b);
    store.subscribe(c);
    // New subscribers each trigger a refresh, but inflight coalesces into
    // a single in-flight pair. Both refresh() calls return the same promise.
    await vi.advanceTimersByTimeAsync(0);
    expect(pixsimGet).toHaveBeenCalledTimes(2);

    // One interval tick = still only one pair of fetches.
    pixsimGet.mockClear();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(pixsimGet).toHaveBeenCalledTimes(2);
  });

  it('coalesces overlapping refresh() calls into one in-flight fetch', async () => {
    let resolveBridge: (v: unknown) => void = () => undefined;
    const blockedBridge = new Promise((res) => { resolveBridge = res; });
    pixsimGet.mockImplementation((url: string) => {
      if (url === '/meta/agents/bridge') return blockedBridge;
      return Promise.resolve(null);
    });

    const store = await freshStore();
    const unsubscribe = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(pixsimGet).toHaveBeenCalledTimes(2);

    // Three more refresh() calls before the first finishes — all coalesce.
    void store.refresh();
    void store.refresh();
    void store.refresh();
    expect(pixsimGet).toHaveBeenCalledTimes(2);

    resolveBridge({ connected: 1 });
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
  });

  it('snapshot reflects fetched data', async () => {
    pixsimGet.mockImplementation((url: string) => {
      if (url === '/meta/agents/bridge') return Promise.resolve({ connected: 2, available: 2, process_alive: true });
      if (url === '/meta/agents') return Promise.resolve({ total_active: 5 });
      return Promise.resolve(null);
    });

    const store = await freshStore();
    const unsubscribe = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    const snap = store.getSnapshot();
    expect(snap.bridge?.connected).toBe(2);
    expect(snap.agents?.total_active).toBe(5);
    expect(snap.lastFetchedAt).toBeGreaterThan(0);
    unsubscribe();
  });

  it('failed fetches set fields to null without throwing', async () => {
    pixsimGet.mockRejectedValue(new Error('network down'));
    const store = await freshStore();
    const unsubscribe = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    const snap = store.getSnapshot();
    expect(snap.bridge).toBeNull();
    expect(snap.agents).toBeNull();
    unsubscribe();
  });

  it('notifies listeners on each successful fetch', async () => {
    pixsimGet.mockResolvedValue({ connected: 1 });
    const store = await freshStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalled();
    const initialCalls = listener.mock.calls.length;

    await vi.advanceTimersByTimeAsync(15_000);
    expect(listener.mock.calls.length).toBeGreaterThan(initialCalls);
    unsubscribe();
  });

  it('subscribes to WS messages on first subscriber, unsubscribes on stop', async () => {
    pixsimGet.mockResolvedValue({ connected: 0 });
    const store = await freshStore();

    expect(wsSubscribe).not.toHaveBeenCalled();

    const unsub = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(wsSubscribe).toHaveBeenCalledTimes(1);
    expect(wsUnsubscribeCalls).toBe(0);

    unsub();
    await vi.advanceTimersByTimeAsync(200);
    expect(wsUnsubscribeCalls).toBe(1);
  });

  it('refreshes immediately when a bridge:* WS event arrives', async () => {
    pixsimGet.mockResolvedValue({ connected: 1 });
    const store = await freshStore();
    const unsub = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    pixsimGet.mockClear();

    // Push a bridge:status_changed event through the mocked WS listener.
    expect(wsListeners.size).toBe(1);
    wsListeners.forEach((l) => l({ type: 'bridge:status_changed', data: { connected: 2, available: 2 } }));
    await vi.advanceTimersByTimeAsync(0);

    // The push should have triggered an immediate refresh (not waited 15s).
    expect(pixsimGet).toHaveBeenCalledTimes(2);
    unsub();
  });

  it('ignores non-bridge WS events', async () => {
    pixsimGet.mockResolvedValue({ connected: 0 });
    const store = await freshStore();
    const unsub = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    pixsimGet.mockClear();

    wsListeners.forEach((l) => l({ type: 'job:created', data: {} }));
    wsListeners.forEach((l) => l({ type: 'asset:created', data: {} }));
    await vi.advanceTimersByTimeAsync(0);

    expect(pixsimGet).not.toHaveBeenCalled();
    unsub();
  });

  it('keeps polling if the disconnect window is interrupted by a new subscriber', async () => {
    pixsimGet.mockResolvedValue({ connected: 1 });
    const store = await freshStore();

    const a = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    a(); // unsubscribe — schedules stop in 100ms

    // Within the 100ms window a new subscriber arrives.
    await vi.advanceTimersByTimeAsync(50);
    const b = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    // Stop should have been cancelled — interval keeps firing.
    pixsimGet.mockClear();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(pixsimGet).toHaveBeenCalledTimes(2);

    b();
  });
});
