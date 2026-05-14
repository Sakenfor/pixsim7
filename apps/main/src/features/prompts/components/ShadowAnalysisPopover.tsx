import clsx from 'clsx';

import type { OpExecuteOverlayEntry } from '@lib/api/promptOperations';
import { Icon } from '@lib/icons';

import type { PrimitiveProjectionHypothesis } from '../lib/parsePrimitiveMatch';
import type { PromptBlockCandidate } from '../types';

import { SpanInspectorBody } from './SpanInspectorBody';

/**
 * Anchored 260px popover chrome around the shared `SpanInspectorBody`.
 * The body knows nothing about anchoring; this wrapper only adds the
 * fixed-width rounded card and an optional detach button (passed through
 * to the body's `headerTrailing` slot).
 *
 * Detach behaviour lives in the caller: when the user clicks the detach
 * button, the composer dismisses this anchored popover and opens the
 * `prompt-span-inspector` workspace floating panel which subscribes to
 * `CAP_PROMPT_SPAN_FOCUS` for re-bind on next-candidate clicks.
 */

export interface ShadowAnalysisPopoverProps {
  candidate: PromptBlockCandidate;
  roleColors?: Record<string, string>;
  onAccept?: (hyp: PrimitiveProjectionHypothesis) => void;
  pendingBlockId?: string | null;
  onAcceptOpOutput?: (text: string, overlay: OpExecuteOverlayEntry) => void;
  /** When provided, a pin/expand icon appears in the header; clicking it
   *  fires `onDetach()` so the host can swap to the floating-panel surface. */
  onDetach?: () => void;
}

export function ShadowAnalysisPopover({
  candidate,
  roleColors,
  onAccept,
  pendingBlockId,
  onAcceptOpOutput,
  onDetach,
}: ShadowAnalysisPopoverProps) {
  const headerTrailing = onDetach ? (
    <button
      type="button"
      // Preserve focus so the popover doesn't dismiss before the click resolves
      onMouseDown={(e) => e.preventDefault()}
      onClick={onDetach}
      className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      title="Detach to floating panel"
      aria-label="Detach to floating panel"
    >
      <Icon name="maximize2" size={11} />
    </button>
  ) : undefined;

  return (
    <div
      className={clsx(
        'w-[260px] rounded-lg shadow-xl border overflow-hidden',
        'bg-white dark:bg-neutral-900',
        'border-neutral-200 dark:border-neutral-700',
      )}
    >
      <SpanInspectorBody
        candidate={candidate}
        roleColors={roleColors}
        onAccept={onAccept}
        pendingBlockId={pendingBlockId}
        onAcceptOpOutput={onAcceptOpOutput}
        headerTrailing={headerTrailing}
        compact
      />
    </div>
  );
}
