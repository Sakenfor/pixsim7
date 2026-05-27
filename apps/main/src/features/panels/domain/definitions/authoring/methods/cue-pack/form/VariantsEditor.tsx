/**
 * VariantsEditor — list-edit-add-remove for a block's variants.
 *
 * Only the basic fields (key + text) are surfaced. Each variant's
 * advanced data (op_args, tags, ref_bindings, descriptors, ...) is
 * carried opaquely in `variant.extras` and round-tripped through
 * regen — but indicated to the user with a small "advanced" badge.
 */

import { useCallback } from 'react';

import type { VariantForm } from './types';

const SIMPLE_ID_RE = /^[a-z][a-z0-9_]*$/;

export interface VariantsEditorProps {
  variants: VariantForm[];
  onChange: (next: VariantForm[]) => void;
  disabled?: boolean;
}

export function VariantsEditor({ variants, onChange, disabled }: VariantsEditorProps) {
  const update = useCallback(
    (index: number, patch: Partial<VariantForm>) => {
      onChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
    },
    [variants, onChange],
  );

  const remove = useCallback(
    (index: number) => {
      onChange(variants.filter((_, i) => i !== index));
    },
    [variants, onChange],
  );

  const add = useCallback(() => {
    const usedKeys = new Set(variants.map((v) => v.key));
    let n = variants.length + 1;
    let candidate = `v${n}`;
    while (usedKeys.has(candidate)) {
      n += 1;
      candidate = `v${n}`;
    }
    onChange([...variants, { key: candidate, extras: {} }]);
  }, [variants, onChange]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          Variants ({variants.length})
        </span>
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
        >
          + Variant
        </button>
      </div>
      {variants.length === 0 && (
        <p className="text-[10px] text-neutral-500 italic">No variants — add at least one.</p>
      )}
      <div className="flex flex-col gap-1">
        {variants.map((variant, idx) => {
          const advancedCount = Object.keys(variant.extras ?? {}).length;
          const keyInvalid = variant.key && !SIMPLE_ID_RE.test(variant.key);
          return (
            <div
              key={idx}
              className="grid grid-cols-[120px_1fr_auto_auto] gap-1.5 items-center"
            >
              <input
                type="text"
                value={variant.key}
                onChange={(e) => update(idx, { key: e.target.value })}
                disabled={disabled}
                placeholder="key"
                spellCheck={false}
                className={`text-[11px] font-mono bg-neutral-950 border rounded px-1.5 py-0.5 text-neutral-200 focus:outline-none focus:border-neutral-600 ${
                  keyInvalid ? 'border-red-500/60' : 'border-neutral-800'
                }`}
                title={keyInvalid ? 'Must match ^[a-z][a-z0-9_]*$' : 'Variant key'}
              />
              <input
                type="text"
                value={variant.text ?? ''}
                onChange={(e) => update(idx, { text: e.target.value || undefined })}
                disabled={disabled}
                placeholder="text (optional)"
                className="text-[11px] bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-neutral-200 focus:outline-none focus:border-neutral-600"
              />
              <span
                className="text-[9px] text-amber-400/80 px-1 py-0.5 rounded bg-amber-950/40 min-w-[3.25rem] text-center"
                style={{ visibility: advancedCount > 0 ? 'visible' : 'hidden' }}
                title={
                  advancedCount > 0
                    ? `Preserves ${advancedCount} advanced field(s): ${Object.keys(variant.extras).join(', ')}`
                    : ''
                }
              >
                +{advancedCount} adv
              </span>
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={disabled}
                className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-800 text-neutral-400 hover:bg-red-950/40 hover:text-red-300 hover:border-red-500/40 disabled:opacity-40"
                title="Remove variant"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
