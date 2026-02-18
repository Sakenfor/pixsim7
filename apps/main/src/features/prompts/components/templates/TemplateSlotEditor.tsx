/**
 * TemplateSlotEditor — Single slot constraint editor
 *
 * Edits role, category, kind, tags, complexity range, optional toggle,
 * fallback text, and selection strategy. Shows live matching block count
 * via the previewSlot API.
 */
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { TemplateSlot, SlotPreviewResult } from '@lib/api/blockTemplates';
import { previewSlot } from '@lib/api/blockTemplates';
import { Icon } from '@lib/icons';

import { PromptBlockRow } from '../shared/PromptBlockRow';

interface TemplateSlotEditorProps {
  slot: TemplateSlot;
  index: number;
  onChange: (index: number, slot: TemplateSlot) => void;
  onRemove: (index: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  disabled?: boolean;
}

const ROLES = ['character', 'action', 'setting', 'mood', 'romance', 'camera', 'other'];
const INTENTS = ['generate', 'preserve', 'modify', 'add', 'remove'];
const COMPLEXITY_LEVELS = ['simple', 'moderate', 'complex', 'very_complex'];

export function TemplateSlotEditor({
  slot,
  index,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  disabled = false,
}: TemplateSlotEditorProps) {
  const [preview, setPreview] = useState<SlotPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const update = useCallback(
    (patch: Partial<TemplateSlot>) => {
      onChange(index, { ...slot, ...patch });
    },
    [index, onChange, slot],
  );

  // Debounced preview fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const result = await previewSlot(slot, 3);
        setPreview(result);
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slot.role, slot.category, slot.kind, slot.package_name, slot.complexity_min, slot.complexity_max, slot.min_rating]);

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          #{index + 1}
        </span>
        <input
          type="text"
          value={slot.label}
          onChange={(e) => update({ label: e.target.value })}
          placeholder="Slot label..."
          disabled={disabled}
          className="flex-1 text-sm px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35"
        />
        <div className="flex items-center gap-1">
          {onMoveUp && (
            <button type="button" onClick={onMoveUp} disabled={disabled} className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-40" title="Move up">
              <Icon name="arrowUp" size={12} />
            </button>
          )}
          {onMoveDown && (
            <button type="button" onClick={onMoveDown} disabled={disabled} className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-40" title="Move down">
              <Icon name="arrowDown" size={12} />
            </button>
          )}
          <button type="button" onClick={() => onRemove(index)} disabled={disabled} className="p-1 rounded text-red-600 hover:text-red-700 dark:text-red-400 disabled:opacity-40" title="Remove slot">
            <Icon name="trash2" size={12} />
          </button>
        </div>
      </div>

      {/* Constraint fields */}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500">Role</span>
          <select
            value={slot.role ?? ''}
            onChange={(e) => update({ role: e.target.value || null })}
            disabled={disabled}
            className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          >
            <option value="">Any</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500">Category</span>
          <input
            type="text"
            value={slot.category ?? ''}
            onChange={(e) => update({ category: e.target.value || null })}
            placeholder="e.g. entrance"
            disabled={disabled}
            className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500">Kind</span>
          <select
            value={slot.kind ?? ''}
            onChange={(e) => update({ kind: e.target.value || null })}
            disabled={disabled}
            className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          >
            <option value="">Any</option>
            <option value="single_state">single_state</option>
            <option value="transition">transition</option>
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500">Intent</span>
          <select
            value={slot.intent ?? ''}
            onChange={(e) => update({ intent: e.target.value || null })}
            disabled={disabled}
            className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          >
            <option value="">Any</option>
            {INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500">Package</span>
          <input
            type="text"
            value={slot.package_name ?? ''}
            onChange={(e) => update({ package_name: e.target.value || null })}
            placeholder="e.g. bench_park"
            disabled={disabled}
            className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500">Complexity min</span>
          <select
            value={slot.complexity_min ?? ''}
            onChange={(e) => update({ complexity_min: e.target.value || null })}
            disabled={disabled}
            className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          >
            <option value="">Any</option>
            {COMPLEXITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500">Complexity max</span>
          <select
            value={slot.complexity_max ?? ''}
            onChange={(e) => update({ complexity_max: e.target.value || null })}
            disabled={disabled}
            className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          >
            <option value="">Any</option>
            {COMPLEXITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>

      {/* Strategy + optional row */}
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-[10px] text-neutral-500">Strategy</span>
          <select
            value={slot.selection_strategy}
            onChange={(e) => update({ selection_strategy: e.target.value as 'uniform' | 'weighted_rating' })}
            disabled={disabled}
            className="text-xs px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent"
          >
            <option value="uniform">Uniform</option>
            <option value="weighted_rating">Weighted (rating)</option>
          </select>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={slot.optional}
            onChange={(e) => update({ optional: e.target.checked })}
            disabled={disabled}
            className="rounded"
          />
          <span className="text-neutral-600 dark:text-neutral-300">Optional</span>
        </label>
      </div>

      {/* Fallback text */}
      {slot.optional || (
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500">Fallback text (if no matches)</span>
          <input
            type="text"
            value={slot.fallback_text ?? ''}
            onChange={(e) => update({ fallback_text: e.target.value || null })}
            placeholder="Literal text to use..."
            disabled={disabled}
            className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          />
        </label>
      )}

      {/* Preview */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
          {previewLoading ? (
            <Icon name="refresh" size={10} className="animate-spin" />
          ) : preview ? (
            <span className={clsx(preview.count === 0 && 'text-amber-600 dark:text-amber-400')}>
              {preview.count} matching block{preview.count === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {preview && preview.samples.length > 0 && (
          <div className="space-y-1">
            {preview.samples.map((s) => (
              <PromptBlockRow
                key={s.id}
                role={s.role}
                text={s.prompt_preview}
                maxChars={80}
                meta={s.block_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
