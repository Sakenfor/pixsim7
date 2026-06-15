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

import type { CandidateSpan, PromptVariableSpan } from '../lib/buildCandidateSpans';
import { getVariableClassVisual } from '../lib/variableClassVisuals';
import type { PromptBlockCandidate } from '../types';

export type PromptHighlightMode = 'visible' | 'backdrop';

const _VAR_SAVED_HEX = 'rgba(16, 185, 129, 0.85)'; // emerald — saved, no class hue
const _VAR_UNKNOWN_HEX = 'rgba(120, 120, 120, 0.55)';

/** Inline style for a clickable variable token — mirrors variableTokenExtension:
 *  underline solid (saved) / dotted (default-recognised) / dashed (unknown),
 *  coloured by the variable's class hue when it has one. */
function variableSpanStyle(variable: PromptVariableSpan): CSSProperties {
  const underline = variable.saved ? 'solid' : variable.defaultClass ? 'dotted' : 'dashed';
  const classHex = getVariableClassVisual(variable.name)?.hex;
  const lineColor = classHex ?? (variable.saved ? _VAR_SAVED_HEX : _VAR_UNKNOWN_HEX);
  const style: CSSProperties = { borderBottom: `1px ${underline} ${lineColor}`, cursor: 'pointer' };
  const textColor = classHex ?? (variable.saved ? _VAR_SAVED_HEX : undefined);
  if (textColor) style.color = textColor;
  return style;
}

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
  /** Click on a variable token (visible mode only). Takes precedence over the
   *  candidate click when a span is both. The element is the popover anchor. */
  onVariableClick?: (
    event: React.MouseEvent<HTMLSpanElement>,
    variable: PromptVariableSpan,
    anchor: HTMLSpanElement,
  ) => void;
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
  onVariableClick,
}: PromptHighlightedSpansProps) {
  return (
    <>
      {spans.map((span, idx) => {
        // Variable affordance is a visible-mode concern only — the editable
        // backdrop never sets `span.variable`, so this branch is inert there.
        const variable = mode === 'visible' ? span.variable : undefined;

        if (!span.candidate) {
          // No candidate. A variable-only span still needs its clickable token
          // affordance; a plain gap renders unstyled (transparent in backdrop
          // mode so the textarea text shows through).
          if (variable) {
            return (
              <span
                key={idx}
                data-span-idx={idx}
                data-var-name={variable.name}
                className="cm-prompt-var rounded-sm transition-colors hover:bg-violet-500/15"
                style={variableSpanStyle(variable)}
                onClick={
                  onVariableClick
                    ? (e) => onVariableClick(e, variable, e.currentTarget)
                    : undefined
                }
              >
                {span.text}
              </span>
            );
          }
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
        // Legend / panel emphasis: when a role is pinned or hovered, candidates
        // of any other role fade hard so the chosen role clearly pops, and the
        // matching spans get a ring so the pin obviously "did something".
        const isDimmed =
          emphasizedRole != null && candidate.role !== emphasizedRole;
        const isEmphasized =
          emphasizedRole != null && candidate.role === emphasizedRole;
        const dimFactor = isDimmed ? 0.15 : 1;
        const opacity =
          mode === 'backdrop'
            ? (isHovered ? Math.max(baseOpacity, 0.9) : baseOpacity) * dimFactor
            : isDimmed
              ? 0.15
              : 1;

        const style: CSSProperties = {
          opacity,
          // A variable token on this span owns the underline (its save state is
          // the more actionable signal); otherwise the role hue underlines it.
          ...(variable ? variableSpanStyle(variable) : { borderBottom: `2px solid ${hex}` }),
        };
        if (mode === 'backdrop') {
          style.pointerEvents = 'auto';
        }

        const className = clsx(
          'rounded-sm',
          bg,
          mode === 'backdrop' ? 'text-transparent' : 'cursor-pointer transition-colors',
          mode === 'visible' && hover,
          variable && 'cm-prompt-var hover:bg-violet-500/15',
          isHovered && 'ring-1 ring-current',
          // Pinned/hovered role: outline its spans so emphasis reads as a
          // deliberate highlight, not just "everything else dimmed".
          isEmphasized && !isHovered && 'ring-1 ring-current ring-offset-0',
        );

        // Variable click preempts the candidate click (more specific action);
        // hover/tooltip stay on the candidate so role context is still shown.
        const handlers =
          mode === 'visible'
            ? {
                onMouseEnter: onSpanEnter ? (e: React.MouseEvent<HTMLSpanElement>) => onSpanEnter(e, candidate) : undefined,
                onMouseLeave: onSpanLeave,
                onClick:
                  variable && onVariableClick
                    ? (e: React.MouseEvent<HTMLSpanElement>) =>
                        onVariableClick(e, variable, e.currentTarget)
                    : onSpanClick
                      ? (e: React.MouseEvent<HTMLSpanElement>) => onSpanClick(e, candidate)
                      : undefined,
              }
            : {};

        return (
          <span
            key={idx}
            data-span-idx={idx}
            data-var-name={variable?.name}
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
