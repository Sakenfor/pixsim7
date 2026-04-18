/**
 * PromptGhostDiff — diff-highlight backdrop for the prompt textarea.
 *
 * Renders coloured spans behind transparent textarea text to show what
 * changed relative to a comparison snapshot.  Green = added, red +
 * strikethrough = removed, unchanged text is invisible.
 *
 * Opacity of the colour washes is driven by `stepDistance` so recent changes
 * are vivid and older ones fade out (exponential decay).
 *
 * Scroll sync, font-metric matching, and scrollbar-width compensation are
 * delegated to the shared `TextareaBackdrop` primitive.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';

import { diffPromptWithRanges, type DiffSegmentWithRange } from '../lib/promptDiff';

import { TextareaBackdrop } from './TextareaBackdrop';

// ── Opacity helpers ─────────────────────────────────────────────────────────

const OPACITY_MAX = 0.55;
const OPACITY_MIN = 0.08;
const DECAY = 0.75;

/** Map history step distance → [0..1] opacity for diff highlight washes. */
export function ghostOpacity(stepDistance: number): number {
  if (stepDistance <= 0) return 0;
  return OPACITY_MIN + (OPACITY_MAX - OPACITY_MIN) * DECAY ** (stepDistance - 1);
}

/** Above this changed-ratio we suppress the overlay — diff is too noisy. */
const MAX_DIFF_RATIO = 0.6;

// ── Types ───────────────────────────────────────────────────────────────────

export interface GhostDiffSource {
  /** The text to compare the current value against */
  comparisonText: string;
  /** How many history steps separate current from the comparison entry */
  stepDistance: number;
}

export interface PromptGhostDiffProps {
  /** Current prompt value (the "after" side of the diff) */
  value: string;
  /** Comparison source — null hides the ghost */
  source: GhostDiffSource | null;
  /** Ref to the textarea element for scroll sync and dimension matching */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Must match the textarea's variant so line-heights align. */
  variant?: 'default' | 'compact';
  /** Called when diff is suppressed (too big). Host can show a badge. */
  onSuppress?: (suppressed: boolean) => void;
  /** Called with the removed-segment text list so the host can surface it
      out-of-band (badge, tooltip, etc) — removes aren't rendered inline. */
  onRemovedSegments?: (removed: string[]) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function PromptGhostDiff({
  value,
  source,
  textareaRef,
  variant = 'default',
  onSuppress,
  onRemovedSegments,
}: PromptGhostDiffProps) {
  // ── Diff computation ──
  const segments: DiffSegmentWithRange[] = useMemo(() => {
    if (!source) return [];
    return diffPromptWithRanges(source.comparisonText, value);
  }, [source, value]);

  const hasChanges = useMemo(
    () => segments.some((s) => s.type !== 'keep'),
    [segments],
  );

  /** Fraction of segments that changed. Used to suppress noisy diffs. */
  const diffRatio = useMemo(() => {
    if (segments.length === 0) return 0;
    const changed = segments.filter((s) => s.type !== 'keep').length;
    return changed / segments.length;
  }, [segments]);

  const isTooNoisy = diffRatio > MAX_DIFF_RATIO;

  // Notify host of suppression state so it can show a badge
  const lastSuppressedRef = useRef(false);
  useLayoutEffect(() => {
    const suppressed = !!source && hasChanges && isTooNoisy;
    if (lastSuppressedRef.current !== suppressed) {
      lastSuppressedRef.current = suppressed;
      onSuppress?.(suppressed);
    }
  }, [source, hasChanges, isTooNoisy, onSuppress]);

  // Surface removed segments out-of-band — they aren't rendered inline
  // (would push alignment), so host widgets can show them as a badge or tooltip.
  const removedSegments = useMemo(
    () => segments.filter((s) => s.type === 'remove').map((s) => s.text),
    [segments],
  );
  const lastRemovedSigRef = useRef<string>('');
  useLayoutEffect(() => {
    const sig = removedSegments.join('\x1f');
    if (lastRemovedSigRef.current !== sig) {
      lastRemovedSigRef.current = sig;
      onRemovedSegments?.(removedSegments);
    }
  }, [removedSegments, onRemovedSegments]);

  const opacity = source ? ghostOpacity(source.stepDistance) : 0;
  const active = !!source && hasChanges && opacity > 0 && !isTooNoisy;

  const addRanges = useMemo(() => {
    const ranges = segments
      .filter(
        (segment): segment is DiffSegmentWithRange & { from: number; to: number } =>
          segment.type === 'add' &&
          typeof segment.from === 'number' &&
          typeof segment.to === 'number' &&
          segment.from < segment.to,
      )
      .map((segment) => ({ from: segment.from, to: segment.to }))
      .sort((a, b) => a.from - b.from);

    if (ranges.length <= 1) return ranges;

    // Coalesce overlaps/adjacent ranges so we render a minimal chunk set.
    const merged: Array<{ from: number; to: number }> = [ranges[0]];
    for (let i = 1; i < ranges.length; i += 1) {
      const current = ranges[i];
      const last = merged[merged.length - 1];
      if (current.from <= last.to) {
        last.to = Math.max(last.to, current.to);
      } else {
        merged.push(current);
      }
    }
    return merged;
  }, [segments]);

  const renderedChunks = useMemo(() => {
    // Render against the exact current text, slicing by add ranges. This
    // preserves all whitespace/newlines and prevents overlay drift.
    if (!active || addRanges.length === 0) {
      return value ? [{ type: 'keep' as const, text: value }] : [];
    }

    const chunks: Array<{ type: 'keep' | 'add'; text: string }> = [];
    let cursor = 0;
    for (const range of addRanges) {
      if (cursor < range.from) {
        chunks.push({ type: 'keep', text: value.slice(cursor, range.from) });
      }
      chunks.push({ type: 'add', text: value.slice(range.from, range.to) });
      cursor = range.to;
    }
    if (cursor < value.length) {
      chunks.push({ type: 'keep', text: value.slice(cursor) });
    }
    return chunks.filter((chunk) => chunk.text.length > 0);
  }, [active, addRanges, value]);

  // Removed segments are surfaced out-of-band. Inline rendering uses exact
  // slices of the current text so whitespace/layout always stays aligned.
  return (
    <TextareaBackdrop textareaRef={textareaRef} active={active} variant={variant}>
      {renderedChunks.map((chunk, i) => {
        if (chunk.type === 'add') {
          return (
            <span
              key={i}
              className="text-transparent rounded-sm"
              style={{ backgroundColor: `rgba(34, 197, 94, ${opacity})` }}
            >
              {chunk.text}
            </span>
          );
        }

        // 'keep' — occupies space but invisible (matches textarea flow)
        return (
          <span key={i} className="text-transparent">
            {chunk.text}
          </span>
        );
      })}
    </TextareaBackdrop>
  );
}
