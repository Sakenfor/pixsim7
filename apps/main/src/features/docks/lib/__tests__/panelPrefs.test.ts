import { describe, expect, it } from 'vitest';

import { filterPanelsByPrefs, isPanelEnabledByPrefs } from '../panelPrefs';

const PANELS = [
  { id: 'a', enabledByDefault: true },
  { id: 'b', enabledByDefault: false },
  { id: 'c' },
] as const;

describe('panelPrefs', () => {
  it('uses enabledByDefault when no prefs exist', () => {
    expect(filterPanelsByPrefs(PANELS, undefined).map((panel) => panel.id)).toEqual(['a', 'c']);
  });

  it('prefers explicit prefs over defaults', () => {
    expect(
      filterPanelsByPrefs(PANELS, {
        a: false,
        b: true,
      }).map((panel) => panel.id),
    ).toEqual(['b', 'c']);
  });

  it('returns false only when panel is explicitly disabled or default-disabled', () => {
    expect(isPanelEnabledByPrefs({ id: 'x', enabledByDefault: true }, {})).toBe(true);
    expect(isPanelEnabledByPrefs({ id: 'x', enabledByDefault: false }, {})).toBe(false);
    expect(isPanelEnabledByPrefs({ id: 'x', enabledByDefault: false }, { x: true })).toBe(true);
    expect(isPanelEnabledByPrefs({ id: 'x', enabledByDefault: true }, { x: false })).toBe(false);
  });
});
