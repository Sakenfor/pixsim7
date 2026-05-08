/**
 * PromptHighlightedSpans
 *
 * Shared renderer for prompt analysis spans. Used by:
 *   - PromptInlineViewer  (read-only inspector, text is rendered visibly)
 *   - ShadowTextarea      (editable composer, text is transparent and the
 *                          backdrop sits behind a real textarea)
 *
 * Visual treatment is identical between both modes — background tint by role,
 * 2px hex underline, confidence-based opacity (0.4 + 0.6 * conf), hover ring.
 * Only the pointer-events plumbing differs:
 *
 *   visible  → text inherits color; native onMouseEnter/Leave/Click handlers.
 *   backdrop → text is transparent and `data-span-idx` is set so the parent
 *              textarea can hit-test via document.elementFromPoint without
 *              pulling pointer events off the editor itself. The parent
 *              drives `hoveredSpanIdx` to render the hover ring.
 */
import clsx from 'clsx';
import type { CSSProperties } from 'react';

import { getPromptRoleHex, getPromptRoleInlineClasses } from '@/lib/promptRoleUi';

import type { CandidateSpan } from '../lib/buildCandidateSpans';
import type { PromptBlockCandidate } from '../types';

export type PromptHighlightMode = 'visible' | 'backdrop';

export interface PromptHighlightedSpansProps {
  spans: CandidateSpan[];
  roleColors?: Record<string, string>;
  mode?: PromptHighlightMode;
  /** External hover index — drives the ring in backdrop mode. */
  hoveredSpanIdx?: number | null;
  /** When set, candidates whose role !== emphasizedRole render at reduced
   *  opacity (×0.3). Drives legend chip hover / pin emphasis. */
  emphasizedRole?: string | null;
  onSpanEnter?: (event: React.MouseEvent<HTMLSpanElement>, candidate: PromptBlockCandidate) => void;
  onSpanLeave?: (event: React.MouseEvent<HTMLSpanElement>) => void;
  onSpanClick?: (event: React.MouseEvent<HTMLSpanElement>, candidate: PromptBlockCandidate) => void;
}

/** Confidence → opacity curve. 100% conf → 1.0, 50% conf → 0.7, 0% conf → 0.4. */
function confidenceOpacity(confidence: number | null | undefined): number {
  const c = typeof confidence === 'number' ? confidence : 1;
  return 0.4 + 0.6 * Math.min(1, Math.max(0, c));
}

export function PromptHighlightedSpans({
  spans,
  roleColors,
  mode = 'visible',
  hoveredSpanIdx = null,
  emphasizedRole = null,
  onSpanEnter,
  onSpanLeave,
  onSpanClick,
}: PromptHighlightedSpansProps) {
  return (
    <>
      {spans.map((span, idx) => {
        if (!span.candidate) {
          // Gap span — no styling. In backdrop mode keep it transparent so
          // the textarea text shows through; in visible mode let the text render.
          return (
            <span key={idx} className={mode === 'backdrop' ? 'text-transparent' : undefined}>
              {span.text}
            </span>
          );
        }

        const candidate = span.candidate;
        const { bg, hover } = getPromptRoleInlineClasses(candidate.role, roleColors);
        const hex = getPromptRoleHex(candidate.role, roleColors);
        const isHovered = hoveredSpanIdx === idx;
        const baseOpacity = confidenceOpacity(candidate.confidence);
        // Legend emphasis: when a role is pinned/hovered in the legend,
        // candidates of any other role fade so the chosen role pops.
        const isDimmed =
          emphasizedRole != null && candidate.role !== emphasizedRole;
        const dimFactor = isDimmed ? 0.3 : 1;
        const opacity =
          (isHovered ? Math.max(baseOpacity, 0.9) : baseOpacity) * dimFactor;

        const style: CSSProperties = {
          opacity,
          borderBottom: `2px solid ${hex}`,
        };
        if (mode === 'backdrop') {
          style.pointerEvents = 'auto';
        }

        const className = clsx(
          'rounded-sm',
          bg,
          mode === 'backdrop' ? 'text-transparent' : 'cursor-pointer transition-colors',
          mode === 'visible' && hover,
          isHovered && 'ring-1 ring-current',
        );

        const handlers =
          mode === 'visible'
            ? {
                onMouseEnter: onSpanEnter ? (e: React.MouseEvent<HTMLSpanElement>) => onSpanEnter(e, candidate) : undefined,
                onMouseLeave: onSpanLeave,
                onClick: onSpanClick ? (e: React.MouseEvent<HTMLSpanElement>) => onSpanClick(e, candidate) : undefined,
              }
            : {};

        return (
          <span
            key={idx}
            data-span-idx={idx}
            className={className}
            style={style}
            {...handlers}
          >
            {span.text}
          </span>
        );
      })}
    </>
  );
}
