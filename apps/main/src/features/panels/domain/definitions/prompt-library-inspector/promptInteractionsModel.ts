import type { PromptBlockLike } from '@pixsim7/core.prompt';
import type { PromptBlockCandidate } from '@pixsim7/shared.types/prompt';

import type { CandidateWithPrimitiveMatch } from '@features/prompts/lib/parsePrimitiveMatch';

import type { ActionBlock } from '@/types/promptGraphs';

const FALLBACK_ROLE = 'other';
const FALLBACK_CATEGORY = '-';

export interface CandidateRoleGroup {
  role: string;
  candidates: PromptBlockCandidate[];
}

export interface PrimitiveMatchRow {
  candidateIndex: number;
  candidateText: string;
  blockId: string;
  score: number;
  role: string;
  category: string;
  overlapTokens: string[];
  opId?: string;
  signatureId?: string;
}

export interface InteractionSummary {
  candidateCount: number;
  roleGroupCount: number;
  primitiveMatchCount: number;
  filteredMatchCount: number;
  derivedBlockCount: number;
}

export interface SummarizeInteractionInput {
  candidates: PromptBlockCandidate[];
  primitiveMatches: CandidateWithPrimitiveMatch[];
  filteredMatches: CandidateWithPrimitiveMatch[];
  derivedBlocks: PromptBlockLike[];
}

function normalizeRole(role?: string): string {
  const trimmed = role?.trim();
  return trimmed ? trimmed : FALLBACK_ROLE;
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function groupCandidatesByRole(
  candidates: PromptBlockCandidate[],
): CandidateRoleGroup[] {
  const groups = new Map<string, PromptBlockCandidate[]>();
  for (const candidate of candidates) {
    const role = normalizeRole(candidate.role);
    const bucket = groups.get(role);
    if (bucket) {
      bucket.push(candidate);
    } else {
      groups.set(role, [candidate]);
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => {
      if (b[1].length !== a[1].length) {
        return b[1].length - a[1].length;
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([role, groupedCandidates]) => ({
      role,
      candidates: groupedCandidates,
    }));
}

export function filterPrimitiveMatchesByScore(
  matches: CandidateWithPrimitiveMatch[],
  minScore: number,
): CandidateWithPrimitiveMatch[] {
  const threshold = clampScore(minScore);
  return matches.filter((item) => item.match.score >= threshold);
}

export function mapPrimitiveMatchesForTable(
  matches: CandidateWithPrimitiveMatch[],
): PrimitiveMatchRow[] {
  return matches.map((item) => ({
    candidateIndex: item.candidateIndex,
    candidateText: item.candidate.text,
    blockId: item.match.block_id,
    score: item.match.score,
    role: normalizeRole(item.match.role ?? item.candidate.role),
    category: item.match.category ?? item.candidate.category ?? FALLBACK_CATEGORY,
    overlapTokens: item.match.overlap_tokens ?? [],
    opId: item.match.op?.op_id,
    signatureId: item.match.op?.signature_id,
  }));
}

export function summarizeInteractionData(
  input: SummarizeInteractionInput,
): InteractionSummary {
  return {
    candidateCount: input.candidates.length,
    roleGroupCount: groupCandidatesByRole(input.candidates).length,
    primitiveMatchCount: input.primitiveMatches.length,
    filteredMatchCount: input.filteredMatches.length,
    derivedBlockCount: input.derivedBlocks.length,
  };
}

function toSyntheticBlockId(item: CandidateWithPrimitiveMatch): string {
  return `${item.match.block_id}@${item.candidateIndex}`;
}

function toComplexityLevel(score: number): ActionBlock['complexity_level'] {
  if (score >= 0.8) return 'simple';
  if (score >= 0.6) return 'moderate';
  if (score >= 0.45) return 'complex';
  return 'very_complex';
}

export function mapMatchesToSyntheticActionBlocks(
  matches: CandidateWithPrimitiveMatch[],
): ActionBlock[] {
  const sorted = [...matches].sort((a, b) => a.candidateIndex - b.candidateIndex);

  return sorted.map((item, index) => {
    const prev = sorted[index - 1];
    const next = sorted[index + 1];
    const syntheticBlockId = toSyntheticBlockId(item);

    return {
      id: `shadow-${item.candidateIndex}-${index}`,
      block_id: syntheticBlockId,
      package_name: item.match.package_name ?? 'shadow.interactions',
      prompt: item.candidate.text,
      tags: [
        `primitive:${item.match.block_id}`,
        normalizeRole(item.match.role ?? item.candidate.role),
        item.match.category ?? item.candidate.category ?? FALLBACK_CATEGORY,
      ],
      compatible_next: next ? [toSyntheticBlockId(next)] : [],
      compatible_prev: prev ? [toSyntheticBlockId(prev)] : [],
      complexity_level: toComplexityLevel(item.match.score),
      source_type: item.match.mode ?? 'shadow',
      is_composite: false,
      component_blocks: [],
      composition_strategy: item.match.strategy,
      extracted_from_prompt_version: 'prompt-library-interactions',
    };
  });
}
