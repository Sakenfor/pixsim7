/**
 * PromptCompareSideBySide — popover that shows a diff between two prompts
 * picked from a list of available sources (current authoring prompt, viewer
 * media, pinned card, hovered card, or any recent history entry).
 *
 * Complements the inline ghost-diff overlay (`PromptGhostDiff`):
 *  - Inline overlay highlights *additions* in the textarea, hides removals
 *    (would push alignment) and self-suppresses when the diff is too noisy.
 *  - This popover renders the full text on both sides so users can inspect
 *    removals and noisy diffs that the overlay can't display, AND lets the
 *    user pair any two sources — e.g. history step −3 vs viewer media.
 *
 * Diff is computed twice — once in each direction — so we can collect
 * additions relative to each side's text. This reuses the well-tested
 * keep/add range path in both columns without depending on the unexported
 * `prevFrom`/`prevTo` runtime fields.
 */

import clsx from 'clsx';
import { useMemo } from 'react';

import { diffPromptWithRanges, type DiffSegmentWithRange } from '../lib/promptDiff';

export interface CompareSource {
  /** Stable id ("current", "viewer", "pinned", "hovered", "history-1", ...). */
  id: string;
  /** Human label shown in the source picker. */
  label: string;
  /** Resolved prompt text — empty string means no content for that source. */
  text: string;
}

export interface PromptCompareSideBySideProps {
  /** Available sources the user can pair. */
  sources: CompareSource[];
  /** Currently selected source id for the left column. */
  leftSourceId: string;
  /** Currently selected source id for the right column. */
  rightSourceId: string;
  onChangeLeftSource: (id: string) => void;
  onChangeRightSource: (id: string) => void;
  /** Diff granularity — defaults to 'fine' (word-level) when unspecified. */
  precision?: 'coarse' | 'fine';
}

interface ChangedRange {
  from: number;
  to: number;
}

interface RenderChunk {
  type: 'keep' | 'changed';
  text: string;
}

function mergeAddRanges(segments: DiffSegmentWithRange[]): ChangedRange[] {
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

  const merged: ChangedRange[] = [ranges[0]];
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
}

function buildChunks(text: string, changedRanges: ChangedRange[]): RenderChunk[] {
  if (!text) return [];
  if (changedRanges.length === 0) return [{ type: 'keep', text }];

  const chunks: RenderChunk[] = [];
  let cursor = 0;
  for (const range of changedRanges) {
    if (cursor < range.from) {
      chunks.push({ type: 'keep', text: text.slice(cursor, range.from) });
    }
    chunks.push({ type: 'changed', text: text.slice(range.from, range.to) });
    cursor = range.to;
  }
  if (cursor < text.length) {
    chunks.push({ type: 'keep', text: text.slice(cursor) });
  }
  return chunks.filter((chunk) => chunk.text.length > 0);
}

function SourceSelect({
  sources,
  value,
  onChange,
  ariaLabel,
}: {
  sources: CompareSource[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="text-xs bg-transparent border border-neutral-200 dark:border-neutral-700 rounded px-1 py-0.5 cursor-pointer text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {sources.map((source) => (
        <option key={source.id} value={source.id} disabled={!source.text}>
          {source.label}
          {!source.text ? ' (empty)' : ''}
        </option>
      ))}
    </select>
  );
}

function DiffColumn({
  text,
  changedRanges,
  highlightClass,
}: {
  text: string;
  changedRanges: ChangedRange[];
  highlightClass: string;
}) {
  const chunks = useMemo(() => buildChunks(text, changedRanges), [text, changedRanges]);

  if (chunks.length === 0) {
    return <div className="text-xs text-neutral-400 italic p-3">(empty)</div>;
  }

  return (
    <div className="p-3 max-h-[60vh] overflow-y-auto">
      <div className="text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700 dark:text-neutral-200 font-mono">
        {chunks.map((chunk, i) =>
          chunk.type === 'changed' ? (
            <span key={i} className={clsx('rounded-sm px-0.5', highlightClass)}>
              {chunk.text}
            </span>
          ) : (
            <span key={i}>{chunk.text}</span>
          ),
        )}
      </div>
    </div>
  );
}

export function PromptCompareSideBySide({
  sources,
  leftSourceId,
  rightSourceId,
  onChangeLeftSource,
  onChangeRightSource,
  precision = 'fine',
}: PromptCompareSideBySideProps) {
  const leftText = sources.find((s) => s.id === leftSourceId)?.text ?? '';
  const rightText = sources.find((s) => s.id === rightSourceId)?.text ?? '';
  const hasBothSides = leftText.trim().length > 0 && rightText.trim().length > 0;

  // Two diffs (one per direction) so each column gets add-ranges anchored
  // to its own text. mergeAddRanges coalesces touching ranges.
  const addsInRight = useMemo(() => {
    if (!hasBothSides) return [];
    return mergeAddRanges(diffPromptWithRanges(leftText, rightText, { precision }));
  }, [hasBothSides, leftText, rightText, precision]);

  const addsInLeft = useMemo(() => {
    if (!hasBothSides) return [];
    return mergeAddRanges(diffPromptWithRanges(rightText, leftText, { precision }));
  }, [hasBothSides, rightText, leftText, precision]);

  return (
    <div
      className={clsx(
        'w-[600px] max-w-[90vw] rounded-lg shadow-xl border overflow-hidden',
        'bg-white dark:bg-neutral-900',
        'border-neutral-200 dark:border-neutral-700',
      )}
    >
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
          Compare
        </span>
        <SourceSelect
          sources={sources}
          value={leftSourceId}
          onChange={onChangeLeftSource}
          ariaLabel="Left compare source"
        />
        <span className="text-xs text-neutral-500">vs</span>
        <SourceSelect
          sources={sources}
          value={rightSourceId}
          onChange={onChangeRightSource}
          ariaLabel="Right compare source"
        />
      </div>

      {sources.length === 0 ? (
        <div className="p-4 text-xs text-neutral-500 text-center">
          No comparison sources available — start typing or select/hover a media card.
        </div>
      ) : !hasBothSides ? (
        <div className="p-4 text-xs text-neutral-500 text-center">
          One of the selected sources is empty.
        </div>
      ) : (
        <div className="grid grid-cols-2 divide-x divide-neutral-200 dark:divide-neutral-700">
          <DiffColumn
            text={leftText}
            changedRanges={addsInLeft}
            highlightClass="bg-red-200/70 dark:bg-red-900/40 text-red-900 dark:text-red-200"
          />
          <DiffColumn
            text={rightText}
            changedRanges={addsInRight}
            highlightClass="bg-green-200/70 dark:bg-green-900/40 text-green-900 dark:text-green-200"
          />
        </div>
      )}
    </div>
  );
}
