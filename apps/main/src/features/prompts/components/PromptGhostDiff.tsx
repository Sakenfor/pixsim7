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

import type { DiffSegment } from '../lib/promptDiff';
import { diffPrompt } from '../lib/promptDiff';

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
  const segments: DiffSegment[] = useMemo(() => {
    if (!source) return [];
    return diffPrompt(source.comparisonText, value);
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

  // Only render keep + add spans in the backdrop.  Removed segments are
  // content that isn't in the textarea — rendering them inline would push
  // adjacent highlights off alignment.  Use `diffPrompt()` in a sibling view
  // (history popover, badge) if you need to surface removed text.
  return (
    <TextareaBackdrop textareaRef={textareaRef} active={active} variant={variant}>
      {segments.map((seg, i) => {
        if (seg.type === 'remove') return null;

        if (seg.type === 'add') {
          return (
            <span
              key={i}
              className="text-transparent rounded-sm"
              style={{ backgroundColor: `rgba(34, 197, 94, ${opacity})` }}
            >
              {seg.text}
            </span>
          );
        }

        // 'keep' — occupies space but invisible (matches textarea flow)
        return (
          <span key={i} className="text-transparent">
            {seg.text}
          </span>
        );
      })}
    </TextareaBackdrop>
  );
}
