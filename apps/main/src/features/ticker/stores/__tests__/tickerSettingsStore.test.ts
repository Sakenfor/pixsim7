import { beforeEach, describe, expect, it } from 'vitest';

import {
  getSourceSettings,
  isSourceEnabled,
  useTickerSettingsStore,
} from '../tickerSettingsStore';

describe('tickerSettingsStore', () => {
  beforeEach(() => {
    useTickerSettingsStore.setState({
      enabledSources: {},
      sourceSettings: {},
    });
  });

  describe('isSourceEnabled', () => {
    it('falls back to defaultEnabled when no explicit setting', () => {
      expect(
        isSourceEnabled({ enabledSources: {} }, { id: 'x', defaultEnabled: true }),
      ).toBe(true);
      expect(
        isSourceEnabled({ enabledSources: {} }, { id: 'x', defaultEnabled: false }),
      ).toBe(false);
      expect(
        isSourceEnabled({ enabledSources: {} }, { id: 'x' }),
      ).toBe(false);
    });

    it('explicit setting wins over defaultEnabled', () => {
      expect(
        isSourceEnabled(
          { enabledSources: { x: false } },
          { id: 'x', defaultEnabled: true },
        ),
      ).toBe(false);
      expect(
        isSourceEnabled(
          { enabledSources: { x: true } },
          { id: 'x', defaultEnabled: false },
        ),
      ).toBe(true);
    });
  });

  describe('actions', () => {
    it('setSourceEnabled persists per-source flag', () => {
      useTickerSettingsStore.getState().setSourceEnabled('a', true);
      useTickerSettingsStore.getState().setSourceEnabled('b', false);
      expect(useTickerSettingsStore.getState().enabledSources).toEqual({
        a: true,
        b: false,
      });
    });

    it('toggleSourceEnabled flips an explicit value', () => {
      useTickerSettingsStore.getState().setSourceEnabled('a', true);
      useTickerSettingsStore.getState().toggleSourceEnabled('a');
      expect(useTickerSettingsStore.getState().enabledSources.a).toBe(false);
    });

    it('toggleSourceEnabled uses fallback when no explicit value yet', () => {
      // No prior value, fallback=true → next is !true = false
      useTickerSettingsStore.getState().toggleSourceEnabled('a', true);
      expect(useTickerSettingsStore.getState().enabledSources.a).toBe(false);

      useTickerSettingsStore.setState({ enabledSources: {}, sourceSettings: {} });
      // No prior value, fallback=false → next is !false = true
      useTickerSettingsStore.getState().toggleSourceEnabled('a', false);
      expect(useTickerSettingsStore.getState().enabledSources.a).toBe(true);
    });

    it('setSourceSettings stores per-source blob', () => {
      useTickerSettingsStore.getState().setSourceSettings('a', { foo: 1 });
      expect(useTickerSettingsStore.getState().sourceSettings.a).toEqual({ foo: 1 });
    });
  });

  describe('getSourceSettings', () => {
    it('merges stored over defaults', () => {
      const merged = getSourceSettings(
        { sourceSettings: { a: { foo: 2 } } },
        'a',
        { foo: 1, bar: 'x' },
      );
      expect(merged).toEqual({ foo: 2, bar: 'x' });
    });

    it('returns defaults when nothing stored', () => {
      const merged = getSourceSettings({ sourceSettings: {} }, 'missing', { x: 1 });
      expect(merged).toEqual({ x: 1 });
    });

    it('returns defaults when stored value is non-object (corrupt)', () => {
      const merged = getSourceSettings(
        { sourceSettings: { a: 'corrupt' as unknown } },
        'a',
        { x: 1 },
      );
      expect(merged).toEqual({ x: 1 });
    });
  });
});
