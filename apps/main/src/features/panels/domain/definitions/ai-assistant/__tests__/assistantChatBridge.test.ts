/**
 * Assistant Chat Bridge Tests
 *
 * Tests for WebSocket lifecycle, reconnection, tab multiplexing,
 * and message handling in the chat bridge singleton.
 */

export const TEST_SUITE = {
  id: 'assistant-chat-bridge',
  label: 'Assistant Chat Bridge (WebSocket & SSE)',
  kind: 'unit',
  category: 'frontend/ai-assistant',
  subcategory: 'chat-bridge',
  covers: ['apps/main/src/features/panels/domain/definitions/ai-assistant/assistantChatBridge.ts'],
  order: 40,
};

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──

vi.mock('@pixsim7/shared.auth.core', () => ({
  getAuthTokenProvider: () => ({
    getAccessToken: () => Promise.resolve('test-token'),
  }),
}));

vi.mock('@lib/api/client', () => ({
  API_BASE_URL: 'http://localhost:8000/api/v1',
}));

// ── Minimal WebSocket mock ──

interface MockWsHandler {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
}

class MockWebSocket implements MockWsHandler {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) { this.sent.push(data); }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helpers
  simulateOpen() { this.readyState = MockWebSocket.OPEN; this.onopen?.(); }
  simulateMessage(data: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(data) }); }
  simulateClose() { this.readyState = MockWebSocket.CLOSED; this.onclose?.(); }
  simulateError() { this.onerror?.(); }
}

// Fresh bridge per test — clear the globalThis singleton
function createFreshBridge() {
  const key = '__assistantChatBridge';
  delete (globalThis as Record<string, unknown>)[key];
  // Re-import to get a new instance
  // We'll use dynamic import, but since vitest caches, we create directly
  // Instead, import the class shape and instantiate
  // For simplicity, we'll just clear and re-require
  vi.resetModules();
}

// ── Tests ──

