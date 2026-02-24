/**
 * ChainStepEditor — Editor for a single chain step.
 *
 * Shows template picker, operation override, input wiring, and guidance
 * inheritance toggles inside a collapsible DisclosureSection.
 */
import { DisclosureSection } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback } from 'react';

import type { BlockTemplateSummary } from '@lib/api/blockTemplates';
import type { ChainStepDefinition, GuidanceInheritFlags } from '@lib/api/chains';
import { Icon } from '@lib/icons';

import { OPERATION_TYPES } from '@/types/operations';

interface ChainStepEditorProps {
  step: ChainStepDefinition;
  index: number;
  totalSteps: number;
  templates: BlockTemplateSummary[];
  allStepIds: string[];
  onChange: (index: number, step: ChainStepDefinition) => void;
  onRemove: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

const GUIDANCE_INHERIT_KEYS: Array<{ key: keyof GuidanceInheritFlags; label: string }> = [
  { key: 'references', label: 'References' },
  { key: 'regions', label: 'Regions' },
  { key: 'masks', label: 'Masks' },
  { key: 'constraints', label: 'Constraints' },
];

export function ChainStepEditor({
  step,
  index,
  totalSteps,
  templates,
  allStepIds,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ChainStepEditorProps) {
  const templateName = templates.find((t) => t.id === step.template_id)?.name ?? '';

  const update = useCallback(
    (patch: Partial<ChainStepDefinition>) => {
      onChange(index, { ...step, ...patch });
    },
    [index, step, onChange],
  );

  const toggleGuidanceInherit = useCallback(
    (key: keyof GuidanceInheritFlags) => {
      const current = step.guidance_inherit ?? {};
      update({
        guidance_inherit: { ...current, [key]: !current[key] },
      });
    },
    [step.guidance_inherit, update],
  );

  const headerLabel = (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-mono text-neutral-400 shrink-0">
        #{index + 1}
      </span>
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200 truncate">
        {step.label || `Step ${index + 1}`}
      </span>
      {templateName && (
        <span className="text-[10px] text-neutral-400 truncate">
          {templateName}
        </span>
      )}
    </div>
  );

  // Available step IDs for input_from (all steps before this one)
  const inputFromOptions = allStepIds.slice(0, index);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg">
      <DisclosureSection label={headerLabel} defaultOpen={index === 0}>
        <div className="p-3 space-y-3">
          {/* Step label */}
          <div>
            <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
              Label
            </label>
            <input
              type="text"
              value={step.label ?? ''}
              onChange={(e) => update({ label: e.target.value || null })}
              placeholder={`Step ${index + 1}`}
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
            />
          </div>

          {/* Template picker */}
          <div>
            <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
              Template
            </label>
            <select
              value={step.template_id}
              onChange={(e) => update({ template_id: e.target.value })}
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
            >
              <option value="">Select a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slot_count} slots)
                </option>
              ))}
            </select>
          </div>

          {/* Operation override */}
          <div>
            <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
              Operation (optional override)
            </label>
            <select
              value={step.operation ?? ''}
              onChange={(e) => update({ operation: e.target.value || null })}
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
            >
              <option value="">Default (from chain)</option>
              {OPERATION_TYPES.map((op) => (
                <option key={op} value={op}>
                  {op.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Input from */}
          {index > 0 && (
            <div>
              <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
                Input from
              </label>
              <select
                value={step.input_from ?? ''}
                onChange={(e) => update({ input_from: e.target.value || null })}
                className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
              >
                <option value="">Previous step (default)</option>
                {inputFromOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Guidance inheritance toggles */}
          {index > 0 && (
            <div>
              <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-1">
                Guidance Inheritance
              </label>
              <div className="flex flex-wrap gap-2">
                {GUIDANCE_INHERIT_KEYS.map(({ key, label }) => {
                  const active = step.guidance_inherit?.[key] ?? false;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleGuidanceInherit(key)}
                      className={clsx(
                        'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                        active
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:border-neutral-400',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step actions */}
          <div className="flex items-center justify-between pt-1 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMoveUp(index)}
                disabled={index === 0}
                className="p-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 disabled:opacity-30"
                title="Move up"
              >
                <Icon name="arrowUp" size={12} />
              </button>
              <button
                type="button"
                onClick={() => onMoveDown(index)}
                disabled={index === totalSteps - 1}
                className="p-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 disabled:opacity-30"
                title="Move down"
              >
                <Icon name="arrowDown" size={12} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="p-1 rounded text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
              title="Remove step"
            >
              <Icon name="trash2" size={12} />
            </button>
          </div>
        </div>
      </DisclosureSection>
    </div>
  );
}
