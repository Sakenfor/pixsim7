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
  getPromptRoleInlineClasses,
  getPromptRoleLabel,
} from '@/lib/promptRoleUi';

import { buildCandidateSpans } from '../lib/buildCandidateSpans';
import { parsePrimitiveMatch } from '../lib/parsePrimitiveMatch';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptBlockCandidate } from '../types';

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
  /** Called when hover enters/leaves a candidate span */
  onCandidateHover?: (candidate: PromptBlockCandidate | null) => void;
  /** Called when a candidate span is clicked */
  onCandidateClick?: (candidate: PromptBlockCandidate) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Span Tooltip
// ─────────────────────────────────────────────────────────────────────────────

interface TooltipData {
  candidate: PromptBlockCandidate;
  x: number;
  y: number;
}

function SpanTooltip({
  data,
  roleColors,
}: {
  data: TooltipData;
  roleColors?: Record<string, string>;
}) {
  const { candidate, x, y } = data;
  const pm = parsePrimitiveMatch(candidate.metadata);

  return (
    <div
      className={clsx(
        'fixed z-[100] px-2.5 py-1.5 rounded-lg shadow-lg border text-xs',
        'bg-neutral-900/95 dark:bg-neutral-100/95',
        'text-white dark:text-neutral-900',
        'border-neutral-700 dark:border-neutral-300',
        'pointer-events-none max-w-[280px]',
      )}
      style={{ left: x, top: y + 12 }}
    >
      {/* Role + category */}
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0',
            getPromptRoleBadgeClass(candidate.role, roleColors),
          )}
        />
        <span className="font-medium">
          {getPromptRoleLabel(candidate.role)}
        </span>
        {candidate.category && (
          <span className="text-neutral-400 dark:text-neutral-500">
            / {candidate.category}
          </span>
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
          <span className="text-violet-400 dark:text-violet-600 font-mono">
            {pm.block_id}
          </span>
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
  onCandidateHover,
  onCandidateClick,
}: ShadowTextareaProps) {
  const promptRoleColors = usePromptSettingsStore((s) => s.promptRoleColors);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef<number | null>(null);
  const scrollPosRef = useRef<number | null>(null);
  const isUserTypingRef = useRef(false);
  const rafRef = useRef(0);
  const hoverRafRef = useRef(0);

  const [scrollY, setScrollY] = useState(0);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const [hoveredSpanIdx, setHoveredSpanIdx] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

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

  // ── Scrollbar width measurement ──
  // Textarea scrollbar reduces content width; compensate on backdrop.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const measure = () => {
      setScrollbarWidth(textarea.offsetWidth - textarea.clientWidth);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(textarea);
    return () => ro.disconnect();
  }, []);

  // Re-measure when content changes (scrollbar may appear/disappear)
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    setScrollbarWidth(textarea.offsetWidth - textarea.clientWidth);
  }, [value]);

  // ── Scroll sync ──
  const syncScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setScrollY(textareaRef.current?.scrollTop ?? 0);
    });
  }, []);

  // ── Text input ──
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      cursorPosRef.current = e.target.selectionStart;
      scrollPosRef.current = e.target.scrollTop;
      isUserTypingRef.current = true;
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

  // ── Click on candidate span ──
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      if (!onCandidateClickRef.current) return;

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
          onCandidateClickRef.current(span.candidate);
        }
      }
    },
    [spans],
  );

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
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(hoverRafRef.current);
    };
  }, []);

  return (
    <div className={clsx('flex flex-col h-full')}>
      <div className="relative flex-1" style={{ minHeight: `${effectiveMinHeight}px` }}>
        {/* Highlight backdrop — clips overflow, inner content shifts via transform */}
        {hasHighlights && (
          <div
            aria-hidden
            className={clsx(
              'absolute inset-0 rounded border border-transparent p-2',
              'overflow-hidden pointer-events-none',
            )}
          >
            <div
              ref={contentRef}
              className={clsx(
                'whitespace-pre-wrap break-words',
                variant === 'compact' ? 'text-sm' : 'text-base',
              )}
              style={{
                transform: `translateY(-${scrollY}px)`,
                paddingRight: scrollbarWidth > 0 ? `${scrollbarWidth}px` : undefined,
                fontFamily: 'inherit',
                lineHeight: 'inherit',
                letterSpacing: 'inherit',
                wordSpacing: 'inherit',
              }}
            >
              {spans.map((span, idx) => {
                if (!span.candidate) {
                  return (
                    <span key={idx} className="text-transparent">
                      {span.text}
                    </span>
                  );
                }

                const { bg } = getPromptRoleInlineClasses(
                  span.candidate.role,
                  promptRoleColors,
                );
                const isHovered = hoveredSpanIdx === idx;

                return (
                  <span
                    key={idx}
                    data-span-idx={idx}
                    className={clsx(
                      'rounded-sm text-transparent',
                      bg,
                      isHovered && 'ring-1 ring-current opacity-90',
                    )}
                    style={{ pointerEvents: 'auto' }}
                  >
                    {span.text}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Editable textarea on top */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onScroll={syncScroll}
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

        {/* Hover tooltip */}
        {tooltip && (
          <SpanTooltip data={tooltip} roleColors={promptRoleColors} />
        )}
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
