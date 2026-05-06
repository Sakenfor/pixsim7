import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetTickerRegistryForTest,
  getTickerSource,
  listTickerSources,
  registerTickerSource,
  subscribeToTickerRegistry,
  unregisterTickerSource,
  type TickerSource,
} from '../sourceRegistry';

const noopSource = (id: string, overrides: Partial<TickerSource> = {}): TickerSource => ({
  id,
  label: id,
  subscribe: () => () => undefined,
  ...overrides,
});

describe('ticker sourceRegistry', () => {
  afterEach(() => {
    __resetTickerRegistryForTest();
  });

  it('registers and lists sources in insertion order', () => {
    registerTickerSource(noopSource('a'));
    registerTickerSource(noopSource('b'));

    const sources = listTickerSources();
    expect(sources.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('getTickerSource returns the registered source', () => {
    const src = noopSource('a', { label: 'Alpha' });
    registerTickerSource(src);
    expect(getTickerSource('a')?.label).toBe('Alpha');
    expect(getTickerSource('missing')).toBeUndefined();
  });

  it('replaces an existing source with the same id and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerTickerSource(noopSource('a', { label: 'first' }));
    registerTickerSource(noopSource('a', { label: 'second' }));

    expect(getTickerSource('a')?.label).toBe('second');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Source "a" already registered'),
    );
    warn.mockRestore();
  });

  it('does not re-register or warn for the same source ref', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const src = noopSource('a');
    registerTickerSource(src);
    registerTickerSource(src);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('unregisterTickerSource removes the source', () => {
    registerTickerSource(noopSource('a'));
    expect(unregisterTickerSource('a')).toBe(true);
    expect(getTickerSource('a')).toBeUndefined();
    expect(unregisterTickerSource('a')).toBe(false);
  });

  it('notifies subscribers on register, replace, and unregister', () => {
    const cb = vi.fn();
    const unsub = subscribeToTickerRegistry(cb);

    registerTickerSource(noopSource('a'));
    registerTickerSource(noopSource('a', { label: 'x' })); // replace
    unregisterTickerSource('a');

    expect(cb).toHaveBeenCalledTimes(3);
    unsub();

    registerTickerSource(noopSource('b'));
    expect(cb).toHaveBeenCalledTimes(3); // unsubscribed, no further calls
  });
});
