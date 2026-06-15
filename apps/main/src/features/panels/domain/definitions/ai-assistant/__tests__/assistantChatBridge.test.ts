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
  /** Mirror the real server: reply `pong` to every `ping` (ws_chat.py:1504).
   *  Flip to false to simulate a half-open socket (mobile wifi drop). */
  autoPong = true;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
    if (data === 'ping' && this.autoPong) this.onmessage?.({ data: 'pong' });
  }
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
    localStorage.clear();

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

    it('captures bridge_session_id from SSE result onto the request', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(
                  'data: {"type":"result","ok":true,"response":"ok","bridge_session_id":"sess-sse-1"}\n',
                ),
              })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });
      vi.stubGlobal('fetch', fetchMock);

      const sendPromise = bridge.send('tab-sse-bsid', { message: 'test' });
      await vi.advanceTimersByTimeAsync(0);
      MockWebSocket.instances[0].simulateError();
      await sendPromise;

      const req = bridge.get('tab-sse-bsid');
      expect(req?.bridgeSessionId).toBe('sess-sse-1');
      expect(req?.result?.bridge_session_id).toBe('sess-sse-1');
    });

    it('restores SSE-completed results after bridge recreation', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"type":"result","ok":true,"response":"persisted"}\n'),
              })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });
      vi.stubGlobal('fetch', fetchMock);

      const tabId = 'tab-sse-restore';
      const sendPromise = bridge.send(tabId, { message: 'test' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[0];
      ws.simulateError();
      await sendPromise;

      // New bridge instance (simulates full reload) should restore from localStorage.
      createFreshBridge();
      const mod = await import('../assistantChatBridge');
      const restored = mod.chatBridge.consume(tabId);
      expect(restored?.ok).toBe(true);
      expect(restored?.response).toBe('persisted');
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

    it('captures bridge_session_id from heartbeat (mid-turn, before result)', async () => {
      // Brand-new turn: client sends without bridge_session_id; the agent
      // resolves cli_session_id during streaming and surfaces it via a
      // heartbeat carrying bridge_session_id. The bridge must capture it
      // onto the request so first-message HMR recovery has a handle.
      const ws = await connectAndSend('tab-1', { message: 'hi' });

      expect(bridge.get('tab-1')!.bridgeSessionId).toBeUndefined();

      ws.simulateMessage({
        type: 'heartbeat',
        tab_id: 'tab-1',
        action: 'processing_task',
        detail: 'Working...',
        task_id: 'task-1',
        bridge_session_id: 'sess-resolved',
      });

      expect(bridge.get('tab-1')!.bridgeSessionId).toBe('sess-resolved');

      // Subsequent heartbeats with same session_id should be a no-op.
      ws.simulateMessage({
        type: 'heartbeat',
        tab_id: 'tab-1',
        action: 'processing_task',
        detail: 'Still working...',
        bridge_session_id: 'sess-resolved',
      });
      expect(bridge.get('tab-1')!.bridgeSessionId).toBe('sess-resolved');

      // INFLIGHT_KEY should now carry the session id so a full reload can
      // restore it onto the rebuilt BridgeRequest (and the panel can mirror
      // it onto tab.sessionId).
      const inflightRaw = localStorage.getItem('ai-assistant:inflight');
      expect(inflightRaw).toBeTruthy();
      const entries = JSON.parse(inflightRaw!) as Array<{ tabId: string; bridgeSessionId?: string }>;
      const entry = entries.find((e) => e.tabId === 'tab-1');
      expect(entry?.bridgeSessionId).toBe('sess-resolved');
    });

    it('captures resume_failed from heartbeat and carries it onto the result', async () => {
      // Plan `chat-session-durable-resume` CP-C: the bridge could not
      // restore the prior conversation. The verdict rides the heartbeat
      // (so the panel can warn before the reply) and the result envelope
      // (so a missed heartbeat still surfaces it).
      const ws = await connectAndSend('tab-1', { message: 'still there?' });

      ws.simulateMessage({
        type: 'heartbeat',
        tab_id: 'tab-1',
        action: 'resume_failed',
        detail: '',
        task_id: 'task-1',
        bridge_session_id: 'fresh-conv',
        resume_failed: { requested: 'old-conv', actual: 'fresh-conv' },
      });

      expect(bridge.get('tab-1')!.resumeFailed).toEqual({
        requested: 'old-conv',
        actual: 'fresh-conv',
      });

      ws.simulateMessage({
        type: 'result',
        tab_id: 'tab-1',
        ok: true,
        response: 'Done',
        bridge_session_id: 'fresh-conv',
        resume_failed: { requested: 'old-conv', actual: 'fresh-conv' },
      });

      const result = bridge.consume('tab-1');
      expect(result?.resumeFailed).toEqual({ requested: 'old-conv', actual: 'fresh-conv' });
    });

    it('ignores a malformed resume_failed payload', async () => {
      const ws = await connectAndSend('tab-1', { message: 'hi' });
      ws.simulateMessage({
        type: 'heartbeat',
        tab_id: 'tab-1',
        action: 'processing_task',
        detail: 'Working...',
        resume_failed: {},
      });
      expect(bridge.get('tab-1')!.resumeFailed ?? null).toBeNull();
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

    it('includes bridge_session_id in reconnect payload when known', async () => {
      const sendPromise = bridge.send('tab-1', { message: 'hi', bridge_session_id: 'sess-abc' });
      await vi.advanceTimersByTimeAsync(0);
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      await sendPromise;

      ws1.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'working', detail: 'Processing', task_id: 'task-123' });
      ws1.simulateClose();

      await vi.advanceTimersByTimeAsync(5000);
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();

      await vi.advanceTimersByTimeAsync(0);
      const reconnectMsg = ws2.sent.find((s) => {
        const parsed = JSON.parse(s);
        return parsed.type === 'reconnect';
      });
      expect(reconnectMsg).toBeDefined();
      const parsed = JSON.parse(reconnectMsg!);
      expect(parsed).toMatchObject({
        type: 'reconnect',
        tab_id: 'tab-1',
        task_id: 'task-123',
        bridge_session_id: 'sess-abc',
      });
    });

    it('persists bridge_session_id across page reload and includes it in reconnect frame', async () => {
      // Send + heartbeat so INFLIGHT_KEY captures both task_id and bridgeSessionId.
      const sendPromise = bridge.send('tab-reload', { message: 'hi', bridge_session_id: 'sess-reload' });
      await vi.advanceTimersByTimeAsync(0);
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      await sendPromise;
      ws1.simulateMessage({ type: 'heartbeat', tab_id: 'tab-reload', action: 'working', detail: 'p', task_id: 'task-reload' });

      // Simulate full page reload: drop the singleton and re-import.
      createFreshBridge();
      const mod = await import('../assistantChatBridge');
      const restored = mod.chatBridge;

      // Fresh bridge restores from INFLIGHT_KEY and opens a new WS to reconnect.
      await vi.advanceTimersByTimeAsync(0);
      const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(ws2).toBeDefined();
      expect(ws2).not.toBe(ws1);
      ws2.simulateOpen();

      await vi.advanceTimersByTimeAsync(0);
      const reconnectMsg = ws2.sent.find((s) => JSON.parse(s).type === 'reconnect');
      expect(reconnectMsg).toBeDefined();
      expect(JSON.parse(reconnectMsg!)).toMatchObject({
        type: 'reconnect',
        tab_id: 'tab-reload',
        task_id: 'task-reload',
        bridge_session_id: 'sess-reload',
      });

      // Restored request should also expose bridgeSessionId on the in-memory entry.
      expect(restored.get('tab-reload')?.bridgeSessionId).toBe('sess-reload');
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
  // task_not_found retry race (backend restart)
  //
  // When the backend restarts, the panel reconnects fast but the agent
  // bridge is still in its reconnect backoff, so the backend answers
  // `task_not_found` before the bridge has re-reported its in-flight
  // task_ids. The panel retries a bounded number of times (RECONNECT_RETRY_MAX
  // attempts, RECONNECT_RETRY_DELAY_MS apart) before surfacing the error.
  // ────────────────────────────────────────────────────────

  describe('task_not_found retry race', () => {
    async function connectStreaming(tabId: string, taskId: string) {
      const p = bridge.send(tabId, { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();
      await p;
      // Heartbeat captures task_id and moves the request to streaming.
      ws.simulateMessage({ type: 'heartbeat', tab_id: tabId, action: 'w', detail: 'Working', task_id: taskId });
      expect(bridge.get(tabId)!.status).toBe('streaming');
      expect(bridge.get(tabId)!.taskId).toBe(taskId);
      return ws;
    }

    function countReconnects(ws: MockWebSocket): number {
      return ws.sent.filter((s) => JSON.parse(s).type === 'reconnect').length;
    }

    it('suppresses the first task_not_found and re-sends a reconnect frame', async () => {
      const ws = await connectStreaming('tab-1', 'task-race');

      // Backend answers task_not_found — bridge not back yet.
      ws.simulateMessage({
        type: 'error', tab_id: 'tab-1',
        error: 'Task not found or expired', error_code: 'task_not_found',
      });

      // Error is NOT surfaced — the request stays streaming and shows a
      // reconnecting hint instead.
      expect(bridge.get('tab-1')!.status).toBe('streaming');
      expect(bridge.get('tab-1')!.activity).toMatch(/Reconnecting \(1\/3\)/);

      // After the retry delay the bridge re-sends a reconnect frame.
      await vi.advanceTimersByTimeAsync(6_000);
      expect(countReconnects(ws)).toBe(1);
    });

    it('gives up after the retry cap and surfaces the error (the field bug)', async () => {
      const ws = await connectStreaming('tab-1', 'task-race');

      // The bridge stays in backoff longer than the panel's retry budget:
      // every reconnect attempt keeps getting task_not_found. 4 errors and
      // 3 × 6s = the request finally surfaces the failure — exactly what the
      // user saw ("Task not found or expired") while the agent was still
      // running locally.
      for (let i = 0; i < 4; i++) {
        ws.simulateMessage({
          type: 'error', tab_id: 'tab-1',
          error: 'Task not found or expired', error_code: 'task_not_found',
        });
        await vi.advanceTimersByTimeAsync(6_000);
      }

      const req = bridge.get('tab-1')!;
      expect(req.status).toBe('error');
      expect(req.result?.error_code).toBe('task_not_found');
      // 3 retry frames were sent (the 4th error exhausted the cap).
      expect(countReconnects(ws)).toBe(3);
    });

    it('completes if the bridge returns before the retry budget runs out', async () => {
      const ws = await connectStreaming('tab-1', 'task-race');

      // First reconnect races ahead of the bridge → task_not_found.
      ws.simulateMessage({
        type: 'error', tab_id: 'tab-1',
        error: 'Task not found or expired', error_code: 'task_not_found',
      });
      expect(bridge.get('tab-1')!.status).toBe('streaming');

      // Retry fires; this time the bridge is back and the backend streams the
      // recovered result.
      await vi.advanceTimersByTimeAsync(6_000);
      expect(countReconnects(ws)).toBe(1);
      ws.simulateMessage({
        type: 'result', tab_id: 'tab-1', ok: true,
        response: 'recovered answer', bridge_session_id: 'sess-back', reconnected: true,
      });

      expect(bridge.get('tab-1')!.status).toBe('completed');
      expect(bridge.consume('tab-1')).toMatchObject({ ok: true, response: 'recovered answer' });
    });
  });

  // ────────────────────────────────────────────────────────
  // Backend grace-wait recovery (Fix A)
  //
  // After a backend restart the server now holds an unknown-task reconnect
  // open and emits `recovering` heartbeats while it waits for the agent bridge
  // to return, instead of answering task_not_found immediately. The panel must
  // ride those heartbeats: stay streaming, reset staleness, and complete on the
  // eventual result — never surfacing a spurious failure.
  // ────────────────────────────────────────────────────────

  describe('backend grace-wait recovery', () => {
    async function connectStreaming(tabId: string, taskId: string) {
      const p = bridge.send(tabId, { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();
      await p;
      ws.simulateMessage({ type: 'heartbeat', tab_id: tabId, action: 'w', detail: 'Working', task_id: taskId });
      expect(bridge.get(tabId)!.status).toBe('streaming');
      return ws;
    }

    it('keeps the request streaming and shows the recovering activity', async () => {
      const ws = await connectStreaming('tab-1', 'task-1');

      ws.simulateMessage({
        type: 'heartbeat', tab_id: 'tab-1', task_id: 'task-1',
        action: 'recovering', detail: 'Waiting for agent to reconnect',
      });

      const req = bridge.get('tab-1')!;
      expect(req.status).toBe('streaming');
      expect(req.activity).toBe('Waiting for agent to reconnect');
    });

    it('resets staleness so a long backend grace does not error the request', async () => {
      const ws = await connectStreaming('tab-1', 'task-1');

      // Three recovering heartbeats spaced 80s apart — 240s total, well past the
      // 90s stale threshold, but each resets the timer so it never trips.
      for (const detail of ['Waiting for agent to reconnect', 'Waiting for bridge replay', 'Waiting for bridge replay']) {
        await vi.advanceTimersByTimeAsync(80_000);
        ws.simulateMessage({
          type: 'heartbeat', tab_id: 'tab-1', task_id: 'task-1',
          action: 'recovering', detail,
        });
        expect(bridge.get('tab-1')!.status).toBe('streaming');
      }
    });

    it('rides through recovery and completes on the eventual result', async () => {
      const ws = await connectStreaming('tab-1', 'task-1');

      ws.simulateMessage({
        type: 'heartbeat', tab_id: 'tab-1', task_id: 'task-1',
        action: 'recovering', detail: 'Waiting for agent to reconnect',
      });
      ws.simulateMessage({
        type: 'heartbeat', tab_id: 'tab-1', task_id: 'task-1',
        action: 'recovering', detail: 'Waiting for bridge replay',
      });
      expect(bridge.get('tab-1')!.status).toBe('streaming');

      ws.simulateMessage({
        type: 'result', tab_id: 'tab-1', ok: true,
        response: 'recovered after restart', bridge_session_id: 'sess-back', reconnected: true,
      });

      expect(bridge.get('tab-1')!.status).toBe('completed');
      expect(bridge.consume('tab-1')).toMatchObject({ ok: true, response: 'recovered after restart' });
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

    it('keeps a pong-answering socket alive across many intervals', async () => {
      const sendPromise = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await sendPromise;
      ws.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'w', detail: 'Working', task_id: 't1' });

      // 5 ping intervals — each gets an auto-pong, so the socket is never
      // mistaken for half-open and no reconnect churn happens.
      await vi.advanceTimersByTimeAsync(150_000);
      expect(ws.readyState).toBe(MockWebSocket.OPEN);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  // ────────────────────────────────────────────────────────
  // Half-open socket detection (mobile wifi drop)
  //
  // The OS often doesn't fire `onclose` when mobile wifi drops — the socket
  // goes half-open: pings buffer into the void, no pong returns. Without
  // detection the in-flight turn dies on the 90s stale timeout (as an error)
  // instead of reconnecting. The bridge pings every 30s and recycles a socket
  // whose ping went a full interval unanswered.
  // ────────────────────────────────────────────────────────

  describe('half-open socket detection', () => {
    it('recycles a socket whose pings go unanswered and reconnects in-flight', async () => {
      const p = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      await p;
      ws1.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'w', detail: 'Working', task_id: 't1' });

      // Socket goes half-open — server stops replying pong.
      ws1.autoPong = false;

      // First interval sends a ping (no pong → awaiting); the next interval
      // sees the unanswered ping and force-closes the dead socket.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(ws1.readyState).toBe(MockWebSocket.CLOSED);

      // onclose → reconnect opens a fresh socket and re-attaches the turn.
      await vi.advanceTimersByTimeAsync(5_000);
      const ws2 = MockWebSocket.instances[1];
      expect(ws2).toBeDefined();
      expect(ws2).not.toBe(ws1);
      ws2.simulateOpen();
      await vi.advanceTimersByTimeAsync(0);
      const reconnectMsg = ws2.sent.find((s) => JSON.parse(s).type === 'reconnect');
      expect(JSON.parse(reconnectMsg!)).toMatchObject({ type: 'reconnect', tab_id: 'tab-1', task_id: 't1' });
    });
  });

  // ────────────────────────────────────────────────────────
  // Foreground / online resume trigger (mobile)
  // ────────────────────────────────────────────────────────

  describe('network-resume reconnect', () => {
    it('reconnects in-flight work immediately on the online event', async () => {
      const p = bridge.send('tab-1', { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      await p;
      ws1.simulateMessage({ type: 'heartbeat', tab_id: 'tab-1', action: 'w', detail: 'Working', task_id: 't1' });

      // Network dropped → socket closed.
      ws1.simulateClose();

      // online fires before the 5s scheduled reconnect — should reconnect now.
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      const ws2 = MockWebSocket.instances[1];
      expect(ws2).toBeDefined();
      ws2.simulateOpen();
      await vi.advanceTimersByTimeAsync(0);
      const reconnectMsg = ws2.sent.find((s) => JSON.parse(s).type === 'reconnect');
      expect(JSON.parse(reconnectMsg!)).toMatchObject({ type: 'reconnect', tab_id: 'tab-1', task_id: 't1' });
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

    it('persists stale-timeout result so it survives reload before consume', async () => {
      await connectAndSend('tab-1');

      // No heartbeats — push past the stale window
      await vi.advanceTimersByTimeAsync(105_000);
      expect(bridge.get('tab-1')!.status).toBe('error');

      // Completed key must contain the timeout error so a fresh bridge restores it
      const raw = localStorage.getItem('ai-assistant:completed');
      expect(raw).not.toBeNull();
      const map = JSON.parse(raw!) as Record<string, { result: { ok: boolean; error?: string } }>;
      expect(map['tab-1']).toBeDefined();
      expect(map['tab-1'].result.ok).toBe(false);
      expect(map['tab-1'].result.error).toMatch(/timed out/i);

      // Fresh bridge (simulating page reload) should restore + expose the error
      createFreshBridge();
      const mod = await import('../assistantChatBridge');
      const restored = mod.chatBridge.consume('tab-1');
      expect(restored?.ok).toBe(false);
      expect(restored?.error).toMatch(/timed out/i);
    });
  });

  // ────────────────────────────────────────────────────────
  // Confirmation prompt staleness carve-out
  // Plan: agent-confirmation-hooks / picker-timeout-investigation.
  // ────────────────────────────────────────────────────────

  describe('confirmation prompt staleness', () => {
    async function connectAndStreaming(tabId: string) {
      const p = bridge.send(tabId, { message: 'hi' });
      await vi.advanceTimersByTimeAsync(0);
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await p;
      // Heartbeat transitions pending → streaming (mirrors real flow
      // where the agent emits a heartbeat before invoking AskUser).
      ws.simulateMessage({
        type: 'heartbeat', tab_id: tabId, action: 'thinking',
        detail: 'Working', task_id: 't1',
      });
      return ws;
    }

    it('does not mark a request stale while a confirmation is pending', async () => {
      // The bug this guards: the bridge sets _lastActivity on
      // confirmation_request, then the agent blocks on the user. No
      // heartbeats arrive for the duration of the prompt. Without the
      // carve-out, _checkStale fires at 90s and unmounts the picker
      // BEFORE the backend's own 120s gate even has a chance to time out.
      const ws = await connectAndStreaming('tab-1');

      ws.simulateMessage({
        type: 'confirmation_request',
        tab_id: 'tab-1',
        confirmation_id: 'conf-1',
        title: 'Approve?',
        description: 'Run command X',
        tool_name: 'Bash',
        timeout_s: 120,
        task_id: 't1',
      });

      expect(bridge.get('tab-1')!.pendingConfirmation).toBeTruthy();
      expect(bridge.get('tab-1')!.status).toBe('streaming');

      // Advance past STALE_TIMEOUT_S (90s) + check interval — would
      // normally error the request.
      await vi.advanceTimersByTimeAsync(105_000);

      const req = bridge.get('tab-1');
      expect(req!.status).toBe('streaming');
      expect(req!.pendingConfirmation).toBeTruthy();
    });

    it('auto-clears pendingConfirmation when its own timeoutS elapses', async () => {
      // After the backend gate auto-resolves at timeout_s (120s), the
      // agent resumes processing. Frontend should drop the visual
      // prompt so the user sees the agent moving on rather than a
      // forever-unanswerable picker.
      const ws = await connectAndStreaming('tab-1');

      ws.simulateMessage({
        type: 'confirmation_request',
        tab_id: 'tab-1',
        confirmation_id: 'conf-1',
        title: 'Approve?',
        description: 'X',
        timeout_s: 120,
        task_id: 't1',
      });

      // Advance just past prompt timeoutS + slack (120 + 5 = 125s),
      // plus a check-interval tick so _checkStale actually runs.
      await vi.advanceTimersByTimeAsync(140_000);

      const req = bridge.get('tab-1');
      expect(req!.pendingConfirmation).toBeNull();
      // Request itself stays streaming — agent will resume after gate.
      expect(req!.status).toBe('streaming');
      expect(req!.activity).toMatch(/timed out/i);
    });

    it('respondToConfirmation resets _lastActivity to prevent immediate staleness', async () => {
      // If the user takes 80s to answer, the bridge's _lastActivity is
      // 80s stale by the time we send the response. The next agent
      // heartbeat may take a few seconds to arrive; in the gap
      // _checkStale could fire and kill the request. Resetting on
      // respondToConfirmation prevents that race.
      const ws = await connectAndStreaming('tab-1');

      ws.simulateMessage({
        type: 'confirmation_request',
        tab_id: 'tab-1',
        confirmation_id: 'conf-1',
        title: 'Approve?',
        description: 'X',
        timeout_s: 120,
        task_id: 't1',
      });

      // User takes 80s
      await vi.advanceTimersByTimeAsync(80_000);
      bridge.respondToConfirmation('tab-1', 'conf-1', true);

      expect(bridge.get('tab-1')!.pendingConfirmation).toBeNull();

      // Advance 80s more — 160s since original send but only 80s since
      // resetting _lastActivity. Should still be streaming.
      await vi.advanceTimersByTimeAsync(80_000);
      expect(bridge.get('tab-1')!.status).toBe('streaming');
    });
  });
});
