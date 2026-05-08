/**
 * PromptSpanTooltip
 *
 * Hover tooltip for an analysed prompt span. Shows role + category, confidence,
 * primitive match (block_id + score, color-graded by score), and matched
 * keywords. Used by both the read-only inspector (PromptInlineViewer) and the
 * editable composer (ShadowTextarea).
 */
import clsx from 'clsx';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import { parsePrimitiveMatch } from '../lib/parsePrimitiveMatch';
import type { PromptBlockCandidate } from '../types';

export interface PromptSpanTooltipProps {
  candidate: PromptBlockCandidate;
  x: number;
  y: number;
  /** Vertical offset below the cursor / span. Default 12 (cursor-anchored). */
  offsetY?: number;
  roleColors?: Record<string, string>;
}

export function PromptSpanTooltip({
  candidate,
  x,
  y,
  offsetY = 12,
  roleColors,
}: PromptSpanTooltipProps) {
  const pm = parsePrimitiveMatch(candidate);

  return (
    <div
      className={clsx(
        'fixed z-[100] px-2.5 py-1.5 rounded-lg shadow-lg border text-xs',
        'bg-neutral-900/95 dark:bg-neutral-100/95',
        'text-white dark:text-neutral-900',
        'border-neutral-700 dark:border-neutral-300',
        'pointer-events-none max-w-[280px]',
      )}
      style={{ left: x, top: y + offsetY }}
    >
      {/* Role + category */}
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0',
            getPromptRoleBadgeClass(candidate.role, roleColors),
          )}
        />
        <span className="font-medium">{getPromptRoleLabel(candidate.role)}</span>
        {candidate.category && (
          <span className="text-neutral-400 dark:text-neutral-500">/ {candidate.category}</span>
        )}
      </div>

      {/* Confidence */}
      {typeof candidate.confidence === 'number' && (
        <div className="mt-0.5 text-neutral-400 dark:text-neutral-500">
          Confidence: {Math.round(candidate.confidence * 100)}%
        </div>
      )}

      {/* Primitive match */}
      {pm && (
        <div className="mt-1 pt-1 border-t border-neutral-700 dark:border-neutral-300 flex items-center gap-1.5">
          <span className="text-violet-400 dark:text-violet-600 font-mono">{pm.block_id}</span>
          <span
            className={clsx(
              'tabular-nums',
              pm.score >= 0.8
                ? 'text-green-400 dark:text-green-600'
                : pm.score >= 0.6
                  ? 'text-yellow-400 dark:text-yellow-600'
                  : 'text-neutral-400 dark:text-neutral-500',
            )}
          >
            {Math.round(pm.score * 100)}%
          </span>
        </div>
      )}

      {/* Matched keywords */}
      {candidate.matched_keywords && candidate.matched_keywords.length > 0 && (
        <div className="mt-0.5 text-neutral-400 dark:text-neutral-500 truncate">
          Keywords: {candidate.matched_keywords.join(', ')}
        </div>
      )}
    </div>
  );
}
