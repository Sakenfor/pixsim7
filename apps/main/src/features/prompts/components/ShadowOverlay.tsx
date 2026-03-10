/**
 * ShadowOverlay
 *
 * Compact overlay displayed under the raw prompt input in text mode.
 * Shows inline highlighted prompt text and primitive match metadata
 * from the shadow-mode analysis.
 */
import clsx from 'clsx';
import { useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import type { ShadowAnalysisState } from '../hooks/useShadowAnalysis';
import {
  extractPrimitiveMatches,
  hasPositionData,
  type CandidateWithPrimitiveMatch,
} from '../lib/parsePrimitiveMatch';

import { PromptInlineViewer, PromptCandidateList } from './PromptInlineViewer';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ShadowOverlayProps {
  /** Current prompt text (for display sync) */
  prompt: string;
  /** Analysis state from useShadowAnalysis */
  analysis: ShadowAnalysisState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function PrimitiveMatchRow({ item }: { item: CandidateWithPrimitiveMatch }) {
  const { match } = item;
  const scorePercent = Math.round(match.score * 100);

  return (
    <div className="flex items-center gap-2 text-[11px] leading-tight">
      <span
        className={clsx(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
          'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
          'font-mono',
        )}
      >
        {match.block_id}
      </span>

      <span
        className={clsx(
          'tabular-nums',
          scorePercent >= 80
            ? 'text-green-600 dark:text-green-400'
            : scorePercent >= 60
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-neutral-500 dark:text-neutral-400',
        )}
      >
        {scorePercent}%
      </span>

      {match.op?.op_id && (
        <span className="text-neutral-400 dark:text-neutral-500 font-mono text-[10px]">
          op:{match.op.op_id}
        </span>
      )}
      {match.op?.signature_id && (
        <span className="text-neutral-400 dark:text-neutral-500 font-mono text-[10px]">
          sig:{match.op.signature_id}
        </span>
      )}
      {match.category && (
        <span className="text-neutral-400 dark:text-neutral-500 text-[10px]">
          {match.category}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ShadowOverlay({ prompt, analysis }: ShadowOverlayProps) {
  const { result, loading, refresh } = analysis;
  const [collapsed, setCollapsed] = useState(false);

  const candidates = result?.candidates ?? [];

  const primitiveMatches = useMemo(
    () => extractPrimitiveMatches(candidates),
    [candidates],
  );

  const hasPositions = useMemo(
    () => hasPositionData(candidates),
    [candidates],
  );

  // Don't render if there's nothing to show and not loading
  if (!loading && !result) return null;

  return (
    <div
      className={clsx(
        'rounded-md border text-xs',
        'border-neutral-200/80 dark:border-neutral-700/80',
        'bg-neutral-50/60 dark:bg-neutral-900/40',
      )}
    >
      {/* Header bar */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="p-0.5 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
          title={collapsed ? 'Expand shadow overlay' : 'Collapse shadow overlay'}
        >
          <Icon
            name={collapsed ? 'chevronRight' : 'chevronDown'}
            size={10}
          />
        </button>

        <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 select-none">
          Shadow Analysis
        </span>

        {loading && (
          <Icon
            name="refresh"
            size={10}
            className="text-neutral-400 dark:text-neutral-500 animate-spin"
          />
        )}

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          title="Refresh analysis"
          className="ml-auto p-0.5 rounded text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors disabled:opacity-40"
        >
          <Icon name="refresh" size={10} />
        </button>
      </div>

      {/* Collapsible content */}
      {!collapsed && result && (
        <div className="px-2 pb-2 space-y-2">
          {/* Inline highlighted prompt or fallback list */}
          {candidates.length > 0 && (
            <div className="rounded border border-neutral-200/60 dark:border-neutral-700/60 p-1.5 bg-white/50 dark:bg-neutral-800/30">
              {hasPositions ? (
                <PromptInlineViewer
                  prompt={prompt}
                  candidates={candidates}
                  className="text-[11px]"
                />
              ) : (
                <PromptCandidateList candidates={candidates} />
              )}
            </div>
          )}

          {/* Primitive matches section */}
          {primitiveMatches.length > 0 ? (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                Primitive Matches
              </span>
              <div className="space-y-1">
                {primitiveMatches.map((item) => (
                  <PrimitiveMatchRow
                    key={`${item.candidateIndex}-${item.match.block_id}`}
                    item={item}
                  />
                ))}
              </div>
            </div>
          ) : candidates.length > 0 ? (
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 italic">
              No primitive matches detected
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
