/**
 * TemplateSlotEditor — Single slot constraint editor
 *
 * Edits role, category, kind, tags, complexity range, optional toggle,
 * fallback text, and selection strategy. Shows live matching block count
 * via the previewSlot API. Collapsible to save space.
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
  packageNames?: string[];
  disabled?: boolean;
}

const ROLES = [
  'subject', 'character', 'placement', 'environment', 'style',
  'lighting', 'camera', 'composition',
  'action', 'setting', 'mood', 'romance', 'other',
];
const INTENTS = ['generate', 'preserve', 'modify', 'add', 'remove'];
const COMPLEXITY_LEVELS = ['simple', 'moderate', 'complex', 'very_complex'];
const SELECTION_STRATEGIES: Array<{ value: TemplateSlot['selection_strategy']; label: string }> = [
  { value: 'uniform', label: 'Uniform' },
  { value: 'weighted_rating', label: 'Weighted (rating)' },
  { value: 'weighted_tags', label: 'Weighted (tags)' },
  { value: 'diverse', label: 'Diverse' },
  { value: 'coherent_rerank', label: 'Coherent rerank' },
  { value: 'llm_rerank', label: 'LLM rerank' },
];

const selectCls =
  'w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 outline-none';
const inputCls =
  'w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none';

function toJsonTextarea(value: unknown): string {
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export function TemplateSlotEditor({
  slot,
  index,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  packageNames,
  disabled = false,
}: TemplateSlotEditorProps) {
  const [preview, setPreview] = useState<SlotPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const update = useCallback(
    (patch: Partial<TemplateSlot>) => {
      onChange(index, { ...slot, ...patch });
    },
    [index, onChange, slot],
  );

  const updateJsonObjectField = useCallback(
    (field: 'tags' | 'preferences' | 'selection_config', raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        update({ [field]: null } as Partial<TemplateSlot>);
        return;
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          update({ [field]: parsed } as Partial<TemplateSlot>);
        }
      } catch {
        // Keep current value; invalid JSON is ignored until the next valid blur.
      }
    },
    [update],
  );

  const isReinforcement = slot.kind === 'reinforcement' || slot.kind === 'audio_cue';

  // Debounced preview fetch (skip for reinforcement/audio_cue slots)
  useEffect(() => {
    if (isReinforcement) {
      setPreview(null);
      return;
    }
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
  }, [
    slot.role,
    slot.category,
    slot.kind,
    slot.package_name,
    slot.complexity_min,
    slot.complexity_max,
    slot.min_rating,
    JSON.stringify(slot.tags ?? null),
    JSON.stringify(slot.tag_constraints ?? null),
    isReinforcement,
  ]);

  // Summary line for collapsed state
  const summary = isReinforcement
    ? (slot.kind === 'audio_cue' ? 'audio cue' : 'reinforcement')
    : [slot.role, slot.category, slot.kind, slot.intent, slot.package_name]
        .filter(Boolean).join(' / ') || 'unconstrained';

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
      {/* Header — always visible */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-neutral-50 dark:bg-neutral-800/60 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <Icon
          name={collapsed ? 'chevronRight' : 'chevronDown'}
          size={12}
          className="text-neutral-400 shrink-0"
        />
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 shrink-0">
          #{index + 1}
        </span>
        <span className="text-sm text-neutral-700 dark:text-neutral-200 truncate flex-1">
          {slot.label || <span className="italic text-neutral-400">Untitled slot</span>}
        </span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate max-w-[140px]">
          {summary}
        </span>

        {/* Match count badge */}
        {preview != null && !previewLoading && (
          <span className={clsx(
            'text-[10px] tabular-nums px-1.5 py-0.5 rounded-full shrink-0',
            preview.count > 0
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
          )}>
            {preview.count}
          </span>
        )}
        {previewLoading && (
          <Icon name="refresh" size={10} className="animate-spin text-neutral-400 shrink-0" />
        )}

        {/* Action buttons — stop propagation so clicks don't toggle collapse */}
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {onMoveUp && (
            <button type="button" onClick={onMoveUp} disabled={disabled} className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-40" title="Move up">
              <Icon name="arrowUp" size={11} />
            </button>
          )}
          {onMoveDown && (
            <button type="button" onClick={onMoveDown} disabled={disabled} className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-40" title="Move down">
              <Icon name="arrowDown" size={11} />
            </button>
          )}
          <button type="button" onClick={() => onRemove(index)} disabled={disabled} className="p-1 rounded text-red-500/70 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 disabled:opacity-40" title="Remove slot">
            <Icon name="trash2" size={11} />
          </button>
        </div>
      </div>

      {/* Body — collapsible */}
      {!collapsed && (
        <div className="p-3 space-y-2 border-t border-neutral-100 dark:border-neutral-700/60">
          {/* Label + Kind — always visible */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="flex items-center gap-2">
              <Icon name="tag" size={11} className="text-neutral-400 shrink-0" />
              <input
                type="text"
                value={slot.label}
                onChange={(e) => update({ label: e.target.value })}
                placeholder="Slot label..."
                disabled={disabled}
                className="flex-1 text-sm px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35"
              />
            </label>
            <label className="space-y-0.5">
              <select
                value={slot.kind ?? ''}
                onChange={(e) => {
                  const kind = e.target.value || null;
                  const patch: Partial<TemplateSlot> = { kind };
                  // Auto-populate reinforcement_text when switching to audio_cue
                  if (kind === 'audio_cue' && !slot.reinforcement_text) {
                    patch.reinforcement_text = '{{actor}} {{actor.vocal_pleasure}}, {{actor.breath}}';
                    patch.inherit_intensity = true;
                  }
                  update(patch);
                }}
                disabled={disabled}
                className={selectCls}
              >
                <option value="">Any kind</option>
                <option value="single_state">single_state</option>
                <option value="transition">transition</option>
                <option value="reinforcement">reinforcement</option>
                <option value="audio_cue">audio cue</option>
              </select>
            </label>
          </div>

          {/* Reinforcement mode — textarea + intensity controls */}
          {isReinforcement && (
            <>
              <label className="space-y-0.5">
                <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                  <Icon name="repeat" size={9} /> Reinforcement text
                </span>
                <textarea
                  value={slot.reinforcement_text ?? ''}
                  onChange={(e) => update({ reinforcement_text: e.target.value || null })}
                  placeholder="e.g. {{actor}} {{actor.vocal_pleasure}}, {{actor.breath}}"
                  disabled={disabled}
                  rows={3}
                  className="w-full text-xs px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none resize-y focus:ring-2 focus:ring-blue-500/35"
                />
                <span className="text-[10px] text-neutral-400">
                  Use {'{{role.attr}}'} placeholders — graded lists resolve by intensity
                </span>
              </label>

              {/* Intensity controls */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={slot.inherit_intensity ?? false}
                    onChange={(e) => update({
                      inherit_intensity: e.target.checked,
                      intensity: e.target.checked ? null : slot.intensity,
                    })}
                    disabled={disabled}
                    className="rounded"
                  />
                  <span className="text-xs text-neutral-600 dark:text-neutral-300">Inherit intensity</span>
                </label>

                {!slot.inherit_intensity && (
                  <label className="flex items-center gap-2 flex-1">
                    <span className="text-[10px] text-neutral-500 shrink-0">
                      {slot.intensity != null ? slot.intensity : 'Random'}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={slot.intensity ?? 0}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        update({ intensity: v === 0 ? null : v });
                      }}
                      disabled={disabled}
                      className="flex-1 h-1 accent-blue-500"
                    />
                  </label>
                )}

                {slot.inherit_intensity && (
                  <span className="text-[10px] text-neutral-400 italic">
                    reads from previous block's tags
                  </span>
                )}
              </div>
            </>
          )}

          {/* Block-query fields — hidden for reinforcement */}
          {!isReinforcement && (
            <>
              {/* Constraint fields */}
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-0.5">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Icon name="user" size={9} /> Role
                  </span>
                  <select
                    value={slot.role ?? ''}
                    onChange={(e) => update({ role: e.target.value || null })}
                    disabled={disabled}
                    className={selectCls}
                  >
                    <option value="">Any</option>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Icon name="layers" size={9} /> Category
                  </span>
                  <input
                    type="text"
                    value={slot.category ?? ''}
                    onChange={(e) => update({ category: e.target.value || null })}
                    placeholder="e.g. entrance"
                    disabled={disabled}
                    className={inputCls}
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Icon name="target" size={9} /> Intent
                  </span>
                  <select
                    value={slot.intent ?? ''}
                    onChange={(e) => update({ intent: e.target.value || null })}
                    disabled={disabled}
                    className={selectCls}
                  >
                    <option value="">Any</option>
                    {INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Icon name="package" size={9} /> Package
                  </span>
                  {packageNames && packageNames.length > 0 ? (
                    <select
                      value={slot.package_name ?? ''}
                      onChange={(e) => update({ package_name: e.target.value || null })}
                      disabled={disabled}
                      className={selectCls}
                    >
                      <option value="">Any</option>
                      {packageNames.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={slot.package_name ?? ''}
                      onChange={(e) => update({ package_name: e.target.value || null })}
                      placeholder="e.g. bench_park"
                      disabled={disabled}
                      className={inputCls}
                    />
                  )}
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Icon name="sliders" size={9} /> Complexity min
                  </span>
                  <select
                    value={slot.complexity_min ?? ''}
                    onChange={(e) => update({ complexity_min: e.target.value || null })}
                    disabled={disabled}
                    className={selectCls}
                  >
                    <option value="">Any</option>
                    {COMPLEXITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Icon name="sliders" size={9} /> Complexity max
                  </span>
                  <select
                    value={slot.complexity_max ?? ''}
                    onChange={(e) => update({ complexity_max: e.target.value || null })}
                    disabled={disabled}
                    className={selectCls}
                  >
                    <option value="">Any</option>
                    {COMPLEXITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              </div>

              {/* Strategy + optional row */}
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <Icon name="shuffle" size={10} className="text-neutral-400" />
                  <select
                    value={slot.selection_strategy}
                    onChange={(e) => update({ selection_strategy: e.target.value as TemplateSlot['selection_strategy'] })}
                    disabled={disabled}
                    className="text-xs px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
                  >
                    {SELECTION_STRATEGIES.map((strategy) => (
                      <option key={strategy.value} value={strategy.value}>{strategy.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
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

              {/* Advanced structured fields (minimal JSON authoring) */}
              <details className="rounded border border-neutral-100 dark:border-neutral-700/60 p-2">
                <summary className="cursor-pointer text-[11px] text-neutral-500 dark:text-neutral-400 select-none">
                  Advanced Slot Filters & Selector Config
                </summary>
                <div className="mt-2 space-y-2">
                  <label className="space-y-0.5 block">
                    <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                      <Icon name="tag" size={9} /> Hard tags (JSON)
                    </span>
                    <textarea
                      key={`slot-tags-${index}-${toJsonTextarea(slot.tags)}`}
                      defaultValue={toJsonTextarea(slot.tags)}
                      onBlur={(e) => updateJsonObjectField('tags', e.target.value)}
                      placeholder={`{\n  "all_of": { "mood": "tense" },\n  "any_of": { "camera_angle": ["low", "dutch"] },\n  "none_of": { "atmosphere": ["surveillance"] }\n}`}
                      disabled={disabled}
                      rows={5}
                      className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none resize-y"
                    />
                    <span className="text-[10px] text-neutral-400">
                      Supports alias groups: <code>all_of</code>, <code>any_of</code>, <code>none_of</code>.
                    </span>
                  </label>

                  <label className="space-y-0.5 block">
                    <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                      <Icon name="shuffle" size={9} /> Preferences (JSON)
                    </span>
                    <textarea
                      key={`slot-pref-${index}-${toJsonTextarea(slot.preferences)}`}
                      defaultValue={toJsonTextarea(slot.preferences)}
                      onBlur={(e) => updateJsonObjectField('preferences', e.target.value)}
                      placeholder={`{\n  "boost_tags": { "perspective": "upward" },\n  "avoid_tags": { "cliche": ["yes"] },\n  "diversity_keys": ["camera_angle"],\n  "novelty_weight": 0.6\n}`}
                      disabled={disabled}
                      rows={5}
                      className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none resize-y"
                    />
                  </label>

                  <label className="space-y-0.5 block">
                    <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                      <Icon name="sliders" size={9} /> Selection config (JSON)
                    </span>
                    <textarea
                      key={`slot-selcfg-${index}-${toJsonTextarea(slot.selection_config)}`}
                      defaultValue={toJsonTextarea(slot.selection_config)}
                      onBlur={(e) => updateJsonObjectField('selection_config', e.target.value)}
                      placeholder={`{\n  "top_k": 12,\n  "temperature": 0.7,\n  "fallback_strategy": "weighted_tags",\n  "timeout_ms": 1200,\n  "weights": { "rating": 0.2, "diversity": 0.5 }\n}`}
                      disabled={disabled}
                      rows={6}
                      className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none resize-y"
                    />
                  </label>
                </div>
              </details>

              {/* Fallback text */}
              {slot.optional || (
                <label className="space-y-0.5">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Icon name="alertCircle" size={9} /> Fallback text (if no matches)
                  </span>
                  <input
                    type="text"
                    value={slot.fallback_text ?? ''}
                    onChange={(e) => update({ fallback_text: e.target.value || null })}
                    placeholder="Literal text to use..."
                    disabled={disabled}
                    className={inputCls}
                  />
                </label>
              )}

              {/* Preview */}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
