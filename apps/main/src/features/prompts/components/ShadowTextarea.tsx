/**
 * ShadowTextarea
 *
 * A prompt textarea with a highlight backdrop that shows colored role spans
 * from shadow analysis candidates. The textarea stays fully editable on top;
 * the highlight layer sits behind it with transparent textarea background.
 *
 * Scroll sync: the backdrop clips with overflow:hidden and an inner wrapper
 * shifts via transform:translateY(-scrollTop) on each scroll frame.
 *
 * Scrollbar compensation: the backdrop content gets paddingRight equal to the
 * textarea's scrollbar width so line wrapping stays pixel-aligned.
 *
 * Hover detection: on mousemove over the textarea, we temporarily disable its
 * pointer-events and use elementFromPoint to hit-test the backdrop spans
 * (which have pointer-events:auto). This surfaces hover/click without extra layers.
 */
import { Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  getPromptRoleBadgeClass,
  getPromptRoleLabel,
} from '@/lib/promptRoleUi';

import { buildCandidateSpans } from '../lib/buildCandidateSpans';
import {
  parsePrimitiveProjection,
  type PrimitiveProjectionHypothesis,
} from '../lib/parsePrimitiveMatch';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptBlockCandidate } from '../types';

import { PromptHighlightedSpans } from './PromptHighlightedSpans';
import { PromptSpanTooltip } from './PromptSpanTooltip';
import { TextareaBackdrop } from './TextareaBackdrop';

