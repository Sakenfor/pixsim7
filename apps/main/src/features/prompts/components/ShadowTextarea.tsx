/**
 * ShadowTextarea
 *
 * A prompt textarea with a highlight backdrop that shows colored role spans
 * from shadow analysis candidates. The textarea stays fully editable on top;
 * the highlight layer sits behind it with transparent textarea background.
 *
 * Scroll sync: the backdrop clips with overflow:hidden and an inner wrapper
 * shifts via transform:translateY(-scrollTop) on each scroll frame.
 */
import clsx from 'clsx';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getPromptRoleInlineClasses } from '@/lib/promptRoleUi';

import { buildCandidateSpans } from '../lib/buildCandidateSpans';
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
}: ShadowTextareaProps) {
  const promptRoleColors = usePromptSettingsStore((s) => s.promptRoleColors);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef<number | null>(null);
  const scrollPosRef = useRef<number | null>(null);
  const isUserTypingRef = useRef(false);
  const rafRef = useRef(0);

  const [scrollY, setScrollY] = useState(0);

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

  // Sync scroll via rAF — sets transform on the inner content wrapper
  const syncScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const top = textareaRef.current?.scrollTop ?? 0;
      setScrollY(top);
    });
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      cursorPosRef.current = e.target.selectionStart;
      scrollPosRef.current = e.target.scrollTop;
      isUserTypingRef.current = true;
      onChange(e.target.value);
    },
    [onChange],
  );

  // Restore cursor + scroll after value updates
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

  // Cleanup rAF on unmount
  useLayoutEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
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

                const { bg } = getPromptRoleInlineClasses(span.candidate.role, promptRoleColors);
                return (
                  <span
                    key={idx}
                    className={clsx('rounded-sm', bg, 'text-transparent')}
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
