import { useCallback, useEffect, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api/client';

// Interim hand-typed shape for GET /api/v1/dev/plans/active-agents.
// No orval/OpenAPI codegen is active for this surface; replace with the
// generated type if/when codegen covers dev plans. Keep in sync with
// ActiveAgentsResponse in pixsim7/backend/main/api/v1/plans/routes_agent.py.
export interface ActiveAgentEntry {
  participant_id: string;
  role: string;
  agent_id?: string | null;
  agent_type?: string | null;
  run_id?: string | null;
  session_id?: string | null;
  user_id?: number | null;
  checkpoint_id?: string | null;
  claimed: boolean;
  last_action?: string | null;
  last_heartbeat_at?: string | null;
  heartbeat_age_seconds: number;
}

export interface ActivePlanGroup {
  plan_id: string;
  plan_title?: string | null;
  active_count: number;
  agents: ActiveAgentEntry[];
}

export interface ActiveAgentsResponse {
  generated_at: string;
  total_active: number;
  plans: ActivePlanGroup[];
}

const POLL_MS = 30_000;

export interface ActiveAgentsRoster {
  data: ActiveAgentsResponse | null;
  loading: boolean;
  error: string | null;
  totalActive: number;
  refresh: () => void;
}

/**
 * Polls the cross-plan active-agent roster. Single source for both the
 * plans-list header badge and the roster section so there is one fetch
 * loop, not two. Single-flight; light 30s poll plus manual refresh.
 */
export function useActiveAgentsRoster(): ActiveAgentsRoster {
  const [data, setData] = useState<ActiveAgentsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      const res = await pixsimClient.get<ActiveAgentsResponse>(
        '/dev/plans/active-agents',
      );
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load active agents');
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return {
    data,
    loading,
    error,
    totalActive: data?.total_active ?? 0,
    refresh,
  };
}

export function ageLabel(seconds: number): string {
  if (seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
