import { describe, expect, it } from 'vitest';

import { applyTransform } from '../variableTransforms';

// Mirrors backend test_variable_transforms.py — keep the parity contract.
describe('variableTransforms / spaced', () => {
  it('spaces ASCII by character', () => {
    expect(applyTransform('spaced:__', 'cat')).toBe('c__a__t');
    expect(applyTransform('spaced', 'cat')).toBe('c a t');
  });

  it('splits astral characters by code point, not UTF-16 unit (emoji parity)', () => {
    // `🎬` is a surrogate pair; splitting by code unit would insert the separator
    // between its halves (mojibake) and diverge from Python's code-point join.
    expect(applyTransform('spaced:-', 'a😀b')).toBe('a-😀-b');
    expect(applyTransform('spaced:-', '🇺🇸')).toBe('🇺-🇸');
  });
});

describe('variableTransforms / applyTransform safety', () => {
  it('no-ops on prototype-chain keys instead of throwing/mis-running', () => {
    // `__proto__` resolves to Object.prototype via a raw bracket lookup; the
    // own-property guard must make it a clean no-op (matches Python `.get()`).
    expect(applyTransform('__proto__', 'cat')).toBe('cat');
    expect(applyTransform('constructor', 'cat')).toBe('cat');
    expect(applyTransform('hasOwnProperty', 'cat')).toBe('cat');
  });

  it('no-ops on empty/unknown specs', () => {
    expect(applyTransform('', 'cat')).toBe('cat');
    expect(applyTransform(null, 'cat')).toBe('cat');
    expect(applyTransform('bogus', 'cat')).toBe('cat');
  });
});
