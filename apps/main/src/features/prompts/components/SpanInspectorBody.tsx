import clsx from 'clsx';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { OpExecuteOverlayEntry } from '@lib/api/promptOperations';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import { useOpBlockSchema } from '../hooks/useOpBlockSchema';
import { parsePrimitiveProjection, type PrimitiveProjectionHypothesis } from '../lib/parsePrimitiveMatch';
import type { PromptBlockCandidate } from '../types';

import { ShadowAnalysisPopoverAdjustTab } from './ShadowAnalysisPopoverAdjustTab';

/**
 * Shell-agnostic body for the span inspector. Consumed by both:
 * - `ShadowAnalysisPopover` — anchored 260px popover chrome
 * - `prompt-span-inspector` panel definition — detached workspace floating panel
 *
 * Anchored mode passes `compact` (default true) which caps the matches list
 * height; the floating panel passes `compact={false}` so the list grows with
 * the panel.
 */

function HypothesisRow({
  hyp,
  isProjectionDefault,
  isPreviewed,
  onPreview,
  isPending,
  isDisabled,
}: {
  hyp: PrimitiveProjectionHypothesis;
  /** Backend's chosen hypothesis (projection.selected_index). Marked with a checkmark. */
  isProjectionDefault: boolean;
  /** User has clicked this row to preview its replacement text. Highlighted. */
  isPreviewed: boolean;
  /** Click → set this row as previewed (no commit). Insert button below the
   *  list commits, mirroring Adjust's preview-then-insert pattern. */
  onPreview?: (hyp: PrimitiveProjectionHypothesis) => void;
  isPending?: boolean;
  isDisabled?: boolean;
}) {
  const interactive = !!onPreview && !isDisabled;
  const className = clsx(
    'flex items-center gap-2 px-2 py-1.5 rounded text-xs w-full text-left',
    isPreviewed
      ? 'bg-violet-100 dark:bg-violet-900/40 ring-1 ring-violet-400 dark:ring-violet-500'
      : interactive
        ? 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        : '',
    interactive && 'cursor-pointer',
    isDisabled && 'opacity-50 cursor-wait',
  );
  const inner = (
    <>
      <span
        className={clsx(
          'font-mono truncate flex-1',
          isPreviewed
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
        {isPending ? '…' : `${Math.round(hyp.score * 100)}%`}
      </span>
      {isProjectionDefault && (
        <span
          className="text-violet-400 dark:text-violet-500 flex-shrink-0"
          title="Backend's top match"
        >
          &#x2713;
        </span>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={className}
        // Preserve focus so the popover doesn't dismiss before the click
        // resolves; mirrors the canon for buttons inside portaled popovers.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPreview?.(hyp)}
        disabled={isDisabled}
        title={`Preview "${hyp.block_id}" before inserting`}
      >
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

const sectionLabelClass =
  'text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500';

/** Preview-then-insert footer for the Matches tab — mirrors the Adjust tab's
 *  preview block + Generate-and-insert button so the two tabs feel consistent.
 *  The schema fetch is module-cached (`useOpBlockSchema`); the eventual
 *  composer-side accept handler hits the same cache so there's no duplicate
 *  network round-trip. */
function MatchesPreviewFooter({
  previewedHyp,
  currentSpanText,
  pendingBlockId,
  onCommit,
  onClear,
}: {
  previewedHyp: PrimitiveProjectionHypothesis;
  currentSpanText: string;
  pendingBlockId?: string | null;
  onCommit: () => void;
  onClear: () => void;
}) {
  const { schema, loading, error } = useOpBlockSchema(previewedHyp.block_id);
  const previewText = schema?.text ?? '';
  const previewChanged = !!previewText && previewText !== currentSpanText;
  const isThisRowPending = pendingBlockId === previewedHyp.block_id;
  const canCommit = !!previewText && !isThisRowPending;

  return (
    <div className="px-2 py-2 border-t border-neutral-200 dark:border-neutral-700 flex flex-col gap-1.5 flex-shrink-0">
      <div className="flex items-center justify-between px-1">
        <span className={sectionLabelClass}>
          Preview
          {loading && (
            <span className="ml-1.5 text-neutral-400 normal-case">loading…</span>
          )}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
          className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          title="Clear preview"
        >
          clear
        </button>
      </div>
      {error ? (
        <div className="px-1 text-xs text-rose-500">{error.message}</div>
      ) : (
        <div className="px-1 flex flex-col gap-1 text-xs">
          <div className="text-neutral-500 italic truncate" title={currentSpanText}>
            <span className="text-neutral-400">current:</span> &ldquo;{currentSpanText}&rdquo;
          </div>
          <div
            className={previewChanged
              ? 'text-violet-700 dark:text-violet-300 truncate'
              : 'text-neutral-500 truncate'}
            title={previewText}
          >
            <span className="text-neutral-400">→</span>{' '}
            {previewText ? (
              <span>&ldquo;{previewText}&rdquo;</span>
            ) : (
              <span className="italic text-neutral-400">
                {loading ? '(resolving)' : '(empty)'}
              </span>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        disabled={!canCommit}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCommit}
        className={
          canCommit
            ? 'mx-1 px-2 py-1.5 rounded text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white cursor-pointer'
            : 'mx-1 px-2 py-1.5 rounded text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-400 dark:text-violet-500 cursor-not-allowed'
        }
        title={
          isThisRowPending
            ? 'Inserting…'
            : !previewText
              ? 'Waiting for schema fetch to finish'
              : 'Replace the span with the previewed text'
        }
      >
        {isThisRowPending ? 'Inserting…' : 'Insert'}
      </button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        'flex-1 px-2 py-1 text-[11px] font-medium border-b-2',
        active
          ? 'border-violet-500 text-violet-700 dark:text-violet-300'
          : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200',
      )}
    >
      {children}
    </button>
  );
}

export interface SpanInspectorBodyProps {
  candidate: PromptBlockCandidate;
  roleColors?: Record<string, string>;
  /** When provided, hypothesis rows become clickable and fire onAccept with
   *  the chosen hypothesis. Phase 0 of the op-runtime-span-popover plan. */
  onAccept?: (hyp: PrimitiveProjectionHypothesis) => void;
  /** When set, the matching hypothesis row shows a pending indicator and the
   *  whole list is disabled (single in-flight accept at a time). */
  pendingBlockId?: string | null;
  /** Phase 2: replaces the candidate's span with the executor's resolved
   *  prose. Receives `(text, overlay)` so the host can stamp provenance
   *  into the prompt's persisted block_overlay (Phase 2b will consume it). */
  onAcceptOpOutput?: (text: string, overlay: OpExecuteOverlayEntry) => void;
  /** Optional header trailing slot (e.g. detach button in anchored chrome).
   *  Rendered inside the role/category header row, right-aligned. */
  headerTrailing?: ReactNode;
  /** Compact: caps matches list at 200px (anchored popover default).
   *  When false, matches list flexes to fill available height (floating panel). */
  compact?: boolean;
}

type InspectorTab = 'matches' | 'adjust';

export function SpanInspectorBody({
  candidate,
  roleColors,
  onAccept,
  pendingBlockId,
  onAcceptOpOutput,
  headerTrailing,
  compact = true,
}: SpanInspectorBodyProps) {
  const projection = parsePrimitiveProjection(candidate);
  const isPending = !!pendingBlockId;

  const selectedHypothesis =
    projection &&
    projection.selected_index !== null &&
    projection.selected_index >= 0 &&
    projection.selected_index < projection.hypotheses.length
      ? projection.hypotheses[projection.selected_index]
      : null;
  // Adjust tab is only meaningful when the selected match is op-backed.
  // Phase 1: surface the tab; Phase 2 wires the executor and turns the
  // disabled "Generate & insert" button live.
  const adjustAvailable = !!selectedHypothesis?.op?.op_id;
  const [activeTab, setActiveTab] = useState<InspectorTab>('matches');

  // Preview-then-insert state for the Matches tab. Clicking a row sets it as
  // previewed (no commit); the footer's Insert button calls onAccept(). Reset
  // when the user clicks a different span (candidate identity change).
  const [previewedHyp, setPreviewedHyp] = useState<PrimitiveProjectionHypothesis | null>(null);
  useEffect(() => {
    setPreviewedHyp(null);
  }, [candidate]);
  const handlePreview = useCallback((hyp: PrimitiveProjectionHypothesis) => {
    setPreviewedHyp((prev) => (prev?.block_id === hyp.block_id ? prev : hyp));
  }, []);
  const handleClearPreview = useCallback(() => setPreviewedHyp(null), []);
  const handleCommitPreview = useCallback(() => {
    if (!previewedHyp || !onAccept) return;
    onAccept(previewedHyp);
    // The composer-side accept handler clears focusedCandidate on success,
    // which unmounts the floating-panel body. We still clear local state in
    // case the host keeps the body mounted (e.g., the anchored popover for a
    // failed accept that retries — onAccept's catch path leaves things open).
    setPreviewedHyp(null);
  }, [previewedHyp, onAccept]);

  return (
    <div className={clsx('flex flex-col h-full overflow-hidden')}>
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0">
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
          {headerTrailing && <span className="ml-auto flex-shrink-0">{headerTrailing}</span>}
        </div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400 truncate italic">
          &ldquo;{candidate.text}&rdquo;
        </div>
      </div>

      {adjustAvailable && (
        <div className="flex border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0">
          <TabButton active={activeTab === 'matches'} onClick={() => setActiveTab('matches')}>
            Matches
          </TabButton>
          <TabButton active={activeTab === 'adjust'} onClick={() => setActiveTab('adjust')}>
            Adjust
          </TabButton>
        </div>
      )}

      {activeTab === 'adjust' && selectedHypothesis ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ShadowAnalysisPopoverAdjustTab
            blockId={selectedHypothesis.block_id}
            currentSpanText={candidate.text}
            onAccept={onAcceptOpOutput}
          />
        </div>
      ) : projection && projection.hypotheses.length > 0 ? (
        <>
          <div
            className={clsx(
              'p-1.5 overflow-y-auto',
              // When previewing, shrink the cap a bit so the footer fits
              // inside the same anchored 260px popover height.
              compact
                ? previewedHyp
                  ? 'max-h-[140px]'
                  : 'max-h-[200px]'
                : 'flex-1 min-h-0',
            )}
          >
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 px-2 py-1">
              Matches ({projection.hypotheses.length})
            </div>
            {projection.hypotheses.map((hyp, i) => (
              <HypothesisRow
                key={hyp.block_id}
                hyp={hyp}
                isProjectionDefault={i === projection.selected_index}
                isPreviewed={previewedHyp?.block_id === hyp.block_id}
                onPreview={onAccept ? handlePreview : undefined}
                isPending={pendingBlockId === hyp.block_id}
                isDisabled={isPending}
              />
            ))}
          </div>
          {previewedHyp && onAccept && (
            <MatchesPreviewFooter
              previewedHyp={previewedHyp}
              currentSpanText={candidate.text}
              pendingBlockId={pendingBlockId}
              onCommit={handleCommitPreview}
              onClear={handleClearPreview}
            />
          )}
        </>
      ) : (
        <div className="p-3 text-xs text-neutral-500 text-center">
          {projection?.status === 'no_signal'
            ? 'No primitives matched this text'
            : projection?.status === 'suppressed'
              ? `Suppressed: ${projection.suppression_reason ?? 'threshold'}`
              : 'No projection data'}
        </div>
      )}

      {typeof candidate.confidence === 'number' && (
        <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-[10px] text-neutral-500 flex-shrink-0">
          <span>Confidence</span>
          <span className="tabular-nums font-medium">
            {Math.round(candidate.confidence * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