describe('AssistantChatBridge', () => {
  let bridge: typeof import('../assistantChatBridge').chatBridge;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    MockWebSocket.instances = [];

    // Stub global WebSocket
    vi.stubGlobal('WebSocket', MockWebSocket);
    Object.defineProperty(MockWebSocket, 'OPEN', { value: 1, configurable: true });
    Object.defineProperty(MockWebSocket, 'CLOSED', { value: 3, configurable: true });

    createFreshBridge();
    const mod = await import('../assistantChatBridge');
    bridge = mod.chatBridge;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ────────────────────────────────────────────────────────
  // Connection lifecycle
  // ────────────────────────────────────────────────────────

  describe('WebSocket connection', () => {
    it('connects on first send and transmits the message', async () => {
      const sendPromise = bridge.send('tab-1', { message: 'hello' });

      // Let the connection promise resolve
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[0];
      expect(ws).toBeDefined();
      ws.simulateOpen();
      await sendPromise;

      expect(ws.sent).toHaveLength(1);
      const msg = JSON.parse(ws.sent[0]);
      expect(msg).toMatchObject({ type: 'message', tab_id: 'tab-1', message: 'hello' });
    });

    it('derives wss: URL from https: base', async () => {
      vi.resetModules();
      vi.doMock('@lib/api/client', () => ({
        API_BASE_URL: 'https://app.example.com/api/v1',
      }));
      vi.doMock('@pixsim7/shared.auth.core', () => ({
        getAuthTokenProvider: () => ({
          getAccessToken: () => Promise.resolve('tok'),
        }),
      }));

      const key = '__assistantChatBridge';
      delete (globalThis as Record<string, unknown>)[key];
      const mod = await import('../assistantChatBridge');
      const b = mod.chatBridge;

      const p = b.send('t1', { message: 'x' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();
      await p;

      expect(ws.url).toMatch(/^wss:\/\/app\.example\.com/);
      expect(ws.url).toContain('/ws/chat');
    });

    it('falls back to SSE when WebSocket fails to connect', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"type":"result","ok":true,"response":"hi"}\n'),
              })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });
      vi.stubGlobal('fetch', fetchMock);

      const sendPromise = bridge.send('tab-sse', { message: 'test' });
      await vi.advanceTimersByTimeAsync(0);

      // Make WebSocket fail
      const ws = MockWebSocket.instances[0];
      ws.simulateError();

      await sendPromise;

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/meta/agents/bridge/send-stream'),
        expect.objectContaining({ method: 'POST' }),
      );

      const result = bridge.consume('tab-sse');
      expect(result?.ok).toBe(true);
      expect(result?.response).toBe('hi');
    });
  });

  // ────────────────────────────────────────────────────────
  // Message handling
  // ────────────────────────────────────────────────────────

  describe('message handling', () => {
    async function connectAndSend(tabId: string, body: Record<string, unknown>) {
      const p = bridge.send(tabId, body);
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();
      await p;
      return ws;
    }

    it('transitions through pending → streaming → completed', async () => {
      const ws = await connectAndSend('tab-1', { message: 'hi' });

      // Initially pending (or just sent)
      const req = bridge.get('tab-1');
      expect(req).toBeDefined();
      expect(req!.status).toBe('pending');

      // Heartbeat → streaming
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'analyzing', detail: 'Reading code', task_id: 'task-abc' });
      expect(bridge.get('tab-1')!.status).toBe('streaming');
      expect(bridge.get('tab-1')!.activity).toBe('Reading code');
      expect(bridge.get('tab-1')!.taskId).toBe('task-abc');

      // Result → completed
      ws.simulateMessage({ type: 'result', tab_id: 'tab-1', ok: true, response: 'Done', bridge_session_id: 'sess-1' });
      expect(bridge.get('tab-1')!.status).toBe('completed');

      const result = bridge.consume('tab-1');
      expect(result).toMatchObject({ ok: true, response: 'Done', bridge_session_id: 'sess-1' });

      // After consume, request stays (marked consumed) but won't double-consume
      expect(bridge.get('tab-1')).toBeDefined();
      expect(bridge.get('tab-1')!._consumed).toBe(true);
      expect(bridge.consume('tab-1')).toBeNull(); // idempotent
    });

    it('captures task_id from first heartbeat only', async () => {
      const ws = await connectAndSend('tab-1', { message: 'hi' });

      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'a', detail: 'x', task_id: 'first' });
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'b', detail: 'y', task_id: 'second' });

      expect(bridge.get('tab-1')!.taskId).toBe('first');
    });

    it('handles error messages', async () => {
      const ws = await connectAndSend('tab-1', { message: 'hi' });

      ws.simulateMessage({ type: 'error', tab_id: 'tab-1', error: 'Something broke' });
      expect(bridge.get('tab-1')!.status).toBe('error');

      const result = bridge.consume('tab-1');
      expect(result).toMatchObject({ ok: false, error: 'Something broke' });
    });

    it('ignores messages for unknown tab IDs', async () => {
      const ws = await connectAndSend('tab-1', { message: 'hi' });

      // Should not throw
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'unknown-tab', action: 'x', detail: 'y' });
      ws.simulateMessage({ type: 'result', tab_id: 'unknown-tab', ok: true });

      // Original request unaffected
      expect(bridge.get('tab-1')!.status).toBe('pending');
    });

    it('multiplexes multiple tabs on one WebSocket', async () => {
      const ws = await connectAndSend('tab-A', { message: 'first' });

      // Second send reuses same WS
      await bridge.send('tab-B', { message: 'second' });

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(ws.sent).toHaveLength(2);

      // Each tab gets its own result
      ws.simulateMessage({ type: 'result', tab_id: 'tab-A', ok: true, response: 'A reply' });
      ws.simulateMessage({ type: 'result', tab_id: 'tab-B', ok: true, response: 'B reply' });

      expect(bridge.consume('tab-A')?.response).toBe('A reply');
      expect(bridge.consume('tab-B')?.response).toBe('B reply');
    });
  });

  // ────────────────────────────────────────────────────────
  // Heartbeat deduplication
  // ────────────────────────────────────────────────────────

  describe('heartbeat deduplication', () => {
    async function connectAndSend(tabId: string) {
      const p = bridge.send(tabId, { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      MockWebSocket.instances[0].simulateOpen();
      await p;
      return MockWebSocket.instances[0];
    }

    it('deduplicates heartbeats with same prefix', async () => {
      const ws = await connectAndSend('tab-1');

      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'reading', detail: 'Reading file' });
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'reading', detail: 'Reading file...' });
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'reading', detail: 'Reading file... done' });

      // Should only have 1 entry (latest detail kept via update)
      const log = bridge.get('tab-1')!.thinkingLog;
      expect(log).toHaveLength(1);
      expect(log[0].detail).toBe('Reading file... done');
    });

    it('skips generic heartbeats like "thinking" and "active"', async () => {
      const ws = await connectAndSend('tab-1');

      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'thinking', detail: '' });
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'active', detail: '' });

      expect(bridge.get('tab-1')!.thinkingLog).toHaveLength(0);
    });

    it('adds distinct heartbeats as separate entries', async () => {
      const ws = await connectAndSend('tab-1');

      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'a', detail: 'Analyzing code' });
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'b', detail: 'Writing tests' });

      expect(bridge.get('tab-1')!.thinkingLog).toHaveLength(2);
    });
  });

  // ────────────────────────────────────────────────────────
  // Reconnection
  // ────────────────────────────────────────────────────────

  describe('reconnection on WebSocket drop', () => {
    it('reconnects and reattaches pending tasks after unexpected close', async () => {
      // Initial connection + send
      const sendPromise = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      await sendPromise;

      // Receive heartbeat with task_id
      ws1.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'working', detail: 'Processing', task_id: 'task-123' });
      expect(bridge.get('tab-1')!.status).toBe('streaming');

      // WebSocket drops
      ws1.simulateClose();

      // After 5s, reconnect should happen
      await vi.advanceTimersByTimeAsync(5000);
      const ws2 = MockWebSocket.instances[1];
      expect(ws2).toBeDefined();
      ws2.simulateOpen();

      // Should have sent a reconnect message
      await vi.advanceTimersByTimeAsync(0);
      const reconnectMsg = ws2.sent.find((s) => {
        const parsed = JSON.parse(s);
        return parsed.type === 'reconnect';
      });
      expect(reconnectMsg).toBeDefined();
      const parsed = JSON.parse(reconnectMsg!);
      expect(parsed).toMatchObject({ type: 'reconnect', tab_id: 'tab-1', task_id: 'task-123' });
    });

    it('does not reconnect when no pending requests', async () => {
      // Connect and complete a request
      const sendPromise = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      await sendPromise;

      ws1.simulateMessage({ type: 'result', tab_id: 'tab-1', ok: true, response: 'done' });
      bridge.consume('tab-1');

      // WebSocket drops
      ws1.simulateClose();

      // After 5s, should NOT create new connection
      await vi.advanceTimersByTimeAsync(5000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('retries reconnection on failure', async () => {
      // Connect and keep request pending
      const sendPromise = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      await sendPromise;

      ws1.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'w', detail: 'Working', task_id: 't1' });

      // Drop connection
      ws1.simulateClose();

      // First reconnect attempt — fails
      await vi.advanceTimersByTimeAsync(5000);
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateError();

      // Second reconnect attempt after another 5s
      await vi.advanceTimersByTimeAsync(5100);
      expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ────────────────────────────────────────────────────────
  // Consume behavior (panel close/reopen resilience)
  // ────────────────────────────────────────────────────────

  describe('consume and panel remount', () => {
    async function connectAndSend(tabId: string, body: Record<string, unknown> = { message: 'hi' }) {
      const p = bridge.send(tabId, body);
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();
      await p;
      return ws;
    }

    it('consume marks _consumed but does not delete from requests', async () => {
      const ws = await connectAndSend('tab-1');
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'thinking', detail: 'Processing...', task_id: 't1' });
      ws.simulateMessage({ type: 'result', tab_id: 'tab-1', ok: true, response: 'Done', bridge_session_id: 'sess-1' });

      const result = bridge.consume('tab-1');
      expect(result).toBeDefined();
      expect(result!.ok).toBe(true);

      // Request is still visible (thinking log accessible)
      const req = bridge.get('tab-1');
      expect(req).toBeDefined();
      expect(req!._consumed).toBe(true);
      expect(req!.status).toBe('completed');
      expect(req!.thinkingLog.length).toBeGreaterThan(0);
    });

    it('double-consume returns null (idempotent)', async () => {
      const ws = await connectAndSend('tab-1');
      ws.simulateMessage({ type: 'result', tab_id: 'tab-1', ok: true, response: 'Done' });

      expect(bridge.consume('tab-1')).toBeDefined();
      expect(bridge.consume('tab-1')).toBeNull();
      expect(bridge.consume('tab-1')).toBeNull();
    });

    it('thinking log survives consume — accessible after panel reopen', async () => {
      const ws = await connectAndSend('tab-1');

      // Agent sends several thinking steps
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'reading', detail: 'Reading file A', task_id: 't1' });
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'analyzing', detail: 'Analyzing dependencies', task_id: 't1' });
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'writing', detail: 'Writing fix', task_id: 't1' });
      ws.simulateMessage({ type: 'result', tab_id: 'tab-1', ok: true, response: 'Fixed!', bridge_session_id: 'sess-1' });

      // Panel A consumes the result (e.g., hidden docked instance)
      bridge.consume('tab-1');

      // Panel B reopens — thinking log is still there
      const req = bridge.get('tab-1');
      expect(req).toBeDefined();
      expect(req!.thinkingLog).toHaveLength(3);
      expect(req!.result?.response).toBe('Fixed!');
    });

    it('consumed request is cleaned up when a new message is sent', async () => {
      const ws = await connectAndSend('tab-1');
      ws.simulateMessage({ type: 'result', tab_id: 'tab-1', ok: true, response: 'First response' });
      bridge.consume('tab-1');
      expect(bridge.get('tab-1')!._consumed).toBe(true);

      // Send a new message — old consumed request replaced
      await bridge.send('tab-1', { message: 'second' });
      const req = bridge.get('tab-1');
      expect(req!._consumed).toBeFalsy();
      expect(req!.status).toBe('pending');
    });

    it('error result survives consume for panel reopen', async () => {
      const ws = await connectAndSend('tab-1');
      ws.simulateMessage({ type: 'error', tab_id: 'tab-1', error: 'Remote agent disconnected' });

      bridge.consume('tab-1');

      const req = bridge.get('tab-1');
      expect(req).toBeDefined();
      expect(req!._consumed).toBe(true);
      expect(req!.result?.error).toBe('Remote agent disconnected');
    });

    it('streaming request is still visible while unconsumed', async () => {
      const ws = await connectAndSend('tab-1');
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'analyzing', detail: 'Thinking...', task_id: 't1' });

      // Simulate panel close — unsubscribe listener
      const unsub = bridge.subscribe(() => {});
      unsub();

      // Bridge keeps receiving heartbeats
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'writing', detail: 'Writing code', task_id: 't1' });

      // Simulate panel reopen — request still streaming
      const req = bridge.get('tab-1');
      expect(req).toBeDefined();
      expect(req!.status).toBe('streaming');
      expect(req!.thinkingLog.length).toBe(2);
      expect(req!.activity).toBe('Writing code');
    });

    it('consume does not affect other tabs', async () => {
      const ws = await connectAndSend('tab-A');
      await bridge.send('tab-B', { message: 'second' });

      ws.simulateMessage({ type: 'result', tab_id: 'tab-A', ok: true, response: 'A done' });
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-B', action: 'working', detail: 'Busy', task_id: 't2' });

      bridge.consume('tab-A');

      // Tab B unaffected
      const reqB = bridge.get('tab-B');
      expect(reqB).toBeDefined();
      expect(reqB!.status).toBe('streaming');
      expect(reqB!._consumed).toBeFalsy();
    });

    it('cancel after consume still works for next request', async () => {
      const ws = await connectAndSend('tab-1');
      ws.simulateMessage({ type: 'result', tab_id: 'tab-1', ok: true, response: 'Done' });
      bridge.consume('tab-1');

      // Cancel on a consumed request is a no-op (already completed)
      bridge.cancel('tab-1');
      expect(bridge.get('tab-1')!.status).toBe('completed'); // not error

      // New send works fine
      await bridge.send('tab-1', { message: 'next' });
      expect(bridge.get('tab-1')!.status).toBe('pending');
    });
  });

  // ────────────────────────────────────────────────────────
  // Cancel
  // ────────────────────────────────────────────────────────

  describe('cancellation', () => {
    it('sends cancel message over WebSocket and marks request as error', async () => {
      const sendPromise = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await sendPromise;

      bridge.cancel('tab-1');

      const cancelMsg = ws.sent.find((s) => JSON.parse(s).type === 'cancel');
      expect(cancelMsg).toBeDefined();
      expect(JSON.parse(cancelMsg!)).toMatchObject({ type: 'cancel', tab_id: 'tab-1' });

      expect(bridge.get('tab-1')!.status).toBe('error');
      expect(bridge.consume('tab-1')?.error).toBe('cancelled');
    });

    it('aborts previous request when sending to same tab', async () => {
      const sendPromise1 = bridge.send('tab-1', { message: 'first' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await sendPromise1;

      const req1 = bridge.get('tab-1')!;
      const abortSpy = vi.spyOn(req1.abort, 'abort');

      // Second send to same tab
      await bridge.send('tab-1', { message: 'second' });

      expect(abortSpy).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────
  // Subscribe / snapshot
  // ────────────────────────────────────────────────────────

  describe('subscribe & snapshot', () => {
    it('notifies listeners on state changes', async () => {
      const listener = vi.fn();
      const unsub = bridge.subscribe(listener);

      const sendPromise = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await sendPromise;

      // send() notifies once
      const callsBefore = listener.mock.calls.length;
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'a', detail: 'Working' });
      expect(listener.mock.calls.length).toBeGreaterThan(callsBefore);

      unsub();
      const callsAfterUnsub = listener.mock.calls.length;
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'b', detail: 'More work' });
      expect(listener.mock.calls.length).toBe(callsAfterUnsub);
    });

    it('getSnapshot changes when requests change', async () => {
      const snap1 = bridge.getSnapshot();

      const sendPromise = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      MockWebSocket.instances[0].simulateOpen();
      await sendPromise;

      const snap2 = bridge.getSnapshot();
      expect(snap2).not.toBe(snap1);
    });
  });

  // ────────────────────────────────────────────────────────
  // Ping keepalive
  // ────────────────────────────────────────────────────────

  describe('ping keepalive', () => {
    it('sends ping every 30 seconds', async () => {
      const sendPromise = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await sendPromise;

      ws.sent.length = 0; // Clear initial message

      await vi.advanceTimersByTimeAsync(30000);
      expect(ws.sent).toContain('ping');
    });

    it('ignores pong responses', async () => {
      const sendPromise = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await sendPromise;

      // Simulate pong — should not affect any request
      ws.onmessage?.({ data: 'pong' });
      expect(bridge.get('tab-1')!.status).toBe('pending');
    });
  });

  // ────────────────────────────────────────────────────────
  // Staleness detection
  // ────────────────────────────────────────────────────────

  describe('staleness detection', () => {
    async function connectAndSend(tabId: string) {
      const p = bridge.send(tabId, { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      MockWebSocket.instances[0].simulateOpen();
      await p;
      return MockWebSocket.instances[0];
    }

    it('marks request as error after 90s with no heartbeats', async () => {
      await connectAndSend('tab-1');

      expect(bridge.get('tab-1')!.status).toBe('pending');

      // Advance past the stale timeout (90s) + one check interval (15s)
      await vi.advanceTimersByTimeAsync(105_000);

      const req = bridge.get('tab-1');
      expect(req).toBeDefined();
      expect(req!.status).toBe('error');
      expect(req!.result?.error).toMatch(/timed out/i);
    });

    it('does not mark as stale if heartbeats keep arriving', async () => {
      const ws = await connectAndSend('tab-1');

      // Heartbeat at 30s
      await vi.advanceTimersByTimeAsync(30_000);
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'working', detail: 'Thinking deeply', task_id: 't1' });
      expect(bridge.get('tab-1')!.status).toBe('streaming');

      // Another heartbeat at 80s (50s after first)
      await vi.advanceTimersByTimeAsync(50_000);
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'working', detail: 'Still going', task_id: 't1' });

      // At 120s (40s after last heartbeat) — still under 90s threshold
      await vi.advanceTimersByTimeAsync(40_000);
      expect(bridge.get('tab-1')!.status).toBe('streaming');
    });

    it('resets staleness timer on reconnect', async () => {
      const ws1 = await connectAndSend('tab-1');

      // Heartbeat → streaming
      ws1.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'w', detail: 'Working', task_id: 't1' });

      // Advance 80s — close to stale but not yet
      await vi.advanceTimersByTimeAsync(80_000);
      expect(bridge.get('tab-1')!.status).toBe('streaming');

      // WS drops → reconnect after 5s
      ws1.simulateClose();
      await vi.advanceTimersByTimeAsync(5_000);
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();
      // Reconnect resets _lastActivity
      await vi.advanceTimersByTimeAsync(0);

      // 80s more — would be 165s total but only 80s since reconnect
      await vi.advanceTimersByTimeAsync(80_000);
      expect(bridge.get('tab-1')!.status).toBe('streaming');
    });

    it('does not affect completed requests', async () => {
      const ws = await connectAndSend('tab-1');

      ws.simulateMessage({ type: 'result', tab_id: 'tab-1', ok: true, response: 'done' });
      expect(bridge.get('tab-1')!.status).toBe('completed');

      // Advance well past stale timeout
      await vi.advanceTimersByTimeAsync(200_000);
      expect(bridge.get('tab-1')!.status).toBe('completed');
    });
  });
});
