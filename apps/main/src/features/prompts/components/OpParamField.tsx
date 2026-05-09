/**
 * Schema-driven param widget for op-backed prompt blocks.
 *
 * Renders a single labeled control (text / number / boolean / enum / ref)
 * driven by a `BlockOpParamSchema` declaration. Mirrors the shape of the
 * hardcoded `QuickParamField` table in `PromptToolsPanel` so Phase 3 can
 * reuse this component when ops gain a panel-level config surface.
 *
 * Phase 1 of plan:op-runtime-span-popover.
 *
 * Notes:
 * - `ref` type is rendered as a read-only placeholder for now. Phase 2
 *   wires it through to `AssetPickerField` for live entity binding.
 * - Number / integer types both use `<input type=number>`; integer
 *   coerces on change.
 * - The label uses `description` when present, falling back to `key`.
 */
import clsx from 'clsx';

import type { BlockOpParamSchema } from '@lib/api/blockTemplates';

export interface OpParamFieldProps {
  param: BlockOpParamSchema;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}

const labelClass = 'text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400';
const inputClass = clsx(
  'w-full px-2 py-1 rounded text-xs',
  'bg-neutral-100 dark:bg-neutral-800',
  'border border-neutral-200 dark:border-neutral-700',
  'text-neutral-900 dark:text-neutral-100',
  'focus:outline-none focus:ring-1 focus:ring-violet-400 dark:focus:ring-violet-500',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

export function OpParamField({ param, value, onChange, disabled }: OpParamFieldProps) {
  const labelText = param.description?.trim() || param.key;

  if (param.type === 'enum' && param.enum && param.enum.length > 0) {
    const current = typeof value === 'string' ? value : '';
    return (
      <label className="flex flex-col gap-0.5">
        <span className={labelClass}>
          {labelText}
          {param.required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
        <select
          className={inputClass}
          value={current}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          // Preserve focus inside portaled popovers.
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!param.required && <option value="">—</option>}
          {param.enum.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (param.type === 'boolean') {
    const current = value === true;
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={current}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-neutral-300 dark:border-neutral-600 disabled:opacity-50"
        />
        <span className="text-xs text-neutral-700 dark:text-neutral-300">{labelText}</span>
      </label>
    );
  }

  if (param.type === 'number' || param.type === 'integer') {
    const current = typeof value === 'number' ? String(value) : '';
    const isInt = param.type === 'integer';
    return (
      <label className="flex flex-col gap-0.5">
        <span className={labelClass}>
          {labelText}
          {param.required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
        <input
          type="number"
          className={inputClass}
          value={current}
          disabled={disabled}
          min={param.minimum ?? undefined}
          max={param.maximum ?? undefined}
          step={isInt ? 1 : 'any'}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(undefined);
              return;
            }
            const parsed = isInt ? parseInt(raw, 10) : parseFloat(raw);
            if (!Number.isFinite(parsed)) return;
            onChange(parsed);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </label>
    );
  }

  if (param.type === 'ref') {
    // Phase 1 stub: surfaces the declared ref capability so the user knows
    // what's wanted, but binding live to an asset waits for Phase 2.
    const current = typeof value === 'string' ? value : '';
    return (
      <label className="flex flex-col gap-0.5">
        <span className={labelClass}>
          {labelText} <span className="text-neutral-400">(ref)</span>
          {param.required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
        <input
          type="text"
          className={inputClass}
          value={current}
          disabled={disabled}
          placeholder={
            param.ref_capability ? `bind to ${param.ref_capability}…` : 'asset id…'
          }
          onChange={(e) => onChange(e.target.value || undefined)}
          onMouseDown={(e) => e.stopPropagation()}
          title="Ref binding via asset picker lands in Phase 2"
        />
      </label>
    );
  }

  // string (default)
  const current = typeof value === 'string' ? value : '';
  return (
    <label className="flex flex-col gap-0.5">
      <span className={labelClass}>
        {labelText}
        {param.required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      <input
        type="text"
        className={inputClass}
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </label>
  );
}
