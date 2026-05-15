/**
 * "Adjust" tab body for the prompt-composer span popover.
 *
 * Surfaces the op declaration of the selected primitive hypothesis as a
 * stack of `OpParamField`s + ref binders, calls the op-runtime executor
 * on param change (debounced), and shows the resolved prose as a live
 * dry-show preview. The "Generate & insert" button commits the previewed
 * text into the prompt's span.
 *
 * Phases 1 + 2 of plan:op-runtime-span-popover.
 *
 * Lifecycle: schema fetch is lazy via the parent (we mount only when the
 * Adjust tab is active). Executor calls cancel via a ref-tracked request
 * id so a slow request can't overwrite a faster successor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  executePromptOperation,
  type OpExecuteResponse,
} from '@lib/api/promptOperations';

import { useOpBlockSchema } from '../hooks/useOpBlockSchema';

import { OpParamField } from './OpParamField';
import { RefPickerField } from './pickers/RefPickerField';

const sectionLabelClass =
  'text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500';

const EXECUTE_DEBOUNCE_MS = 250;

export interface ShadowAnalysisPopoverAdjustTabProps {
  blockId: string;
  /** Current span text the user is about to overwrite. Shown in the
   *  preview as the "before" so the diff is visible at a glance. */
  currentSpanText: string;
  /** Bubbles up to PromptComposer to do the actual CM span replacement.
   *  When absent the Generate button is rendered as a Phase-1 stub. */
  onAccept?: (text: string, overlay: OpExecuteResponse['block_overlay']) => void;
}

