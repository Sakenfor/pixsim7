/**
 * useConnectedEngines — derived view over the shared bridge status.
 *
 * Returns the union of normalized engines reported by every connected bridge
 * agent (e.g. `Set { "claude", "codex" }`). Empty set means either no bridges
 * are connected or no bridge has reported its pool engines yet.
 *
 * The shape is "what engines can I dispatch to right now" rather than "which
 * bridges exist", because the chat-tab health check only cares whether
 * `tab.engine` is currently dispatchable. If a bridge advertises `claude-cli`
 * but its pool's codex-cli session is dead, the bridge will report only
 * `["claude-cli"]` after the next pool_status — which is exactly the signal
 * the pill should turn red on.
 *
 * Falls back to the bridge's primary `agent_type` when the pool report
 * hasn't landed yet so the pill doesn't flash red on first paint.
 */
import { useMemo } from 'react';

import { normalizeEngine } from './engineBrands';
import { useBridgeStatus } from './useBridgeStatus';

export interface ConnectedEngines {
  /** Normalized engine ids ("claude", "codex", ...) currently dispatchable. */
  engines: Set<string>;
  /**
   * Normalized engine id → probe-failure reason from the bridge's startup
   * `<binary> --version` check. An entry here means "the engine was
   * configured but the binary refuses to launch" — distinct from "not
   * advertised at all". Lets the pill tooltip explain `codex install
   * broken` vs `codex not installed`.
   */
  failedEngines: Map<string, string>;
  /** True once we have at least one successful poll back. */
  hasReport: boolean;
}

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

export function useConnectedEngines(): ConnectedEngines {
  const { bridge, lastFetchedAt } = useBridgeStatus();
  return useMemo<ConnectedEngines>(() => {
    if (!bridge || lastFetchedAt === 0) {
      return {
        engines: EMPTY_SET as Set<string>,
        failedEngines: EMPTY_MAP as Map<string, string>,
        hasReport: false,
      };
    }
    const out = new Set<string>();
    const failed = new Map<string, string>();
    for (const a of bridge.agents ?? []) {
      const list = a.engines && a.engines.length > 0 ? a.engines : (a.agent_type ? [a.agent_type] : []);
      for (const raw of list) {
        const norm = normalizeEngine(raw);
        if (norm) out.add(norm);
      }
      for (const f of a.failed_engines ?? []) {
        const norm = normalizeEngine(f.engine);
        if (norm && !out.has(norm)) {
          // Only record the failure for engines NOT also reporting healthy
          // on another bridge — a working claude-cli on bridge A shouldn't
          // be marked failed because bridge B's claude probe died.
          failed.set(norm, f.reason);
        }
      }
    }
    return { engines: out, failedEngines: failed, hasReport: true };
  }, [bridge, lastFetchedAt]);
}