export interface ShadowTextareaProps {
  value: string;
  onChange: (val: string) => void;
  candidates: PromptBlockCandidate[];
  maxChars?: number;
  placeholder?: string;
  disabled?: boolean;
  variant?: 'default' | 'compact';
  showCounter?: boolean;
  resizable?: boolean;
  minHeight?: number;
  /** When set, candidates whose role !== emphasizedRole render at reduced
   *  opacity. Threaded from PromptAnalysisLayout's legend hover/pin state. */
  emphasizedRole?: string | null;
  /** Called when hover enters/leaves a candidate span */
  onCandidateHover?: (candidate: PromptBlockCandidate | null) => void;
  /** Called when a candidate span is clicked */
  onCandidateClick?: (candidate: PromptBlockCandidate) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Span Tooltip — extracted to ./PromptSpanTooltip so the inspector
// (PromptInlineViewer) renders identical metadata.
// ─────────────────────────────────────────────────────────────────────────────

interface TooltipData {
  candidate: PromptBlockCandidate;
  x: number;
  y: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Span Popover — click a span to see hypotheses (composer-only)
// ─────────────────────────────────────────────────────────────────────────────

interface PopoverState {
  anchor: HTMLElement;
  candidate: PromptBlockCandidate;
}

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

function SpanPopoverContent({
  candidate,
  roleColors,
}: {
  candidate: PromptBlockCandidate;
  roleColors?: Record<string, string>;
}) {
  const projection = parsePrimitiveProjection(candidate);

  return (
    <div
      className={clsx(
        'w-[260px] rounded-lg shadow-xl border overflow-hidden',
        'bg-white dark:bg-neutral-900',
        'border-neutral-200 dark:border-neutral-700',
      )}
    >
      {/* Header: text + role */}
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

      {/* Hypotheses list */}
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

      {/* Footer: confidence */}
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

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_CHARS = 800;

export function ShadowTextarea({
  value,
  onChange,
  candidates,
  maxChars = DEFAULT_MAX_CHARS,
  placeholder = 'Describe what you want to generate\u2026',
  disabled = false,
  variant = 'default',
  showCounter = true,
  resizable = false,
  minHeight,
  emphasizedRole = null,
  onCandidateHover,
  onCandidateClick,
}: ShadowTextareaProps) {
  const promptRoleColors = usePromptSettingsStore((s) => s.promptRoleColors);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef<number | null>(null);
  const scrollPosRef = useRef<number | null>(null);
  const isUserTypingRef = useRef(false);
  const hoverRafRef = useRef(0);

  const [hoveredSpanIdx, setHoveredSpanIdx] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  // Stable refs for optional callbacks
  const onCandidateHoverRef = useRef(onCandidateHover);
  onCandidateHoverRef.current = onCandidateHover;
  const onCandidateClickRef = useRef(onCandidateClick);
  onCandidateClickRef.current = onCandidateClick;

  const remaining = maxChars - value.length;
  const isOverLimit = remaining < 0;

  const defaultMinHeight = variant === 'compact' ? 70 : 110;
  const effectiveMinHeight = minHeight ?? defaultMinHeight;

  const spans = useMemo(
    () => buildCandidateSpans(value, candidates),
    [value, candidates],
  );

  const hasHighlights = candidates.some(
    (c) => typeof c.start_pos === 'number' && typeof c.end_pos === 'number',
  );

  // Scroll sync, scrollbar width, and font metric copying all live in
  // TextareaBackdrop now — see its render below.

  // ── Text input ──
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      cursorPosRef.current = e.target.selectionStart;
      scrollPosRef.current = e.target.scrollTop;
      isUserTypingRef.current = true;
      setPopover(null); // close popover — span positions are stale
      onChange(e.target.value);
    },
    [onChange],
  );

  // ── Hover detection via elementFromPoint ──
  // Temporarily hides textarea from hit-testing, probes backdrop spans.
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      cancelAnimationFrame(hoverRafRef.current);
      const { clientX, clientY } = e;

      hoverRafRef.current = requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const prev = textarea.style.pointerEvents;
        textarea.style.pointerEvents = 'none';
        const el = document.elementFromPoint(clientX, clientY);
        textarea.style.pointerEvents = prev;

        if (el instanceof HTMLElement && el.dataset.spanIdx) {
          const idx = parseInt(el.dataset.spanIdx, 10);
          const span = spans[idx];
          if (span?.candidate) {
            setHoveredSpanIdx(idx);
            setTooltip({ candidate: span.candidate, x: clientX, y: clientY });
            onCandidateHoverRef.current?.(span.candidate);
            return;
          }
        }

        setHoveredSpanIdx(null);
        setTooltip(null);
        onCandidateHoverRef.current?.(null);
      });
    },
    [spans],
  );

  const handleMouseLeave = useCallback(() => {
    cancelAnimationFrame(hoverRafRef.current);
    setHoveredSpanIdx(null);
    setTooltip(null);
    onCandidateHoverRef.current?.(null);
  }, []);

  // ── Click on candidate span → open popover ──
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const prev = textarea.style.pointerEvents;
      textarea.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      textarea.style.pointerEvents = prev;

      if (el instanceof HTMLElement && el.dataset.spanIdx) {
        const idx = parseInt(el.dataset.spanIdx, 10);
        const span = spans[idx];
        if (span?.candidate) {
          // Open popover anchored to the backdrop span element
          setPopover({ anchor: el, candidate: span.candidate });
          setTooltip(null);
          // Also fire external callback if wired
          onCandidateClickRef.current?.(span.candidate);
          return;
        }
      }

      // Clicked outside any span → close popover
      setPopover(null);
    },
    [spans],
  );

  const closePopover = useCallback(() => setPopover(null), []);

  // ── Restore cursor + scroll after value updates ──
  useLayoutEffect(() => {
    if (
      !isUserTypingRef.current ||
      cursorPosRef.current === null ||
      !textareaRef.current
    ) {
      return;
    }

    const textarea = textareaRef.current;
    const pos = cursorPosRef.current;
    const scrollPos = scrollPosRef.current;

    try {
      if (document.activeElement === textarea) {
        if (scrollPos !== null) textarea.scrollTop = scrollPos;
        const safePos = Math.min(pos, textarea.value.length);
        textarea.setSelectionRange(safePos, safePos);
        if (scrollPos !== null) textarea.scrollTop = scrollPos;
      }
    } catch {
      // Silently fail
    }

    isUserTypingRef.current = false;
    cursorPosRef.current = null;
    scrollPosRef.current = null;
  }, [value]);

  // ── Cleanup rAFs on unmount ──
  useLayoutEffect(() => {
    return () => {
      cancelAnimationFrame(hoverRafRef.current);
    };
  }, []);

  return (
    <div className={clsx('flex flex-col h-full')}>
      <div className="relative flex-1" style={{ minHeight: `${effectiveMinHeight}px` }}>
        {/* Highlight backdrop — scroll-sync, font metrics, and scrollbar
            compensation are handled by TextareaBackdrop. The actual span
            rendering (colors, opacity, underline, hover ring) lives in
            PromptHighlightedSpans, which is shared with PromptInlineViewer. */}
        <TextareaBackdrop textareaRef={textareaRef} active={hasHighlights} variant={variant}>
          <PromptHighlightedSpans
            spans={spans}
            roleColors={promptRoleColors}
            mode="backdrop"
            hoveredSpanIdx={hoveredSpanIdx}
            emphasizedRole={emphasizedRole}
          />
        </TextareaBackdrop>

        {/* Editable textarea on top */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onMouseMove={hasHighlights ? handleMouseMove : undefined}
          onMouseLeave={hasHighlights ? handleMouseLeave : undefined}
          onClick={hasHighlights ? handleClick : undefined}
          placeholder={placeholder}
          disabled={disabled}
          style={{ minHeight: `${effectiveMinHeight}px` }}
          className={clsx(
            'relative w-full h-full rounded border p-2 outline-none',
            hasHighlights
              ? 'bg-transparent'
              : 'bg-white dark:bg-neutral-900',
            disabled && 'opacity-60 cursor-not-allowed',
            variant === 'compact' ? 'text-sm' : 'text-base',
            resizable ? 'resize-y' : 'resize-none',
            isOverLimit
              ? 'border-red-500 dark:border-red-500 focus:ring-2 focus:ring-red-500/40'
              : 'border-neutral-300 dark:border-neutral-700 focus:ring-2 focus:ring-accent/40',
          )}
        />

        {/* Hover tooltip — hide when popover is open */}
        {tooltip && !popover && (
          <PromptSpanTooltip
            candidate={tooltip.candidate}
            x={tooltip.x}
            y={tooltip.y}
            roleColors={promptRoleColors}
          />
        )}

        {/* Click popover — hypotheses picker */}
        <Popover
          anchor={popover?.anchor ?? null}
          placement="bottom"
          align="start"
          offset={6}
          open={!!popover}
          onClose={closePopover}
        >
          {popover && (
            <SpanPopoverContent
              candidate={popover.candidate}
              roleColors={promptRoleColors}
            />
          )}
        </Popover>
      </div>

      {showCounter && (
        <div className="mt-1 flex justify-between items-center text-xs">
          {isOverLimit && (
            <span className="text-red-600 dark:text-red-400 font-medium">
              Over limit by {Math.abs(remaining)} chars
            </span>
          )}
          <span
            className={clsx(
              'tabular-nums ml-auto',
              isOverLimit
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : 'text-neutral-500',
            )}
          >
            {value.length} / {maxChars}
          </span>
        </div>
      )}
    </div>
  );
}
