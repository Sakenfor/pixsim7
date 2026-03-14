/**
 * ShadowOverlay
 *
 * Inline chip strip rendered beneath the prompt textarea.
 * Shows candidate role chips + primitive match chips from analysis.
 * No border/box — flows as part of the prompt area.
 */
import clsx from 'clsx';
import { useMemo } from 'react';

import { Icon } from '@lib/icons';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import type { ShadowAnalysisState } from '../hooks/useShadowAnalysis';
import {
  extractPrimitiveMatches,
  type CandidateWithPrimitiveMatch,
} from '../lib/parsePrimitiveMatch';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ShadowOverlayProps {
  analysis: ShadowAnalysisState;
}

function getSequenceRoleLabel(role: string): string {
  switch (role) {
    case 'initial':
      return 'Initial';
    case 'continuation':
      return 'Continuation';
    case 'transition':
      return 'Transition';
    default:
      return 'Unspecified';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chips
// ─────────────────────────────────────────────────────────────────────────────

function MatchChip({ item }: { item: CandidateWithPrimitiveMatch }) {
  const { match } = item;
  const pct = Math.round(match.score * 100);

  const parts: string[] = [match.block_id];
  if (match.op?.op_id) parts.push(`op:${match.op.op_id}`);
  if (match.op?.signature_id) parts.push(`sig:${match.op.signature_id}`);

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap',
        'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300',
        'border border-violet-200/60 dark:border-violet-700/40',
      )}
      title={parts.join(' · ')}
    >
      {match.block_id}
      <span
        className={clsx(
          'tabular-nums font-sans',
          pct >= 80
            ? 'text-green-600 dark:text-green-400'
            : pct >= 60
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-neutral-400 dark:text-neutral-500',
        )}
      >
        {pct}%
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export function ShadowOverlay({ analysis }: ShadowOverlayProps) {
  const { result, loading, refresh } = analysis;
  const promptRoleColors = usePromptSettingsStore((s) => s.promptRoleColors);
  const candidates = result?.candidates ?? [];
  const sequenceContext = result?.sequenceContext;
  const sequenceRole = result?.roleInSequence ?? sequenceContext?.role_in_sequence ?? 'unspecified';
  const hasSequenceRole = sequenceRole !== 'unspecified';
  const sequenceConfidencePct =
    typeof sequenceContext?.confidence === 'number'
      ? Math.round(sequenceContext.confidence * 100)
      : null;

  const primitiveMatches = useMemo(
    () => extractPrimitiveMatches(candidates),
    [candidates],
  );

  // Collect unique roles from candidates
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of candidates) {
      const role = c.role ?? 'other';
      counts[role] = (counts[role] ?? 0) + 1;
    }
    return counts;
  }, [candidates]);

  const hasContent = loading || candidates.length > 0;
  if (!hasContent) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto -mt-1">
      {/* Icon label */}
      <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-violet-200 dark:border-violet-700/50 text-violet-500 dark:text-violet-400 flex-shrink-0">
        <Icon name="sparkles" size={12} />
      </span>

      {/* Loading spinner */}
      {loading && (
        <Icon
          name="refresh"
          size={12}
          className="text-neutral-400 dark:text-neutral-500 animate-spin flex-shrink-0"
        />
      )}

      {hasSequenceRole && (
        <span
          className={clsx(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap border',
            'border-cyan-200/70 dark:border-cyan-700/50',
            'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300',
          )}
          title={
            [
              `Sequence role: ${getSequenceRoleLabel(sequenceRole)}`,
              sequenceContext?.source ? `Source: ${sequenceContext.source}` : null,
            ]
              .filter(Boolean)
              .join(' | ')
          }
        >
          {getSequenceRoleLabel(sequenceRole)}
          {sequenceConfidencePct !== null && (
            <span className="tabular-nums text-cyan-600 dark:text-cyan-400">
              {sequenceConfidencePct}%
            </span>
          )}
        </span>
      )}

      {/* Role chips — always show when we have candidates */}
      {Object.entries(roleCounts).map(([role, count]) => (
        <span
          key={role}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap border border-neutral-200/60 dark:border-neutral-700/40"
          title={`${count} ${getPromptRoleLabel(role)} segment${count > 1 ? 's' : ''}`}
        >
          <span className={clsx('w-1.5 h-1.5 rounded-full', getPromptRoleBadgeClass(role, promptRoleColors))} />
          <span className="text-neutral-600 dark:text-neutral-300">
            {getPromptRoleLabel(role)}
          </span>
          <span className="text-neutral-400 dark:text-neutral-500">{count}</span>
        </span>
      ))}

      {/* Separator when both roles and primitives exist */}
      {Object.keys(roleCounts).length > 0 && primitiveMatches.length > 0 && (
        <span className="w-px h-3 bg-neutral-300 dark:bg-neutral-600 flex-shrink-0" />
      )}

      {/* Primitive match chips */}
      {primitiveMatches.map((item) => (
        <MatchChip
          key={`${item.candidateIndex}-${item.match.block_id}`}
          item={item}
        />
      ))}

      {/* Refresh button */}
      {!loading && candidates.length > 0 && (
        <button
          type="button"
          onClick={refresh}
          title="Refresh analysis"
          className="p-0.5 rounded text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors flex-shrink-0 ml-auto"
        >
          <Icon name="refresh" size={10} />
        </button>
      )}
    </div>
  );
}
