import { describe, expect, it } from 'vitest';

import type { PromptBlockCandidate } from '../../types';
import {
  parsePrimitiveProjection,
  parsePrimitiveMatch,
  extractPrimitiveMatches,
  hasPositionData,
} from '../parsePrimitiveMatch';

describe('parsePrimitiveProjection', () => {
  it('returns null when candidate has no primitive_projection', () => {
    expect(parsePrimitiveProjection(null)).toBeNull();
    expect(parsePrimitiveProjection(undefined)).toBeNull();
    expect(parsePrimitiveProjection({})).toBeNull();
  });

  it('parses a valid projection envelope', () => {
    const projection = parsePrimitiveProjection({
      primitive_projection: {
        engine: 'token_overlap_v2',
        mode: 'shadow',
        status: 'matched',
        selected_index: 0,
        thresholds: {
          min_score: 0.45,
          ambiguity_delta: 0.08,
        },
        hypotheses: [
          {
            block_id: 'core.camera.motion.pan_right',
            score: 0.88,
            confidence: 0.88,
            package_name: 'core_camera',
            role: 'camera',
            category: 'camera',
            overlap_tokens: ['pan', 'right'],
            op: {
              op_id: 'camera.motion.pan_right',
              signature_id: 'camera.motion.v1',
              modalities: ['video'],
            },
          },
        ],
      },
    });

    expect(projection).toEqual({
      engine: 'token_overlap_v2',
      mode: 'shadow',
      status: 'matched',
      selected_index: 0,
      thresholds: {
        min_score: 0.45,
        ambiguity_delta: 0.08,
      },
      hypotheses: [
        {
          block_id: 'core.camera.motion.pan_right',
          score: 0.88,
          confidence: 0.88,
          package_name: 'core_camera',
          role: 'camera',
          category: 'camera',
          overlap_tokens: ['pan', 'right'],
          op: {
            op_id: 'camera.motion.pan_right',
            signature_id: 'camera.motion.v1',
            modalities: ['video'],
          },
        },
      ],
      suppression_reason: undefined,
    });
  });
});

describe('parsePrimitiveMatch', () => {
  it('returns selected hypothesis when status is matched', () => {
    const match = parsePrimitiveMatch({
      primitive_projection: {
        status: 'matched',
        selected_index: 1,
        hypotheses: [
          { block_id: 'one', score: 0.5, confidence: 0.5 },
          { block_id: 'two', score: 0.9, confidence: 0.9, overlap_tokens: ['token'] },
        ],
      },
    });
    expect(match?.block_id).toBe('two');
    expect(match?.score).toBe(0.9);
    expect(match?.overlap_tokens).toEqual(['token']);
  });

  it('returns null for non-matched projection statuses', () => {
    expect(
      parsePrimitiveMatch({
        primitive_projection: {
          status: 'ambiguous',
          selected_index: null,
          hypotheses: [{ block_id: 'one', score: 0.7, confidence: 0.7 }],
        },
      }),
    ).toBeNull();
  });

  it('returns null for invalid selected index', () => {
    expect(
      parsePrimitiveMatch({
        primitive_projection: {
          status: 'matched',
          selected_index: 3,
          hypotheses: [{ block_id: 'one', score: 0.7, confidence: 0.7 }],
        },
      }),
    ).toBeNull();
  });
});

describe('extractPrimitiveMatches', () => {
  it('extracts selected matches from candidates', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'one', role: 'camera' },
      {
        text: 'two',
        role: 'camera',
        primitive_projection: {
          status: 'matched',
          selected_index: 0,
          hypotheses: [{ block_id: 'core.camera.motion.pan', score: 0.8, confidence: 0.8 }],
        },
      },
      {
        text: 'three',
        role: 'light',
        primitive_projection: {
          status: 'ambiguous',
          selected_index: null,
          hypotheses: [{ block_id: 'core.light.state.soft', score: 0.6, confidence: 0.6 }],
        },
      },
    ];

    const result = extractPrimitiveMatches(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].candidateIndex).toBe(1);
    expect(result[0].match.block_id).toBe('core.camera.motion.pan');
  });
});

describe('hasPositionData', () => {
  it('returns false for empty candidates', () => {
    expect(hasPositionData([])).toBe(false);
  });

  it('returns true when at least one candidate has positions', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'hello', role: 'character' },
      { text: 'world', role: 'action', start_pos: 6, end_pos: 11 },
    ];
    expect(hasPositionData(candidates)).toBe(true);
  });
});
