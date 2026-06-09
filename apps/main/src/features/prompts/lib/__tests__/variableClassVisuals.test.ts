import { describe, expect, it } from 'vitest';

import { getVariableClassVisual } from '../variableClassVisuals';

describe('getVariableClassVisual', () => {
  it('returns the explicit colour/icon for a role-less class (GOAL)', () => {
    expect(getVariableClassVisual('GOAL')).toEqual({
      icon: 'target',
      dotClass: 'bg-yellow-500',
      colorName: 'yellow',
      hex: '#eab308',
    });
  });

  it('derives a visual from the linked composition role (ACTOR -> character)', () => {
    const visual = getVariableClassVisual('ACTOR1_DETAILS');
    expect(visual).not.toBeNull();
    expect(visual!.icon).toBeTruthy();
    expect(visual!.dotClass).toMatch(/^bg-/);
    // ACTOR links to entities:main_character (blue in the role vocab).
    expect(visual!.colorName).toBe('blue');
  });

  it('honours an explicit icon override while keeping the role colour (STYLE)', () => {
    const visual = getVariableClassVisual('STYLE');
    expect(visual!.icon).toBe('palette');
  });

  it('returns null for a non-default class', () => {
    expect(getVariableClassVisual('WIDGET1')).toBeNull();
  });
});
