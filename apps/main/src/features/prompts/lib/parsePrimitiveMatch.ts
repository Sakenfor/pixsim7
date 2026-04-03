/**
 * Parse and validate `candidate.primitive_projection` from prompt analysis candidates.
 *
 * Backend projection now emits a top-level `primitive_projection` envelope with
 * ranked hypotheses and a selected index.
 */
import type { PromptBlockCandidate } from '../types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PrimitiveProjectionHypothesis {
  block_id: string;
  score: number;
  confidence: number;
  mode?: string;
  strategy?: string;
  package_name?: string;
  role?: string;
  category?: string;
  role_in_sequence?: string;
  continuity_focus?: string;
  continuity_priority?: string;
  overlap_tokens?: string[];
  op?: {
    op_id?: string;
    signature_id?: string;
    modalities?: string[];
  };
}

/** Selected hypothesis alias retained for downstream UI helpers. */
export type PrimitiveMatch = PrimitiveProjectionHypothesis;

export interface PrimitiveProjection {
  engine?: string;
  mode?: string;
  status: string;
  selected_index: number | null;
  hypotheses: PrimitiveProjectionHypothesis[];
  thresholds?: {
    min_score?: number;
    ambiguity_delta?: number;
  };
  suppression_reason?: string | null;
}

export interface CandidateWithPrimitiveMatch {
  candidate: PromptBlockCandidate;
  candidateIndex: number;
  match: PrimitiveMatch;
}

// -----------------------------------------------------------------------------
// Parsing helpers
// -----------------------------------------------------------------------------

function parseHypothesis(raw: unknown): PrimitiveProjectionHypothesis | null {
  if (raw == null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.block_id !== 'string' || !obj.block_id.trim()) return null;
  if (typeof obj.score !== 'number' || !isFinite(obj.score)) return null;
  if (typeof obj.confidence !== 'number' || !isFinite(obj.confidence)) return null;

  const result: PrimitiveProjectionHypothesis = {
    block_id: obj.block_id,
    score: obj.score,
    confidence: obj.confidence,
  };

  if (typeof obj.package_name === 'string') result.package_name = obj.package_name;
  if (typeof obj.mode === 'string') result.mode = obj.mode;
  if (typeof obj.strategy === 'string') result.strategy = obj.strategy;
  if (typeof obj.role === 'string') result.role = obj.role;
  if (typeof obj.category === 'string') result.category = obj.category;
  if (typeof obj.role_in_sequence === 'string') result.role_in_sequence = obj.role_in_sequence;
  if (typeof obj.continuity_focus === 'string') result.continuity_focus = obj.continuity_focus;
  if (typeof obj.continuity_priority === 'string') result.continuity_priority = obj.continuity_priority;

  if (Array.isArray(obj.overlap_tokens)) {
    result.overlap_tokens = obj.overlap_tokens.filter(
      (token): token is string => typeof token === 'string',
    );
  }

  if (obj.op != null && typeof obj.op === 'object') {
    const opRaw = obj.op as Record<string, unknown>;
    const op: PrimitiveProjectionHypothesis['op'] = {};
    if (typeof opRaw.op_id === 'string') op.op_id = opRaw.op_id;
    if (typeof opRaw.signature_id === 'string') op.signature_id = opRaw.signature_id;
    if (Array.isArray(opRaw.modalities)) {
      op.modalities = opRaw.modalities.filter(
        (modality): modality is string => typeof modality === 'string',
      );
    }
    result.op = op;
  }

  return result;
}

/**
 * Parse the top-level projection envelope from a candidate-like object.
 */
export function parsePrimitiveProjection(candidateLike: unknown): PrimitiveProjection | null {
  if (candidateLike == null || typeof candidateLike !== 'object') return null;
  const candidate = candidateLike as Record<string, unknown>;
  const raw = candidate.primitive_projection;
  if (raw == null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.status !== 'string' || !obj.status.trim()) return null;
  if (!Array.isArray(obj.hypotheses)) return null;

  const hypotheses = obj.hypotheses
    .map(parseHypothesis)
    .filter((item): item is PrimitiveProjectionHypothesis => item !== null);

  const selectedIndexRaw = obj.selected_index;
  const selectedIndex =
    selectedIndexRaw == null
      ? null
      : Number.isInteger(selectedIndexRaw as number)
        ? (selectedIndexRaw as number)
        : null;

  const projection: PrimitiveProjection = {
    status: obj.status.trim(),
    selected_index: selectedIndex,
    hypotheses,
  };

  if (typeof obj.engine === 'string') projection.engine = obj.engine;
  if (typeof obj.mode === 'string') projection.mode = obj.mode;
  if (
    obj.suppression_reason == null ||
    typeof obj.suppression_reason === 'string'
  ) {
    projection.suppression_reason = obj.suppression_reason as string | null | undefined;
  }

  if (obj.thresholds != null && typeof obj.thresholds === 'object') {
    const thresholdsRaw = obj.thresholds as Record<string, unknown>;
    const thresholds: PrimitiveProjection['thresholds'] = {};
    if (typeof thresholdsRaw.min_score === 'number' && isFinite(thresholdsRaw.min_score)) {
      thresholds.min_score = thresholdsRaw.min_score;
    }
    if (
      typeof thresholdsRaw.ambiguity_delta === 'number' &&
      isFinite(thresholdsRaw.ambiguity_delta)
    ) {
      thresholds.ambiguity_delta = thresholdsRaw.ambiguity_delta;
    }
    projection.thresholds = thresholds;
  }

  return projection;
}

/**
 * Resolve the selected projection hypothesis (active primitive match) for a candidate.
 */
export function parsePrimitiveMatch(candidateLike: unknown): PrimitiveMatch | null {
  const projection = parsePrimitiveProjection(candidateLike);
  if (!projection) return null;
  if (projection.status !== 'matched') return null;
  if (projection.selected_index == null) return null;
  if (
    projection.selected_index < 0 ||
    projection.selected_index >= projection.hypotheses.length
  ) {
    return null;
  }
  return projection.hypotheses[projection.selected_index] ?? null;
}

// -----------------------------------------------------------------------------
// Extraction
// -----------------------------------------------------------------------------

/**
 * Extract all valid selected primitive matches from an array of candidates.
 */
export function extractPrimitiveMatches(
  candidates: PromptBlockCandidate[],
): CandidateWithPrimitiveMatch[] {
  const results: CandidateWithPrimitiveMatch[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const match = parsePrimitiveMatch(candidate);
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
