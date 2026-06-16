/**
 * Step 3 of plan-participant-liveness/unify-tab-plan-categorization:
 * the per-tab multi-plan header chip set.
 *
 * Covers useTabPlanClaims (fetch / reset-on-tab-change / best-effort) and
 * ContextBar's chip-set vs single-chip-fallback rendering.
 */
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listTabPlanClaims: vi.fn() }));
vi.mock('../chatTabsApi', () => ({
  listTabPlanClaims: api.listTabPlanClaims,
}));

import type { ChatTab } from '../assistantChatStore';
import { tabPrimaryPlanId } from '../assistantChatStore';
import type { TabPlanClaim } from '../chatTabsApi';
import { ContextBar } from '../ContextBar';
import { useTabPlanClaims } from '../useTabPlanClaims';

afterEach(() => {
  vi.clearAllMocks();
});

function claim(over: Partial<TabPlanClaim> = {}): TabPlanClaim {
  return {
    planId: 'plan-a',
    planTitle: 'Plan A',
    checkpointId: null,
    claimedAt: '2026-05-18T00:00:00Z',
    primary: false,
    ...over,
  };
}

function tabFixture(over: Partial<ChatTab> = {}): ChatTab {
  return {
    id: 'tab-1',
    label: 'T',
    sessionId: 's1',
    profileId: null,
    engine: 'claude',
    modelOverride: null,
    reasoningEffortOverride: null,
    usePersona: false,
    customInstructions: '',
    focusAreas: [],
    injectToken: false,
    planId: null,
    createdAt: '2026-05-18T00:00:00Z',
    draft: null,
    ...over,
  };
}

describe('tabPrimaryPlanId (sidebar placement seam)', () => {
  it('prefers the server-derived primaryPlanId (covers self-assigned-only tabs)', () => {
    expect(tabPrimaryPlanId({ planId: null, primaryPlanId: 'plan-claim' })).toBe(
      'plan-claim',
    );
    // Manual binding still wins via server-derived value.
    expect(tabPrimaryPlanId({ planId: 'plan-a', primaryPlanId: 'plan-a' })).toBe(
      'plan-a',
    );
  });

  it('falls back to planId for local/optimistic tabs (no derived value yet)', () => {
    expect(tabPrimaryPlanId({ planId: 'plan-a', primaryPlanId: undefined })).toBe(
      'plan-a',
    );
  });

  it('is null when neither is set (ungrouped)', () => {
    expect(tabPrimaryPlanId({ planId: null, primaryPlanId: null })).toBeNull();
    expect(tabPrimaryPlanId({ planId: null })).toBeNull();
  });
});

describe('useTabPlanClaims', () => {
  it('returns [] and does not fetch when tabId is null', () => {
    const { result } = renderHook(() => useTabPlanClaims(null, null, null));
    expect(result.current).toEqual([]);
    expect(api.listTabPlanClaims).not.toHaveBeenCalled();
  });

  it('does not fetch for an unbound tab (no plan + no session) — avoids 404 on new tabs', () => {
    const { result } = renderHook(() => useTabPlanClaims('tab-new', null, null));
    expect(result.current).toEqual([]);
    expect(api.listTabPlanClaims).not.toHaveBeenCalled();
  });

  it('does not fetch while the tab is not yet persisted, then fetches once it is', async () => {
    api.listTabPlanClaims.mockResolvedValue({
      tabId: 'tab-1',
      sessionId: 's1',
      primaryPlanId: 'plan-a',
      plans: [claim({ primary: true })],
    });
    const { result, rerender } = renderHook(
      ({ persisted }: { persisted: boolean }) =>
        useTabPlanClaims('tab-1', 'plan-a', 's1', persisted),
      { initialProps: { persisted: false } },
    );
    // In-flight create: bound tab, but the server has no row yet → no request.
    expect(result.current).toEqual([]);
    expect(api.listTabPlanClaims).not.toHaveBeenCalled();
    // Create confirmed → fetch fires.
    rerender({ persisted: true });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(api.listTabPlanClaims).toHaveBeenCalledWith('tab-1');
  });

  it('fetches and exposes the session claim list', async () => {
    api.listTabPlanClaims.mockResolvedValue({
      tabId: 'tab-1',
      sessionId: 's1',
      primaryPlanId: 'plan-a',
      plans: [claim({ primary: true }), claim({ planId: 'plan-b', planTitle: 'Plan B' })],
    });
    const { result } = renderHook(() => useTabPlanClaims('tab-1', 'plan-a', 's1'));
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((p) => p.planId)).toEqual(['plan-a', 'plan-b']);
    expect(api.listTabPlanClaims).toHaveBeenCalledWith('tab-1');
  });

  it('swallows fetch errors (header chips are non-critical)', async () => {
    api.listTabPlanClaims.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTabPlanClaims('tab-1', null, 's1'));
    await waitFor(() => expect(api.listTabPlanClaims).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it('clears chips when the active tab changes', async () => {
    api.listTabPlanClaims.mockResolvedValue({
      tabId: 'tab-1',
      sessionId: 's1',
      primaryPlanId: 'plan-a',
      plans: [claim({ primary: true })],
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useTabPlanClaims(id, null, 's1'),
      { initialProps: { id: 'tab-1' } },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));
    rerender({ id: 'tab-2' });
    // Previous tab's chips dropped immediately (no flash on the new tab).
    expect(result.current).toEqual([]);
    await waitFor(() =>
      expect(api.listTabPlanClaims).toHaveBeenLastCalledWith('tab-2'),
    );
  });
});

describe('ContextBar plan chips', () => {
  it('renders a chip per plan, primary first, when claims are loaded', () => {
    const claims = [
      claim({ planId: 'plan-a', planTitle: 'Plan A', primary: true }),
      claim({ planId: 'plan-b', planTitle: 'Plan B' }),
    ];
    render(
      <ContextBar
        tab={tabFixture({ planId: 'plan-a' })}
        profile={null}
        poolSession={null}
        planClaims={claims}
      />,
    );
    const a = screen.getByText('Plan A');
    const b = screen.getByText('Plan B');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    // Primary first in DOM order.
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Primary chip emphasized; secondary dimmed (label's parent = chip span).
    expect(a.parentElement?.className).toContain('text-signal-success');
    expect(a.parentElement?.className).not.toContain('text-signal-success/60');
    expect(b.parentElement?.className).toContain('text-signal-success/60');
  });

  it('falls back to a single planId chip when no claims are loaded', () => {
    render(
      <ContextBar
        tab={tabFixture({ planId: 'plan-x' })}
        profile={null}
        poolSession={null}
        planClaims={[]}
      />,
    );
    expect(screen.getByText('plan-x')).toBeTruthy();
  });

  it('shows no plan chip when there is neither a binding nor claims', () => {
    render(
      <ContextBar
        tab={tabFixture({ planId: null })}
        profile={null}
        poolSession={null}
        planClaims={[]}
      />,
    );
    expect(screen.queryByText(/plan/i)).toBeNull();
  });
});
