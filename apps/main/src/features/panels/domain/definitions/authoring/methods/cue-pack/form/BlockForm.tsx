/**
 * BlockForm — basic-fields editor for a single block.
 *
 * Surfaces: id, group, id_prefix, mode, role, category,
 * text_template, and the variants list. Advanced block-level
 * fields (capabilities, op, tags, descriptors, ...) are
 * preserved opaquely and indicated with a badge.
 */

import { useCallback } from 'react';

import type { BlockForm, BlockMode } from './types';
import { VariantsEditor } from './VariantsEditor';

const SIMPLE_ID_RE = /^[a-z][a-z0-9_]*$/;
const DOTTED_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

const MODES: Array<{ value: BlockMode; label: string }> = [
  { value: 'surface', label: 'surface (text)' },
  { value: 'hybrid', label: 'hybrid' },
  { value: 'op', label: 'op' },
];

export interface BlockFormProps {
  block: BlockForm;
  onChange: (next: BlockForm) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

export function BlockFormCard({ block, onChange, onRemove, disabled }: BlockFormProps) {
  const update = useCallback(
    (patch: Partial<BlockForm>) => onChange({ ...block, ...patch }),
    [block, onChange],
  );

  const advancedKeys = Object.keys(block.extras ?? {}).filter(
    (k) => k !== '__pack_block_extras__',
  );
  const advancedCount = advancedKeys.length;
  const idInvalid = block.id && !SIMPLE_ID_RE.test(block.id);
  const prefixInvalid = block.idPrefix && !DOTTED_ID_RE.test(block.idPrefix);

  return (
    <div className="rounded border border-neutral-800 bg-neutral-950/40 p-2.5 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 grid grid-cols-2 gap-1.5">
          <LabeledInput
            label="id"
            value={block.id}
            onChange={(v) => update({ id: v })}
            placeholder="block_id (snake_case)"
            invalid={Boolean(idInvalid)}
            invalidHint="Must match ^[a-z][a-z0-9_]*$"
            disabled={disabled}
          />
          <LabeledInput
            label="id_prefix"
            value={block.idPrefix}
            onChange={(v) => update({ idPrefix: v })}
            placeholder="pack.block (dotted)"
            invalid={Boolean(prefixInvalid)}
            invalidHint="Must be a dotted id (a.b.c)"
            disabled={disabled}
          />
          <LabeledInput
            label="role"
            value={block.role ?? ''}
            onChange={(v) => update({ role: v || undefined })}
            placeholder="subject / camera / …"
            disabled={disabled}
          />
          <LabeledInput
            label="category"
            value={block.category ?? ''}
            onChange={(v) => update({ category: v || undefined })}
            placeholder="(optional)"
            disabled={disabled}
          />
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-neutral-500">mode</label>
            <select
              value={block.mode ?? 'surface'}
              onChange={(e) => update({ mode: e.target.value as BlockMode })}
              disabled={disabled}
              className="text-[11px] bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-neutral-200 focus:outline-none focus:border-neutral-600"
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <LabeledInput
            label="group"
            value={block.group ?? ''}
            onChange={(v) => update({ group: v || undefined })}
            placeholder="(optional)"
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col items-end gap-1">
          {advancedCount > 0 && (
            <span
              className="text-[9px] text-amber-400/80 px-1.5 py-0.5 rounded bg-amber-950/40"
              title={`Preserves ${advancedCount} advanced field(s): ${advancedKeys.join(', ')}`}
            >
              +{advancedCount} adv preserved
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-800 text-neutral-400 hover:bg-red-950/40 hover:text-red-300 hover:border-red-500/40 disabled:opacity-40"
              title="Remove block"
            >
              ✕ Remove
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <label className="text-[9px] uppercase tracking-wider text-neutral-500">
          text_template
        </label>
        <textarea
          value={block.textTemplate ?? ''}
          onChange={(e) => update({ textTemplate: e.target.value || undefined })}
          rows={2}
          disabled={disabled}
          spellCheck={false}
          placeholder="(optional) e.g. Angle token: {variant}."
          className="text-[11px] bg-neutral-950 border border-neutral-800 rounded px-1.5 py-1 text-neutral-200 font-mono resize-y focus:outline-none focus:border-neutral-600"
        />
      </div>

      <VariantsEditor
        variants={block.variants}
        onChange={(variants) => update({ variants })}
        disabled={disabled}
      />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

interface LabeledInputProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  invalid?: boolean;
  invalidHint?: string;
  disabled?: boolean;
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  invalid,
  invalidHint,
  disabled,
}: LabeledInputProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[9px] uppercase tracking-wider text-neutral-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        className={`text-[11px] font-mono bg-neutral-950 border rounded px-1.5 py-0.5 text-neutral-200 focus:outline-none focus:border-neutral-600 ${
          invalid ? 'border-red-500/60' : 'border-neutral-800'
        }`}
        title={invalid ? invalidHint : undefined}
      />
    </div>
  );
}
