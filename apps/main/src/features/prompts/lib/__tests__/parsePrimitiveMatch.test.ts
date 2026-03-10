import { describe, expect, it } from 'vitest';

import type { PromptBlockCandidate } from '../../types';
import {
  parsePrimitiveMatch,
  extractPrimitiveMatches,
  hasPositionData,
} from '../parsePrimitiveMatch';

// ─────────────────────────────────────────────────────────────────────────────
// parsePrimitiveMatch
// ─────────────────────────────────────────────────────────────────────────────

describe('parsePrimitiveMatch', () => {
  it('returns null for null/undefined metadata', () => {
    expect(parsePrimitiveMatch(null)).toBeNull();
    expect(parsePrimitiveMatch(undefined)).toBeNull();
  });

  it('returns null for non-object metadata', () => {
    expect(parsePrimitiveMatch('string')).toBeNull();
    expect(parsePrimitiveMatch(42)).toBeNull();
    expect(parsePrimitiveMatch(true)).toBeNull();
  });

  it('returns null when primitive_match is missing', () => {
    expect(parsePrimitiveMatch({})).toBeNull();
    expect(parsePrimitiveMatch({ other_key: 'value' })).toBeNull();
  });

  it('returns null when primitive_match is not an object', () => {
    expect(parsePrimitiveMatch({ primitive_match: 'string' })).toBeNull();
    expect(parsePrimitiveMatch({ primitive_match: 42 })).toBeNull();
    expect(parsePrimitiveMatch({ primitive_match: null })).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parsePrimitiveMatch({ primitive_match: {} })).toBeNull();
    expect(
      parsePrimitiveMatch({
        primitive_match: { block_id: 'test', score: 0.8 },
      }),
    ).toBeNull(); // missing confidence
    expect(
      parsePrimitiveMatch({
        primitive_match: { block_id: '', score: 0.8, confidence: 0.7 },
      }),
    ).toBeNull(); // empty block_id
  });

  it('returns null for non-finite score/confidence', () => {
    expect(
      parsePrimitiveMatch({
        primitive_match: { block_id: 'x', score: NaN, confidence: 0.5 },
      }),
    ).toBeNull();
    expect(
      parsePrimitiveMatch({
        primitive_match: { block_id: 'x', score: 0.5, confidence: Infinity },
      }),
    ).toBeNull();
  });

  it('parses minimal valid match', () => {
    const result = parsePrimitiveMatch({
      primitive_match: {
        block_id: 'scene_forest',
        score: 0.85,
        confidence: 0.85,
      },
    });
    expect(result).toEqual({
      block_id: 'scene_forest',
      score: 0.85,
      confidence: 0.85,
    });
  });

  it('parses full match with all optional fields', () => {
    const result = parsePrimitiveMatch({
      primitive_match: {
        mode: 'shadow',
        strategy: 'token_overlap_v1',
        block_id: 'action_walk',
        score: 0.92,
        confidence: 0.92,
        package_name: 'scene_foundation',
        role: 'action',
        category: 'movement',
        overlap_tokens: ['walk', 'walking', 'stroll'],
        op: {
          op_id: 'generate_video',
          signature_id: 'sig_001',
          modalities: ['video', 'image'],
        },
      },
    });

    expect(result).toEqual({
      mode: 'shadow',
      strategy: 'token_overlap_v1',
      block_id: 'action_walk',
      score: 0.92,
      confidence: 0.92,
      package_name: 'scene_foundation',
      role: 'action',
      category: 'movement',
      overlap_tokens: ['walk', 'walking', 'stroll'],
      op: {
        op_id: 'generate_video',
        signature_id: 'sig_001',
        modalities: ['video', 'image'],
      },
    });
  });

  it('filters non-string items from overlap_tokens', () => {
    const result = parsePrimitiveMatch({
      primitive_match: {
        block_id: 'x',
        score: 0.5,
        confidence: 0.5,
        overlap_tokens: ['valid', 42, null, 'also_valid'],
      },
    });
    expect(result?.overlap_tokens).toEqual(['valid', 'also_valid']);
  });

  it('handles op with partial fields', () => {
    const result = parsePrimitiveMatch({
      primitive_match: {
        block_id: 'x',
        score: 0.5,
        confidence: 0.5,
        op: { op_id: 'test_op' },
      },
    });
    expect(result?.op).toEqual({ op_id: 'test_op' });
  });

  it('ignores unknown fields in primitive_match', () => {
    const result = parsePrimitiveMatch({
      primitive_match: {
        block_id: 'x',
        score: 0.5,
        confidence: 0.5,
        unknown_field: 'should be ignored',
      },
    });
    expect(result).toEqual({
      block_id: 'x',
      score: 0.5,
      confidence: 0.5,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractPrimitiveMatches
// ─────────────────────────────────────────────────────────────────────────────

describe('extractPrimitiveMatches', () => {
  it('returns empty array for empty candidates', () => {
    expect(extractPrimitiveMatches([])).toEqual([]);
  });

  it('returns empty array when no candidates have primitive_match', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'hello', role: 'character' },
      { text: 'world', metadata: { other: 'data' } },
    ];
    expect(extractPrimitiveMatches(candidates)).toEqual([]);
  });

  it('extracts valid primitive matches with candidate index', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'no match', role: 'character' },
      {
        text: 'forest scene',
        role: 'setting',
        metadata: {
          primitive_match: {
            block_id: 'scene_forest',
            score: 0.85,
            confidence: 0.85,
          },
        },
      },
      { text: 'walking slowly', role: 'action' },
      {
        text: 'sunset lighting',
        role: 'mood',
        metadata: {
          primitive_match: {
            block_id: 'mood_golden_hour',
            score: 0.72,
            confidence: 0.72,
          },
        },
      },
    ];

    const result = extractPrimitiveMatches(candidates);
    expect(result).toHaveLength(2);
    expect(result[0].candidateIndex).toBe(1);
    expect(result[0].match.block_id).toBe('scene_forest');
    expect(result[1].candidateIndex).toBe(3);
    expect(result[1].match.block_id).toBe('mood_golden_hour');
  });

  it('skips candidates with malformed primitive_match', () => {
    const candidates: PromptBlockCandidate[] = [
      {
        text: 'valid',
        metadata: {
          primitive_match: {
            block_id: 'valid_id',
            score: 0.8,
            confidence: 0.8,
          },
        },
      },
      {
        text: 'invalid',
        metadata: {
          primitive_match: { block_id: '', score: 'bad' },
        },
      },
    ];

    const result = extractPrimitiveMatches(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].match.block_id).toBe('valid_id');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasPositionData
// ─────────────────────────────────────────────────────────────────────────────

describe('hasPositionData', () => {
  it('returns false for empty candidates', () => {
    expect(hasPositionData([])).toBe(false);
  });

  it('returns false when no candidates have positions', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'hello', role: 'character' },
      { text: 'world', role: 'action' },
    ];
    expect(hasPositionData(candidates)).toBe(false);
  });

  it('returns true when at least one candidate has positions', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'hello', role: 'character' },
      { text: 'world', role: 'action', start_pos: 6, end_pos: 11 },
    ];
    expect(hasPositionData(candidates)).toBe(true);
  });

  it('requires both start_pos and end_pos', () => {
    const candidates: PromptBlockCandidate[] = [
      { text: 'hello', role: 'character', start_pos: 0 },
    ];
    expect(hasPositionData(candidates)).toBe(false);
  });
});
