import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock both navigation surfaces before importing the SUT.
vi.mock('@features/workspace/lib/openPanel', () => ({
  navigateToPlan: vi.fn(),
}));

const openFloatingPanel = vi.fn();
vi.mock('@features/workspace/stores/workspaceStore', () => ({
  useWorkspaceStore: { getState: () => ({ openFloatingPanel }) },
}));

import { navigateToPlan } from '@features/workspace/lib/openPanel';

import { handleTickerEventClick } from '../clickThrough';
import type { TickerEvent } from '../sourceRegistry';

const baseEvent = (over: Partial<TickerEvent>): TickerEvent => ({
  id: 'e1',
  sourceId: 's',
  message: 'hello',
  timestamp: 0,
  ...over,
});

describe('handleTickerEventClick', () => {
  beforeEach(() => {
    vi.mocked(navigateToPlan).mockClear();
    openFloatingPanel.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when there is no actionable target', () => {
    expect(handleTickerEventClick(baseEvent({}))).toBe(false);
    expect(navigateToPlan).not.toHaveBeenCalled();
    expect(openFloatingPanel).not.toHaveBeenCalled();
  });

  it('refType=plan + refId routes to navigateToPlan', () => {
    expect(
      handleTickerEventClick(baseEvent({ refType: 'plan', refId: 'plan-7' })),
    ).toBe(true);
    expect(navigateToPlan).toHaveBeenCalledWith('plan-7');
    expect(openFloatingPanel).not.toHaveBeenCalled();
  });

  it('refType=plan with no refId still falls through to openFloatingPanel(plans)', () => {
    expect(handleTickerEventClick(baseEvent({ refType: 'plan' }))).toBe(true);
    expect(navigateToPlan).not.toHaveBeenCalled();
    expect(openFloatingPanel).toHaveBeenCalledWith('plans');
  });

  it('refType=generation opens generation-history panel', () => {
    expect(
      handleTickerEventClick(
        baseEvent({ refType: 'generation', refId: '42' }),
      ),
    ).toBe(true);
    expect(openFloatingPanel).toHaveBeenCalledWith('generation-history');
  });

  it('refType=document opens plans panel', () => {
    expect(handleTickerEventClick(baseEvent({ refType: 'document' }))).toBe(true);
    expect(openFloatingPanel).toHaveBeenCalledWith('plans');
  });

  it('unknown refType returns false', () => {
    expect(handleTickerEventClick(baseEvent({ refType: 'unknown' }))).toBe(false);
    expect(navigateToPlan).not.toHaveBeenCalled();
    expect(openFloatingPanel).not.toHaveBeenCalled();
  });

  it('href external opens window.open', () => {
    const open = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null as unknown as Window);
    expect(
      handleTickerEventClick(baseEvent({ href: 'https://example.com' })),
    ).toBe(true);
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('href SPA-relative pushes history state', () => {
    const push = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => undefined);
    const dispatch = vi
      .spyOn(window, 'dispatchEvent')
      .mockImplementation(() => true);
    expect(handleTickerEventClick(baseEvent({ href: '/plans/7' }))).toBe(true);
    expect(push).toHaveBeenCalledWith({}, '', '/plans/7');
    expect(dispatch).toHaveBeenCalled();
  });

  it('href takes precedence over refType', () => {
    const open = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null as unknown as Window);
    handleTickerEventClick(
      baseEvent({ href: 'https://example.com', refType: 'plan', refId: 'p' }),
    );
    expect(open).toHaveBeenCalled();
    expect(navigateToPlan).not.toHaveBeenCalled();
  });
});
