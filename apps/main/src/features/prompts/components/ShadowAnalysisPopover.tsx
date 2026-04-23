import clsx from 'clsx';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import { parsePrimitiveProjection, type PrimitiveProjectionHypothesis } from '../lib/parsePrimitiveMatch';
import type { PromptBlockCandidate } from '../types';

function HypothesisRow({
  hyp,
  isSelected,
}: {
  hyp: PrimitiveProjectionHypothesis;
  isSelected: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-2 py-1.5 rounded text-xs',
        isSelected
          ? 'bg-violet-100 dark:bg-violet-900/40'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
      )}
    >
      <span
        className={clsx(
          'font-mono truncate flex-1',
          isSelected
            ? 'text-violet-700 dark:text-violet-300 font-medium'
            : 'text-neutral-700 dark:text-neutral-300',
        )}
      >
        {hyp.block_id}
      </span>
      <span
        className={clsx(
          'tabular-nums flex-shrink-0',
          hyp.score >= 0.8
            ? 'text-green-600 dark:text-green-400'
            : hyp.score >= 0.6
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-neutral-500',
        )}
      >
        {Math.round(hyp.score * 100)}%
      </span>
      {isSelected && (
        <span className="text-violet-500 flex-shrink-0" title="Selected match">
          &#x2713;
        </span>
      )}
    </div>
  );
}

export interface ShadowAnalysisPopoverProps {
  candidate: PromptBlockCandidate;
  roleColors?: Record<string, string>;
}

export function ShadowAnalysisPopover({
  candidate,
  roleColors,
}: ShadowAnalysisPopoverProps) {
  const projection = parsePrimitiveProjection(candidate);

  return (
    <div
      className={clsx(
        'w-[260px] rounded-lg shadow-xl border overflow-hidden',
        'bg-white dark:bg-neutral-900',
        'border-neutral-200 dark:border-neutral-700',
      )}
    >
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className={clsx(
              'w-2 h-2 rounded-full flex-shrink-0',
              getPromptRoleBadgeClass(candidate.role, roleColors),
            )}
          />
          <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
            {getPromptRoleLabel(candidate.role)}
          </span>
          {candidate.category && (
            <span className="text-xs text-neutral-500">
              / {candidate.category}
            </span>
          )}
        </div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400 truncate italic">
          &ldquo;{candidate.text}&rdquo;
        </div>
      </div>

      {projection && projection.hypotheses.length > 0 ? (
        <div className="p-1.5 max-h-[200px] overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider text-neutral-400 px-2 py-1">
            Matches ({projection.hypotheses.length})
          </div>
          {projection.hypotheses.map((hyp, i) => (
            <HypothesisRow
              key={hyp.block_id}
              hyp={hyp}
              isSelected={i === projection.selected_index}
            />
          ))}
        </div>
      ) : (
        <div className="p-3 text-xs text-neutral-500 text-center">
          {projection?.status === 'no_signal'
            ? 'No primitives matched this text'
            : projection?.status === 'suppressed'
              ? `Suppressed: ${projection.suppression_reason ?? 'threshold'}`
              : 'No projection data'}
        </div>
      )}

      {typeof candidate.confidence === 'number' && (
        <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-[10px] text-neutral-500">
          <span>Confidence</span>
          <span className="tabular-nums font-medium">
            {Math.round(candidate.confidence * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
