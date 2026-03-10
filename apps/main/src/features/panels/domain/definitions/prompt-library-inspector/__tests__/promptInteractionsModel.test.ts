import type { PromptBlockCandidate } from '@pixsim7/shared.types/prompt';
import { describe, expect, it } from 'vitest';

import type {
  CandidateWithPrimitiveMatch,
  PrimitiveMatch,
} from '@features/prompts/lib/parsePrimitiveMatch';

import {
  filterPrimitiveMatchesByScore,
  mapMatchesToSyntheticActionBlocks,
  mapPrimitiveMatchesForTable,
  summarizeInteractionData,
} from '../promptInteractionsModel';

function makeMatch(
  candidate: PromptBlockCandidate,
  candidateIndex: number,
  overrides: Partial<PrimitiveMatch> = {},
): CandidateWithPrimitiveMatch {
  return {
    candidate,
    candidateIndex,
    match: {
      block_id: `block_${candidateIndex}`,
      score: 0.5,
      confidence: 0.5,
      ...overrides,
    },
  };
}

describe('promptInteractionsModel', () => {
  it('filters primitive matches by minimum score threshold', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'candidate one', role: 'action' },
      { text: 'candidate two', role: 'setting' },
      { text: 'candidate three', role: 'style' },
    ];
    const matches = [
      makeMatch(candidates[0], 0, { score: 0.21 }),
      makeMatch(candidates[1], 1, { score: 0.45 }),
      makeMatch(candidates[2], 2, { score: 0.9 }),
    ];

    const filtered = filterPrimitiveMatchesByScore(matches, 0.45);
    expect(filtered.map((item) => item.match.block_id)).toEqual([
      'block_1',
      'block_2',
    ]);
  });

  it('maps primitive matches into table rows with role/category and op metadata', () => {
    const primary = makeMatch(
      { text: 'walk forward', role: 'action' },
      0,
      {
        block_id: 'motion.walk',
        score: 0.88,
        role: 'action',
        category: 'movement',
        overlap_tokens: ['walk', 'forward'],
        op: { op_id: 'motion', signature_id: 'motion.v1' },
      },
    );
    const fallback = makeMatch(
      { text: 'misty valley', role: 'setting', category: 'atmosphere' },
      1,
      {
        block_id: 'scene.mist',
        score: 0.61,
        role: undefined,
        category: undefined,
      },
    );

    const rows = mapPrimitiveMatchesForTable([primary, fallback]);

    expect(rows[0]).toEqual({
      candidateIndex: 0,
      candidateText: 'walk forward',
      blockId: 'motion.walk',
      score: 0.88,
      role: 'action',
      category: 'movement',
      overlapTokens: ['walk', 'forward'],
      opId: 'motion',
      signatureId: 'motion.v1',
    });

    expect(rows[1].role).toBe('setting');
    expect(rows[1].category).toBe('atmosphere');
    expect(rows[1].opId).toBeUndefined();
    expect(rows[1].signatureId).toBeUndefined();
  });

  it('summarizes candidate/match/block counts', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'hero runs', role: 'action' },
      { text: 'city at night', role: 'setting' },
      { text: 'camera tilt', role: 'action' },
    ];
    const primitiveMatches = [
      makeMatch(candidates[0], 0, { score: 0.82 }),
      makeMatch(candidates[1], 1, { score: 0.39 }),
    ];
    const filteredMatches = filterPrimitiveMatchesByScore(primitiveMatches, 0.45);
    const derivedBlocks = [
      { role: 'action', text: 'hero runs' },
      { role: 'setting', text: 'city at night' },
    ];

    const summary = summarizeInteractionData({
      candidates,
      primitiveMatches,
      filteredMatches,
      derivedBlocks,
    });

    expect(summary).toEqual({
      candidateCount: 3,
      roleGroupCount: 2,
      primitiveMatchCount: 2,
      filteredMatchCount: 1,
      derivedBlockCount: 2,
    });
  });

  it('maps filtered matches into synthetic action blocks with sequence links', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'intro scene', role: 'setting' },
      { text: 'hero jumps', role: 'action' },
    ];
    const matches = [
      makeMatch(candidates[0], 0, { block_id: 'scene.intro', score: 0.72 }),
      makeMatch(candidates[1], 1, { block_id: 'action.jump', score: 0.91 }),
    ];

    const actionBlocks = mapMatchesToSyntheticActionBlocks(matches);

    expect(actionBlocks).toHaveLength(2);
    expect(actionBlocks[0].block_id).toBe('scene.intro@0');
    expect(actionBlocks[0].compatible_next).toEqual(['action.jump@1']);
    expect(actionBlocks[1].compatible_prev).toEqual(['scene.intro@0']);
    expect(actionBlocks[1].tags).toContain('primitive:action.jump');
  });
});
