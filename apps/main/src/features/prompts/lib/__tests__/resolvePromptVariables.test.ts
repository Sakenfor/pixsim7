import { describe, expect, it } from 'vitest';

import { buildVariableValueMap, resolvePromptVariables } from '../resolvePromptVariables';

describe('resolvePromptVariables', () => {
  it('expands only names with values; bare symbols stay literal', () => {
    expect(
      resolvePromptVariables('ACTOR1 ==> kisses ACTOR2. ACTOR1_DETAILS', {
        ACTOR1_DETAILS: 'tall woman, 30s',
      }),
    ).toBe('ACTOR1 ==> kisses ACTOR2. tall woman, 30s');
  });

  it('matches whole tokens only', () => {
    expect(resolvePromptVariables('ACTOR1 ACTOR1_DETAILS FOO_ACTOR1', { ACTOR1: 'X' })).toBe(
      'X ACTOR1_DETAILS FOO_ACTOR1',
    );
  });

  it('expands recursively', () => {
    expect(
      resolvePromptVariables('ACTOR1_FULL', {
        ACTOR1_FULL: 'ACTOR1_DETAILS, ACTOR1_POSE',
        ACTOR1_DETAILS: 'tall woman',
        ACTOR1_POSE: 'standing',
      }),
    ).toBe('tall woman, standing');
  });

  it('leaves cycles symbolic', () => {
    expect(resolvePromptVariables('A', { A: 'B', B: 'A' })).toBe('A');
    expect(resolvePromptVariables('A', { A: 'x A' })).toBe('x A');
  });

  it('honours the backslash escape', () => {
    expect(resolvePromptVariables('\\ACTOR1 and ACTOR1', { ACTOR1: 'the lead' })).toBe(
      'ACTOR1 and the lead',
    );
  });

  it('returns text unchanged with no usable values', () => {
    expect(resolvePromptVariables('ACTOR1 ==> ACTOR2', {})).toBe('ACTOR1 ==> ACTOR2');
    expect(resolvePromptVariables('ACTOR1', { ACTOR1: '' })).toBe('ACTOR1');
  });
});

describe('buildVariableValueMap', () => {
  it('keeps only entries with a value, uppercased', () => {
    expect(
      buildVariableValueMap([
        { name: 'actor1', value: 'the lead' },
        { name: 'GOAL' },
        { name: 'SCENE', value: '' },
      ]),
    ).toEqual({ ACTOR1: 'the lead' });
  });
});
