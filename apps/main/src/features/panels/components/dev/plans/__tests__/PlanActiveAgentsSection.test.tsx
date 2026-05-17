import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiState = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@lib/api/client', () => ({ pixsimClient: { get: apiState.get } }));

import { PlanActiveAgentsSection } from '../PlanActiveAgentsSection';
import {
  ageLabel,
  useActiveAgentsRoster,
  type ActiveAgentsRoster,
  type ActiveAgentsResponse,
} from '../useActiveAgentsRoster';

describe('ageLabel', () => {
  it('formats unknown / seconds / minutes / hours', () => {
    expect(ageLabel(-1)).toBe('—');
    expect(ageLabel(5)).toBe('5s ago');
    expect(ageLabel(125)).toBe('2m ago');
    expect(ageLabel(7200)).toBe('2h ago');
  });
});

function rosterFixture(over: Partial<ActiveAgentsRoster> = {}): ActiveAgentsRoster {
  const data: ActiveAgentsResponse = {
    generated_at: '2026-05-17T00:00:00Z',
    total_active: 2,
    plans: [
      {
        plan_id: 'plan-a',
        plan_title: 'Plan A',
        active_count: 2,
        agents: [
          {
            participant_id: 'p1',
            role: 'builder',
            agent_id: 'agent-1',
            agent_type: 'claude',
            run_id: 'run-1',
            session_id: null,
            user_id: null,
            checkpoint_id: 'cp1',
            claimed: true,
            last_action: 'claim',
            last_heartbeat_at: '2026-05-17T00:00:00Z',
            heartbeat_age_seconds: 5,
          },
          {
            participant_id: 'p2',
            role: 'reviewer',
            agent_id: 'agent-2',
            agent_type: 'codex',
            run_id: 'run-2',
            session_id: null,
            user_id: null,
            checkpoint_id: null,
            claimed: false,
            last_action: 'review',
            last_heartbeat_at: '2026-05-17T00:00:00Z',
            heartbeat_age_seconds: 90,
          },
        ],
      },
    ],
  };
  return {
    data,
    loading: false,
    error: null,
    totalActive: 2,
    refresh: vi.fn(),
    ...over,
  };
}

describe('PlanActiveAgentsSection', () => {
  it('renders the header label and total badge', () => {
    render(<PlanActiveAgentsSection roster={rosterFixture()} />);
    expect(screen.getByText('Active agents')).toBeTruthy();
    // Total badge + per-plan count badge both read "2".
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Plan A')).toBeTruthy();
    expect(screen.getByText('▶ cp1')).toBeTruthy();
  });

  it('surfaces an error message', () => {
    render(
      <PlanActiveAgentsSection
        roster={rosterFixture({ data: null, error: 'boom', totalActive: 0 })}
      />,
    );
    expect(screen.getByText('boom')).toBeTruthy();
  });
});

describe('useActiveAgentsRoster', () => {
  beforeEach(() => {
    apiState.get.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the roster on mount', async () => {
    apiState.get.mockResolvedValue({
      generated_at: 'now',
      total_active: 3,
      plans: [],
    } satisfies ActiveAgentsResponse);

    const { result } = renderHook(() => useActiveAgentsRoster());

    await waitFor(() => expect(result.current.totalActive).toBe(3));
    expect(apiState.get).toHaveBeenCalledWith('/dev/plans/active-agents');
  });

  it('captures fetch errors', async () => {
    apiState.get.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useActiveAgentsRoster());

    await waitFor(() => expect(result.current.error).toBe('network down'));
    expect(result.current.totalActive).toBe(0);
  });
});
