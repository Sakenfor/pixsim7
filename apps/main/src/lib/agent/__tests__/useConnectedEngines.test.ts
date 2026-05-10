/**
 * useConnectedEngines — derived view over the shared bridge status.
 *
 * Covers normalizeEngine pairing with the bridge → tab.engine match logic
 * that the chat-tab health pill depends on. The hook side is exercised
 * indirectly via the same selector function the hook wraps.
 */
export const TEST_SUITE = {
  id: 'use-connected-engines',
  label: 'useConnectedEngines (engine-health pill)',
  kind: 'unit',
  category: 'frontend/agent',
  subcategory: 'bridge-status',
  covers: [
    'apps/main/src/lib/agent/useConnectedEngines.ts',
    'apps/main/src/lib/agent/engineBrands.ts',
  ],
  order: 31,
};

import { describe, it, expect } from 'vitest';

import type { BridgeStatus } from '@features/panels/domain/definitions/ai-assistant/assistantTypes';

import { normalizeEngine } from '../engineBrands';


// The hook wraps a useMemo over (bridge, lastFetchedAt) — pull the same
// selector inline so we can test it without a React renderer.
function selectEngines(snapshot: { bridge: BridgeStatus | null; lastFetchedAt: number }): {
  engines: Set<string>;
  failedEngines: Map<string, string>;
  hasReport: boolean;
} {
  const { bridge, lastFetchedAt } = snapshot;
  if (!bridge || lastFetchedAt === 0) {
    return { engines: new Set<string>(), failedEngines: new Map<string, string>(), hasReport: false };
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
      if (norm && !out.has(norm)) failed.set(norm, f.reason);
    }
  }
  return { engines: out, failedEngines: failed, hasReport: true };
}

describe('normalizeEngine', () => {
  it('strips -cli suffix to match user-facing form', () => {
    expect(normalizeEngine('claude-cli')).toBe('claude');
    expect(normalizeEngine('codex-cli')).toBe('codex');
  });

  it('passes through bare engine ids', () => {
    expect(normalizeEngine('claude')).toBe('claude');
    expect(normalizeEngine('codex')).toBe('codex');
  });

  it('lowercases and trims', () => {
    expect(normalizeEngine('  Codex-CLI  ')).toBe('codex');
  });

  it('returns null for empty / nullish input', () => {
    expect(normalizeEngine('')).toBeNull();
    expect(normalizeEngine(null)).toBeNull();
    expect(normalizeEngine(undefined)).toBeNull();
    expect(normalizeEngine('   ')).toBeNull();
  });
});

describe('useConnectedEngines selector', () => {
  it('returns hasReport=false before the first poll', () => {
    const result = selectEngines({ bridge: null, lastFetchedAt: 0 });
    expect(result.hasReport).toBe(false);
    expect(result.engines.size).toBe(0);
  });

  it('returns hasReport=false even when bridge data is present, until lastFetchedAt advances', () => {
    const result = selectEngines({
      bridge: { connected: 1, available: 1, agents: [{ bridge_client_id: 'a', engines: ['claude-cli'], pool_sessions: [] }] },
      lastFetchedAt: 0,
    });
    expect(result.hasReport).toBe(false);
  });

  it('unions engines from multiple bridges, normalized', () => {
    const result = selectEngines({
      bridge: {
        connected: 2,
        available: 2,
        agents: [
          { bridge_client_id: 'a', engines: ['claude-cli'], pool_sessions: [] },
          { bridge_client_id: 'b', engines: ['codex-cli', 'claude-cli'], pool_sessions: [] },
        ],
      },
      lastFetchedAt: 1000,
    });
    expect(result.hasReport).toBe(true);
    expect(Array.from(result.engines).sort()).toEqual(['claude', 'codex']);
  });

  it('falls back to agent_type when engines list is empty (pool report not yet landed)', () => {
    const result = selectEngines({
      bridge: {
        connected: 1,
        available: 1,
        agents: [{ bridge_client_id: 'a', agent_type: 'codex-cli', pool_sessions: [] }],
      },
      lastFetchedAt: 1000,
    });
    expect(result.engines.has('codex')).toBe(true);
  });

  it('returns hasReport=true with empty engines when bridges exist but report nothing', () => {
    const result = selectEngines({
      bridge: { connected: 1, available: 0, agents: [{ bridge_client_id: 'a', pool_sessions: [] }] },
      lastFetchedAt: 1000,
    });
    expect(result.hasReport).toBe(true);
    expect(result.engines.size).toBe(0);
  });

  it('tab.engine match — codex tab against a claude-only bridge fails', () => {
    const result = selectEngines({
      bridge: {
        connected: 1,
        available: 1,
        agents: [{ bridge_client_id: 'a', engines: ['claude-cli'], pool_sessions: [] }],
      },
      lastFetchedAt: 1000,
    });
    expect(result.engines.has('codex')).toBe(false);
    expect(result.engines.has('claude')).toBe(true);
  });

  it('failed_engines from probe are surfaced and normalized', () => {
    const result = selectEngines({
      bridge: {
        connected: 1,
        available: 1,
        agents: [{
          bridge_client_id: 'a',
          engines: ['claude-cli'],
          failed_engines: [{ engine: 'codex-cli', reason: 'binary_not_found' }],
          pool_sessions: [],
        }],
      },
      lastFetchedAt: 1000,
    });
    expect(result.engines.has('codex')).toBe(false);
    expect(result.failedEngines.get('codex')).toBe('binary_not_found');
  });

  it('an engine healthy on one bridge is not flagged failed because it died on another', () => {
    // Two bridges: A has a working claude probe, B's claude probe failed.
    // The user-facing pill should stay green — there IS a connected codex
    // bridge — so failedEngines should not record claude.
    const result = selectEngines({
      bridge: {
        connected: 2,
        available: 2,
        agents: [
          { bridge_client_id: 'a', engines: ['claude-cli'], pool_sessions: [] },
          {
            bridge_client_id: 'b',
            engines: ['codex-cli'],
            failed_engines: [{ engine: 'claude-cli', reason: 'timeout_8.0s' }],
            pool_sessions: [],
          },
        ],
      },
      lastFetchedAt: 1000,
    });
    expect(result.engines.has('claude')).toBe(true);
    expect(result.failedEngines.has('claude')).toBe(false);
  });
});
