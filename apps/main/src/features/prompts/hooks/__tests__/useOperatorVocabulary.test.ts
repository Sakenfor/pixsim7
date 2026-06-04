import { describe, expect, it } from 'vitest';

import {
  resolveOperatorContract,
  type OperatorVocabulary,
} from '../useOperatorVocabulary';

const VOCAB: OperatorVocabulary = {
  swapTargets: ['=', '<', '>', ':', '?'],
  maxRunLength: 12,
  contexts: [
    { lineKind: 'chain', maxRunLength: 12 },
    { lineKind: 'colon', swapTargets: [':', '=', '>'], maxRunLength: 1 },
    { lineKind: 'angle_bracket', maxRunLength: 1 },
  ],
};

describe('resolveOperatorContract', () => {
  it('narrows both fields when the context overrides them', () => {
    expect(resolveOperatorContract(VOCAB, 'colon')).toEqual({
      swapTargets: [':', '=', '>'],
      maxRunLength: 1,
    });
  });

  it('inherits the omitted field from the global default', () => {
    // angle_bracket overrides only max_run_length → swapTargets inherited.
    expect(resolveOperatorContract(VOCAB, 'angle_bracket')).toEqual({
      swapTargets: ['=', '<', '>', ':', '?'],
      maxRunLength: 1,
    });
  });

  it('falls back to the global default for an unlisted line kind', () => {
    expect(resolveOperatorContract(VOCAB, 'freestanding')).toEqual({
      swapTargets: ['=', '<', '>', ':', '?'],
      maxRunLength: 12,
    });
  });

  it('falls back to the global default when line kind is undefined', () => {
    expect(resolveOperatorContract(VOCAB, undefined)).toEqual({
      swapTargets: ['=', '<', '>', ':', '?'],
      maxRunLength: 12,
    });
  });
});
