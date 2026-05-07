import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock readRecentPrompts so rotation order is deterministic and not
// coupled to localStorage / readRecentPrompts internals.
const { readRecentPrompts } = vi.hoisted(() => ({
  readRecentPrompts: vi.fn(),
}));
vi.mock('@features/prompts/lib/recentPrompts', () => ({ readRecentPrompts }));

import { useTickerSettingsStore } from '../../stores/tickerSettingsStore';
import { recentPromptsSource } from '../recentPromptsSource';
import type { TickerEvent } from '../../lib/sourceRegistry';

function seedPrompts(values: string[]) {
  readRecentPrompts.mockReturnValue(
    values.map((v, i) => ({
      id: `p${i}`,
      value: v,
      pinned: false,
      scope: 'test',
    })),
  );
}

describe('recentPromptsSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readRecentPrompts.mockReset();
    readRecentPrompts.mockReturnValue([]);
    useTickerSettingsStore.setState({ enabledSources: {}, sourceSettings: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes correct metadata', () => {
    expect(recentPromptsSource.id).toBe('recent-prompts');
    expect(recentPromptsSource.defaultEnabled).toBe(false);
  });

  it('emits nothing when there are no prompts in storage', () => {
    const emit = vi.fn<[TickerEvent], void>();
    const unsub = recentPromptsSource.subscribe(emit);
    vi.advanceTimersByTime(0);
    expect(emit).not.toHaveBeenCalled();
    unsub();
  });

  it('rotates through prompts with each tick', () => {
    seedPrompts(['alpha', 'beta', 'gamma']);
    useTickerSettingsStore
      .getState()
      .setSourceSettings('recent-prompts', { rotationMs: 1000 });

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = recentPromptsSource.subscribe(emit);

    vi.advanceTimersByTime(0);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].message).toContain('alpha');

    vi.advanceTimersByTime(1000);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1][0].message).toContain('beta');

    vi.advanceTimersByTime(1000);
    expect(emit.mock.calls[2][0].message).toContain('gamma');

    // Wraps back to first prompt.
    vi.advanceTimersByTime(1000);
    expect(emit.mock.calls[3][0].message).toContain('alpha');

    unsub();
  });

  it('truncates long prompts to maxLength', () => {
    const long = 'x'.repeat(200);
    seedPrompts([long]);
    useTickerSettingsStore
      .getState()
      .setSourceSettings('recent-prompts', { rotationMs: 100, maxLength: 20 });

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = recentPromptsSource.subscribe(emit);
    vi.advanceTimersByTime(0);

    const event = emit.mock.calls[0][0];
    // “…” + 19 x's + surrounding quotes ⇒ message length bounded
    expect(event.message).toContain('…');
    expect(event.message.length).toBeLessThan(30);
    unsub();
  });

  it('issues distinct event ids per rotation so the buffer keeps each one', () => {
    seedPrompts(['only']);
    useTickerSettingsStore
      .getState()
      .setSourceSettings('recent-prompts', { rotationMs: 100 });

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = recentPromptsSource.subscribe(emit);
    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(100);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0].id).not.toBe(emit.mock.calls[1][0].id);
    unsub();
  });

  it('unsubscribe stops further emissions', () => {
    seedPrompts(['a', 'b']);
    useTickerSettingsStore
      .getState()
      .setSourceSettings('recent-prompts', { rotationMs: 100 });

    const emit = vi.fn<[TickerEvent], void>();
    const unsub = recentPromptsSource.subscribe(emit);
    vi.advanceTimersByTime(0);
    expect(emit).toHaveBeenCalledTimes(1);

    unsub();
    vi.advanceTimersByTime(1000);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
