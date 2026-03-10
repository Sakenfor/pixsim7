/**
 * Parse and validate `metadata.primitive_match` from prompt analysis candidates.
 *
 * The backend enriches candidates with shadow-mode primitive projection data
 * at `candidate.metadata.primitive_match`. This module provides strict runtime
 * guards to safely extract and group that data for UI display.
 */
import type { PromptBlockCandidate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of `metadata.primitive_match` as produced by the backend. */
export interface PrimitiveMatch {
  block_id: string;
  score: number;
  confidence: number;
  mode?: string;
  strategy?: string;
  package_name?: string;
  role?: string;
  category?: string;
  overlap_tokens?: string[];
  op?: {
    op_id?: string;
    signature_id?: string;
    modalities?: string[];
  };
}

/** A candidate paired with its validated primitive match. */
export interface CandidateWithPrimitiveMatch {
  candidate: PromptBlockCandidate;
  candidateIndex: number;
  match: PrimitiveMatch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely extract a `PrimitiveMatch` from unknown metadata.
 * Returns `null` if the shape is invalid or data is missing.
 */
export function parsePrimitiveMatch(metadata: unknown): PrimitiveMatch | null {
  if (metadata == null || typeof metadata !== 'object') return null;

  const raw = metadata as Record<string, unknown>;
  const pm = raw.primitive_match;

  if (pm == null || typeof pm !== 'object') return null;

  const obj = pm as Record<string, unknown>;

  // Required fields
  if (typeof obj.block_id !== 'string' || !obj.block_id) return null;
  if (typeof obj.score !== 'number' || !isFinite(obj.score)) return null;
  if (typeof obj.confidence !== 'number' || !isFinite(obj.confidence)) return null;

  const result: PrimitiveMatch = {
    block_id: obj.block_id,
    score: obj.score,
    confidence: obj.confidence,
  };

  // Optional scalars
  if (typeof obj.mode === 'string') result.mode = obj.mode;
  if (typeof obj.strategy === 'string') result.strategy = obj.strategy;
  if (typeof obj.package_name === 'string') result.package_name = obj.package_name;
  if (typeof obj.role === 'string') result.role = obj.role;
  if (typeof obj.category === 'string') result.category = obj.category;

  // Optional array
  if (Array.isArray(obj.overlap_tokens)) {
    result.overlap_tokens = obj.overlap_tokens.filter(
      (t): t is string => typeof t === 'string',
    );
  }

  // Optional nested op
  if (obj.op != null && typeof obj.op === 'object') {
    const opRaw = obj.op as Record<string, unknown>;
    const op: PrimitiveMatch['op'] = {};
    if (typeof opRaw.op_id === 'string') op.op_id = opRaw.op_id;
    if (typeof opRaw.signature_id === 'string') op.signature_id = opRaw.signature_id;
    if (Array.isArray(opRaw.modalities)) {
      op.modalities = opRaw.modalities.filter(
        (m): m is string => typeof m === 'string',
      );
    }
    result.op = op;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract all valid primitive matches from an array of candidates.
 * Returns only candidates that have a valid `metadata.primitive_match`.
 */
export function extractPrimitiveMatches(
  candidates: PromptBlockCandidate[],
): CandidateWithPrimitiveMatch[] {
  const results: CandidateWithPrimitiveMatch[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const match = parsePrimitiveMatch(candidate.metadata);
    if (match) {
      results.push({ candidate, candidateIndex: i, match });
    }
  }

  return results;
}

/**
 * Check whether any candidate has position data (start_pos / end_pos).
 */
export function hasPositionData(candidates: PromptBlockCandidate[]): boolean {
  return candidates.some(
    (c) => typeof c.start_pos === 'number' && typeof c.end_pos === 'number',
  );
}
