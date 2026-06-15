import { describe, expect, it } from 'vitest';

import { extractInlineVarValues } from '../inlineVarValues';
import { resolvePromptVariables } from '../resolvePromptVariables';

describe('extractInlineVarValues', () => {
  it('binds a var-call and collapses NAME(value) -> NAME', () => {
    const { values, collapsed } = extractInlineVarValues('ACTOR2_HIP < MODUS_OPERANDI (TEASE) < DELIBERATE');
    expect(values).toEqual({ MODUS_OPERANDI: 'TEASE' });
    expect(collapsed).toBe('ACTOR2_HIP < MODUS_OPERANDI < DELIBERATE');
  });

  it('collapses an attached var-call', () => {
    const { values, collapsed } = extractInlineVarValues('MOOD(happy) = body');
    expect(values).toEqual({ MOOD: 'happy' });
    expect(collapsed).toBe('MOOD = body');
  });

  it('does NOT bind incidental prose parens (no chain)', () => {
    const { values, collapsed } = extractInlineVarValues('shot on RED (camera)');
    expect(values).toEqual({});
    expect(collapsed).toBe('shot on RED (camera)');
  });

  it('does NOT bind a bare value group', () => {
    const { values, collapsed } = extractInlineVarValues('X = (A < B)');
    expect(values).toEqual({});
    expect(collapsed).toBe('X = (A < B)');
  });

  it('first occurrence wins', () => {
    const { values } = extractInlineVarValues('MOOD(happy) = x\nMOOD(sad) = y');
    expect(values).toEqual({ MOOD: 'happy' });
  });

  it('inline wins over stored when fed to the resolver', () => {
    const { values, collapsed } = extractInlineVarValues('MOOD(calm) = body');
    const merged = { MOOD: 'stored-value', ...values };
    expect(resolvePromptVariables(collapsed, merged)).toBe('calm = body');
  });

  it('is identity with no parens', () => {
    const { values, collapsed } = extractInlineVarValues('ACTOR1 = ACTOR2');
    expect(values).toEqual({});
    expect(collapsed).toBe('ACTOR1 = ACTOR2');
  });
});
