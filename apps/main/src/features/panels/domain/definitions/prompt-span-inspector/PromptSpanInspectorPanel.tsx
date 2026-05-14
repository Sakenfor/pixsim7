import type { PromptBlockCandidate } from '@pixsim7/shared.types/prompt';
import { useMemo } from 'react';

import type { OpExecuteOverlayEntry } from '@lib/api/promptOperations';

import {
  CAP_PROMPT_SPAN_FOCUS,
  useCapability,
  type PromptSpanFocusContext,
} from '@features/contextHub';
import { SpanInspectorBody } from '@features/prompts/components/SpanInspectorBody';
import type { PrimitiveProjectionHypothesis } from '@features/prompts/lib/parsePrimitiveMatch';

/**
 * Detached host for the span inspector. Subscribes to CAP_PROMPT_SPAN_FOCUS
 * (published by the composer) and forwards the focused candidate + callbacks
 * into the shared `SpanInspectorBody`.
 *
 * Re-bind is automatic: when the user clicks a different candidate in the
 * composer, the published value updates and this panel re-renders against
 * the new candidate. No imperative refresh needed.
 *
 * Lifecycle: this panel is opened via `useWorkspaceStore.openFloatingPanel('prompt-span-inspector', ...)`
 * by the composer's anchored popover detach button. It survives outside-clicks
 * (workspace floating-panel system handles persistence + focus) and closes
 * only when the user clicks the panel's X. When no candidate is focused
 * (initial mount before user clicks a span, or after a successful accept
 * clears the focus), an empty-state message renders.
 */
export function PromptSpanInspectorPanel() {
  const { value: focus } = useCapability<PromptSpanFocusContext>(CAP_PROMPT_SPAN_FOCUS);

  // Cast back to the strict types — capability layer carries them as `unknown`
  // to keep contextHub feature-independent (see capabilities.ts comment).
  const candidate = (focus?.candidate ?? null) as PromptBlockCandidate | null;
  const onAccept = focus?.onAccept as
    | ((hyp: PrimitiveProjectionHypothesis) => void)
    | undefined;
  const onAcceptOpOutput = focus?.onAcceptOpOutput as
    | ((text: string, overlay: OpExecuteOverlayEntry) => void)
    | undefined;

  const empty = useMemo(
    () => (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div className="text-xs text-neutral-500 dark:text-neutral-400 max-w-xs">
          Click a highlighted span in the prompt composer to inspect its primitive
          matches and tweak op parameters here.
        </div>
      </div>
    ),
    [],
  );

  if (!candidate) return empty;

  return (
    <SpanInspectorBody
      candidate={candidate}
      roleColors={focus?.roleColors}
      onAccept={onAccept}
      pendingBlockId={focus?.pendingBlockId ?? null}
      onAcceptOpOutput={onAcceptOpOutput}
      compact={false}
    />
  );
}
