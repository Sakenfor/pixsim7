import { describe, expect, it } from 'vitest';

import {
  buildVariableTransformMap,
  buildVariableValueMap,
  resolvePromptVariables,
} from '../resolvePromptVariables';

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

// Mirrors backend test_variable_resolver.py transform cases (parity contract).
describe('resolvePromptVariables transforms', () => {
  it('applies a transform to the resolved value', () => {
    expect(resolvePromptVariables('ACTOR1', { ACTOR1: 'cat' }, { ACTOR1: 'spaced:__' })).toBe(
      'c__a__t',
    );
  });

  it('defaults the spaced separator to a single space', () => {
    expect(resolvePromptVariables('ACTOR1', { ACTOR1: 'cat' }, { ACTOR1: 'spaced' })).toBe(
      'c a t',
    );
  });

  it('applies the transform after recursive expansion', () => {
    expect(
      resolvePromptVariables(
        'ACTOR1_FULL',
        { ACTOR1_FULL: 'ab ACTOR1_X', ACTOR1_X: 'cd' },
        { ACTOR1_FULL: 'upper' },
      ),
    ).toBe('AB CD');
  });

  it('treats an unknown transform as a no-op', () => {
    expect(resolvePromptVariables('ACTOR1', { ACTOR1: 'cat' }, { ACTOR1: 'nope' })).toBe('cat');
  });

  it('does not apply a transform when the variable has no value', () => {
    expect(resolvePromptVariables('ACTOR1', {}, { ACTOR1: 'upper' })).toBe('ACTOR1');
  });
});

describe('buildVariableTransformMap', () => {
  it('keeps transforms only for valued entries, uppercased', () => {
    expect(
      buildVariableTransformMap([
        { name: 'actor1', value: 'cat', transform: 'spaced:__' },
        { name: 'GOAL', transform: 'upper' }, // no value → omitted
        { name: 'SCENE', value: 'x' }, // no transform → omitted
      ]),
    ).toEqual({ ACTOR1: 'spaced:__' });
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
