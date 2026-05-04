/**
 * PromptGhostDiff - diff-highlight backdrop for the prompt textarea.
 *
 * Green spans represent additions in current text.
 * Red dot markers represent deletions from comparison text.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';

import {
  diffPromptWithRanges,
  type DiffPromptRangeOptions,
  type DiffSegmentWithRange,
} from '../lib/promptDiff';

import { TextareaBackdrop } from './TextareaBackdrop';

const OPACITY_MAX = 0.55;
const OPACITY_MIN = 0.08;
const DECAY = 0.75;

function ghostOpacity(stepDistance: number): number {
  if (stepDistance <= 0) return 0;
  return OPACITY_MIN + (OPACITY_MAX - OPACITY_MIN) * DECAY ** (stepDistance - 1);
}

const MAX_DIFF_RATIO = 0.6;

export interface GhostDiffSource {
  comparisonText: string;
  stepDistance: number;
}

export interface PromptGhostDiffProps {
  value: string;
  source: GhostDiffSource | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  variant?: 'default' | 'compact';
  onSuppress?: (suppressed: boolean) => void;
  onRemovedSegments?: (removed: string[]) => void;
  onReplaceRange?: (payload: { from: number; to: number; replaceWith: string }) => void;
  precision?: DiffPromptRangeOptions['precision'];
}

export function PromptGhostDiff({
  value,
  source,
  textareaRef,
  variant = 'default',
  onSuppress,
  onRemovedSegments,
  onReplaceRange,
  precision = 'coarse',
}: PromptGhostDiffProps) {
  const segments: DiffSegmentWithRange[] = useMemo(() => {
    if (!source) return [];
    return diffPromptWithRanges(source.comparisonText, value, { precision });
  }, [source, value, precision]);

  const hasChanges = useMemo(() => segments.some((s) => s.type !== 'keep'), [segments]);

  const diffRatio = useMemo(() => {
    if (segments.length === 0) return 0;
    const changed = segments.filter((s) => s.type !== 'keep').length;
    return changed / segments.length;
  }, [segments]);

  const isTooNoisy = diffRatio > MAX_DIFF_RATIO;

  const lastSuppressedRef = useRef(false);
  useLayoutEffect(() => {
    const suppressed = !!source && hasChanges && isTooNoisy;
    if (lastSuppressedRef.current !== suppressed) {
      lastSuppressedRef.current = suppressed;
      onSuppress?.(suppressed);
    }
  }, [source, hasChanges, isTooNoisy, onSuppress]);

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
    if (!source) return [] as Array<{ from: number; to: number; compareText: string }>;
    return segments
      .filter(
        (segment): segment is DiffSegmentWithRange & { from: number; to: number } =>
          segment.type === 'add' &&
          typeof segment.from === 'number' &&
          typeof segment.to === 'number' &&
          segment.from < segment.to,
      )
      .map((segment) => {
        const compareText =
          typeof segment.prevFrom === 'number' && typeof segment.prevTo === 'number'
            ? source.comparisonText.slice(segment.prevFrom, segment.prevTo)
            : '';
        return { from: segment.from, to: segment.to, compareText };
      })
      .sort((a, b) => a.from - b.from);
  }, [segments, source]);

  const removeMarkers = useMemo(() => {
    const markers: Array<{ at: number; text: string }> = [];
    let cursor = 0;
    for (const segment of segments) {
      if (segment.type === 'remove') {
        markers.push({ at: cursor, text: segment.text });
        continue;
      }
      if (typeof segment.to === 'number') {
        cursor = segment.to;
      } else if (typeof segment.from === 'number') {
        cursor = segment.from + segment.text.length;
      } else {
        cursor += segment.text.length;
      }
    }
    return markers;
  }, [segments]);

  const renderedChunks = useMemo(() => {
    if (!active || (addRanges.length === 0 && removeMarkers.length === 0)) {
      return value ? [{ type: 'keep' as const, text: value }] : [];
    }

    const chunks: Array<
      | { type: 'keep'; text: string }
      | { type: 'add'; text: string; from: number; to: number; compareText: string }
      | { type: 'remove'; at: number; text: string }
    > = [];

    let cursor = 0;
    let addIndex = 0;
    let removeIndex = 0;

    while (addIndex < addRanges.length || removeIndex < removeMarkers.length) {
      const nextAddFrom =
        addIndex < addRanges.length ? addRanges[addIndex].from : Number.POSITIVE_INFINITY;
      const nextRemoveAt =
        removeIndex < removeMarkers.length
          ? removeMarkers[removeIndex].at
          : Number.POSITIVE_INFINITY;
      const nextPos = Math.min(nextAddFrom, nextRemoveAt);

      if (cursor < nextPos) {
        chunks.push({ type: 'keep', text: value.slice(cursor, nextPos) });
        cursor = nextPos;
      }

      while (removeIndex < removeMarkers.length && removeMarkers[removeIndex].at === nextPos) {
        chunks.push({
          type: 'remove',
          at: removeMarkers[removeIndex].at,
          text: removeMarkers[removeIndex].text,
        });
        removeIndex += 1;
      }

      while (addIndex < addRanges.length && addRanges[addIndex].from === nextPos) {
        const range = addRanges[addIndex];
        chunks.push({
          type: 'add',
          text: value.slice(range.from, range.to),
          from: range.from,
          to: range.to,
          compareText: range.compareText,
        });
        cursor = Math.max(cursor, range.to);
        addIndex += 1;
      }
    }

    if (cursor < value.length) {
      chunks.push({ type: 'keep', text: value.slice(cursor) });
    }

    return chunks.filter((chunk) => chunk.text.length > 0);
  }, [active, addRanges, removeMarkers, value]);

  return (
    <TextareaBackdrop textareaRef={textareaRef} active={active} variant={variant}>
      {renderedChunks.map((chunk, i) => {
        if (chunk.type === 'add') {
          return (
            <span
              key={i}
              className="text-transparent rounded-sm pointer-events-auto cursor-pointer"
              style={{ backgroundColor: `rgba(34, 197, 94, ${opacity})` }}
              title={
                chunk.compareText.length > 0
                  ? `Compare: ${chunk.compareText}\nClick to replace this chunk`
                  : 'Compare: (empty)\nClick to remove this chunk'
              }
              onMouseDown={(event) => {
                event.preventDefault();
                onReplaceRange?.({
                  from: chunk.from,
                  to: chunk.to,
                  replaceWith: chunk.compareText,
                });
              }}
            >
              {chunk.text}
            </span>
          );
        }

        if (chunk.type === 'remove') {
          return (
            <span
              key={i}
              className="relative inline-block w-0 overflow-visible pointer-events-auto cursor-pointer align-middle"
              title={`Removed: ${chunk.text}\nClick to restore this chunk`}
              onMouseDown={(event) => {
                event.preventDefault();
                onReplaceRange?.({
                  from: chunk.at,
                  to: chunk.at,
                  replaceWith: chunk.text,
                });
              }}
            >
              <span className="absolute -left-1 top-[0.7em] -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 shadow-sm ring-1 ring-white/80 dark:ring-neutral-900/80" />
            </span>
          );
        }

        return (
          <span key={i} className="text-transparent">
            {chunk.text}
          </span>
        );
      })}
    </TextareaBackdrop>
  );
}
