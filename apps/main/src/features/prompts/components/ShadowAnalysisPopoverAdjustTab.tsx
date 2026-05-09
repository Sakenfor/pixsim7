/**
 * "Adjust" tab body for the prompt-composer span popover.
 *
 * Surfaces the op declaration of the selected primitive hypothesis as a
 * stack of `OpParamField`s + ref binders. In Phase 1 the "Generate &
 * insert" action is rendered but disabled — Phase 2 wires the backend op
 * executor and actually emits prose.
 *
 * Lifecycle: schema fetch is lazy; the parent only mounts this component
 * when the user switches to the Adjust tab. Repeated mounts hit the
 * module-level cache in `useOpBlockSchema`.
 */
import { useEffect, useState } from 'react';

import type { BlockOpRefSchema } from '@lib/api/blockTemplates';

import { useOpBlockSchema } from '../hooks/useOpBlockSchema';
import { OpParamField } from './OpParamField';

const sectionLabelClass =
  'text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500';

function RefBindingRow({ ref: refSpec }: { ref: BlockOpRefSchema }) {
  // Phase 1: ref binders are display-only; Phase 2 swaps this for an
  // inline AssetPickerField so the user can resolve `subject` etc.
  return (
    <div
      className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-neutral-50 dark:bg-neutral-800/60"
      title="Ref binding via asset picker lands in Phase 2"
    >
      <span className="font-mono text-neutral-700 dark:text-neutral-300">{refSpec.key}</span>
      <span className="text-neutral-400">→</span>
      <span className="text-neutral-500 truncate">{refSpec.capability}</span>
      {refSpec.required && <span className="text-rose-500">*</span>}
    </div>
  );
}

export interface ShadowAnalysisPopoverAdjustTabProps {
  blockId: string;
}

export function ShadowAnalysisPopoverAdjustTab({ blockId }: ShadowAnalysisPopoverAdjustTabProps) {
  const { schema, loading, error } = useOpBlockSchema(blockId);
  // Local param values, seeded from the variant's resolved defaults the
  // first time the schema arrives. Storing here keeps the tweaks live in
  // the popover without leaking state up to PromptComposer (Phase 2 will
  // bubble these into an op-execute payload at submit time).
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [paramsSeeded, setParamsSeeded] = useState(false);

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
  if (!schema.op) {
    return (
      <div className="p-3 text-xs text-neutral-500 text-center">
        Surface-mode primitive — no op parameters to adjust.
      </div>
    );
  }

  const op = schema.op;
  return (
    <div className="p-2 max-h-[320px] overflow-y-auto flex flex-col gap-2">
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
        <div className="flex flex-col gap-1 px-1">
          <span className={sectionLabelClass}>Bindings</span>
          {op.refs.map((refSpec) => (
            <RefBindingRow key={refSpec.key} ref={refSpec} />
          ))}
        </div>
      )}

      <button
        type="button"
        disabled
        className="mt-1 mx-1 px-2 py-1.5 rounded text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-400 dark:text-violet-500 cursor-not-allowed"
        title="Phase 2 lands the backend op executor"
      >
        Generate &amp; insert (Phase 2)
      </button>
    </div>
  );
}