export function ShadowAnalysisPopoverAdjustTab({
  blockId,
  currentSpanText,
  onAccept,
}: ShadowAnalysisPopoverAdjustTabProps) {
  const { schema, loading, error } = useOpBlockSchema(blockId);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [paramsSeeded, setParamsSeeded] = useState(false);
  // Phase 2b: ref bindings — keyed by op_ref.key, value is the canonical
  // token from RefPickerField (e.g. "asset:42", "character:anne_v3",
  // "role:entities:subject", "symbol:foo") or null when unbound.
  const [refs, setRefs] = useState<Record<string, string | null>>({});
  const [executeResult, setExecuteResult] = useState<OpExecuteResponse | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  // Monotonic request id so a slow earlier executor call can't overwrite
  // the result of a later one when it eventually returns.
  const executeRequestIdRef = useRef(0);

  // Seed param state from the variant's compiled defaults the first time
  // the schema lands. Without this the preview would render against the
  // user's empty tweaks rather than the variant's natural state.
  useEffect(() => {
    if (paramsSeeded || !schema?.op) return;
    const seed: Record<string, unknown> = {};
    for (const p of schema.op.params) {
      if (p.default !== undefined && p.default !== null) {
        seed[p.key] = p.default;
      }
    }
    setParams(seed);
    setParamsSeeded(true);
  }, [schema, paramsSeeded]);

  const op = schema?.op ?? null;

  // Debounced executor call. Fires once params have been seeded so the
  // initial fetch reflects the variant's natural prose, then again on
  // each tweak after the debounce settles. Refs are filtered to drop
  // null bindings so the backend only sees user-picked values.
  useEffect(() => {
    if (!op || !paramsSeeded) return;
    const requestId = ++executeRequestIdRef.current;
    setExecuting(true);
    setExecuteError(null);
    const refsPayload: Record<string, string> = {};
    for (const [k, v] of Object.entries(refs)) {
      if (typeof v === 'string' && v.length > 0) refsPayload[k] = v;
    }
    const handle = window.setTimeout(() => {
      void executePromptOperation({
        op_id: op.op_id,
        signature_id: op.signature_id ?? undefined,
        params,
        refs: refsPayload,
      })
        .then((result) => {
          if (executeRequestIdRef.current !== requestId) return;
          setExecuteResult(result);
        })
        .catch((err: unknown) => {
          if (executeRequestIdRef.current !== requestId) return;
          setExecuteError(err instanceof Error ? err.message : String(err));
          setExecuteResult(null);
        })
        .finally(() => {
          if (executeRequestIdRef.current !== requestId) return;
          setExecuting(false);
        });
    }, EXECUTE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // op.op_id / signature_id are stable for the schema's lifetime; we
    // re-fire when params or refs change once seeded.
  }, [op, paramsSeeded, params, refs]);

  const previewText = useMemo(
    () => executeResult?.prompt_text ?? '',
    [executeResult],
  );

  const handleAccept = useCallback(() => {
    if (!executeResult || !onAccept) return;
    onAccept(executeResult.prompt_text, executeResult.block_overlay);
  }, [executeResult, onAccept]);

  if (loading) {
    return (
      <div className="p-3 text-xs text-neutral-500 text-center">Loading op schema…</div>
    );
  }
  if (error) {
    return (
      <div className="p-3 text-xs text-rose-500 text-center">
        Failed to load schema: {error.message}
      </div>
    );
  }
  if (!schema) {
    return (
      <div className="p-3 text-xs text-neutral-500 text-center">
        Block not found in schema registry.
      </div>
    );
  }
  if (!op) {
    return (
      <div className="p-3 text-xs text-neutral-500 text-center">
        Surface-mode primitive — no op parameters to adjust.
      </div>
    );
  }

  const canAccept = !!executeResult && !!onAccept;
  const previewChanged = previewText && previewText !== currentSpanText;

  return (
    <div className="p-2 max-h-[420px] overflow-y-auto flex flex-col gap-2">
      <div className="flex items-baseline gap-2 px-1">
        <span className={sectionLabelClass}>Op</span>
        <span className="font-mono text-xs text-neutral-700 dark:text-neutral-300 truncate">
          {op.op_id}
        </span>
      </div>

      {op.params.length > 0 && (
        <div className="flex flex-col gap-2 px-1">
          {op.params.map((param) => (
            <OpParamField
              key={param.key}
              param={param}
              value={params[param.key]}
              onChange={(next) =>
                setParams((prev) => ({ ...prev, [param.key]: next }))
              }
            />
          ))}
        </div>
      )}

      {op.refs.length > 0 && (
        <div className="flex flex-col gap-1.5 px-1">
          <span className={sectionLabelClass}>Bindings</span>
          {op.refs.map((refSpec) => (
            <RefPickerField
              key={refSpec.key}
              capability={refSpec.capability}
              value={refs[refSpec.key] ?? null}
              onChange={(token) =>
                setRefs((prev) => ({ ...prev, [refSpec.key]: token }))
              }
              label={`${refSpec.key} (${refSpec.capability})`}
              required={refSpec.required}
            />
          ))}
        </div>
      )}

      {/* Preview block — current span vs executor output */}
      <div className="flex flex-col gap-1 px-1 pt-1 border-t border-neutral-200 dark:border-neutral-700">
        <span className={sectionLabelClass}>
          Preview
          {executing && (
            <span className="ml-2 text-neutral-400 normal-case">resolving…</span>
          )}
        </span>
        {executeError ? (
          <div className="text-xs text-rose-500">{executeError}</div>
        ) : (
          <div className="flex flex-col gap-1 text-xs">
            <div className="text-neutral-500 italic truncate" title={currentSpanText}>
              <span className="text-neutral-400">current:</span> &ldquo;{currentSpanText}&rdquo;
            </div>
            <div
              className={previewChanged
                ? 'text-violet-700 dark:text-violet-300'
                : 'text-neutral-500'}
              title={previewText}
            >
              <span className="text-neutral-400">→</span>{' '}
              {previewText ? (
                <span>&ldquo;{previewText}&rdquo;</span>
              ) : (
                <span className="italic text-neutral-400">(no output yet)</span>
              )}
            </div>
            {executeResult?.warnings && executeResult.warnings.length > 0 && (
              <ul className="text-[10px] text-amber-600 dark:text-amber-400 list-disc pl-4">
                {executeResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!canAccept || !previewText}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleAccept}
        className={
          canAccept && previewText
            ? 'mt-1 mx-1 px-2 py-1.5 rounded text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white cursor-pointer'
            : 'mt-1 mx-1 px-2 py-1.5 rounded text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-400 dark:text-violet-500 cursor-not-allowed'
        }
        title={
          !canAccept
            ? 'Accept handler not wired by the host popover'
            : !previewText
              ? 'Waiting for op execution to finish'
              : 'Replace the span with the previewed text'
        }
      >
        Generate &amp; insert
      </button>
    </div>
  );
}
