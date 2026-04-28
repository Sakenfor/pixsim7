/**
 * Shared bridge/agents status — single poller, many subscribers.
 *
 * Replaces N independent setInterval pollers in AIAssistantPanel, the two
 * activity-bar widgets, and any other surface that wants to know whether
 * the bridge is up. Polls `/meta/agents/bridge` and `/meta/agents` once and
 * fans out to all subscribers via useSyncExternalStore.
 *
 * Polling lifecycle:
 *   - Starts when the first subscriber arrives
 *   - Stops 100ms after the last subscriber leaves (StrictMode-safe)
 *   - Pauses while the document is hidden; resumes on visibilitychange
 *
 * The 15s interval is intentionally less aggressive than the per-component
 * 8-10s pollers it replaces — bridge state doesn't change second-to-second,
 * and one shared poll at 15s is still well under any user-noticeable lag.
 *
 * Future: replace the poll body with WS event subscription once the
 * backend emits bridge:status_changed events. Subscribers don't need to
 * know which transport delivered the snapshot.
 */
import { pixsimClient } from '@lib/api/client';

import type { BridgeStatus } from '@features/panels/domain/definitions/ai-assistant/assistantTypes';

export interface AgentSessionsStatus {
  total_active?: number;
  agents?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export interface BridgeStatusSnapshot {
  bridge: BridgeStatus | null;
  agents: AgentSessionsStatus | null;
  /** Date.now() of the last successful fetch; 0 before any fetch completes. */
  lastFetchedAt: number;
}

const POLL_INTERVAL_MS = 15_000;
const DISCONNECT_DELAY_MS = 100;
const POLL_HEADERS = { 'X-Client-Surface': 'shared:bridge-status' } as const;

const EMPTY_SNAPSHOT: BridgeStatusSnapshot = Object.freeze({
  bridge: null,
  agents: null,
  lastFetchedAt: 0,
});

type Listener = () => void;

class BridgeStatusStore {
  private snapshot: BridgeStatusSnapshot = EMPTY_SNAPSHOT;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private visibilityHandlerInstalled = false;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);

    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    if (this.listeners.size === 1) {
      this.start();
    } else if (this.snapshot.lastFetchedAt === 0) {
      // First fetch hasn't landed yet — let the new subscriber wait for
      // the in-flight one rather than firing a duplicate.
      void this.refresh();
    } else {
      // We have data, fire a fresh fetch so a newly mounted surface sees
      // current state instead of waiting up to POLL_INTERVAL_MS.
      void this.refresh();
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        // Small delay to survive StrictMode unmount/remount and rapid
        // panel close/open cycles without churning the poll cadence.
        this.disconnectTimer = setTimeout(() => {
          this.disconnectTimer = null;
          if (this.listeners.size === 0) this.stop();
        }, DISCONNECT_DELAY_MS);
      }
    };
  };

  getSnapshot = (): BridgeStatusSnapshot => this.snapshot;

  /** Force an immediate refresh. Coalesced if one is already in flight. */
  refresh = (): Promise<void> => {
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchOnce().finally(() => { this.inflight = null; });
    return this.inflight;
  };

  private async fetchOnce(): Promise<void> {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const [bridge, agents] = await Promise.all([
      pixsimClient.get<BridgeStatus>('/meta/agents/bridge', { headers: POLL_HEADERS }).catch(() => null),
      pixsimClient.get<AgentSessionsStatus>('/meta/agents', { headers: POLL_HEADERS }).catch(() => null),
    ]);
    this.snapshot = { bridge, agents, lastFetchedAt: Date.now() };
    this.notify();
  }

  private start(): void {
    void this.refresh();
    if (this.timer == null) {
      this.timer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    }
    if (typeof document !== 'undefined' && !this.visibilityHandlerInstalled) {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.visibilityHandlerInstalled = true;
    }
  }

  private stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.visibilityHandlerInstalled && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.visibilityHandlerInstalled = false;
    }
  }

  private onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.refresh();
    }
  };

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}

const _key = '__bridgeStatusStore';
export const bridgeStatusStore: BridgeStatusStore =
  ((globalThis as Record<string, unknown>)[_key] as BridgeStatusStore | undefined)
  ?? ((globalThis as Record<string, unknown>)[_key] = new BridgeStatusStore()) as BridgeStatusStore;
