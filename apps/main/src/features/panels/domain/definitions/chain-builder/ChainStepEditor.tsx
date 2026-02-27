/**
 * ChainStepEditor — Editor for a single chain step.
 *
 * Shows template picker, operation override, input wiring, and guidance
 * inheritance toggles inside a collapsible DisclosureSection.
 */
import { DisclosureSection } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';

import type { BlockTemplateSummary } from '@lib/api/blockTemplates';
import type { ChainStepDefinition, GuidanceInheritFlags } from '@lib/api/chains';
import type { ParamSpec } from '@lib/generation-ui';
import { Icon } from '@lib/icons';

import { AdvancedSettingsPopover } from '@features/generation/components/AdvancedSettingsPopover';
import { GenerationParamControls } from '@features/generation/components/generationSettingsPanel/GenerationParamControls';
import {
  filterQuickGenStyleParamSpecs,
  getQuickGenStyleAdvancedParamSpecs,
} from '@features/generation/components/generationSettingsPanel/generationParamFilters';
import { ProviderIconButton } from '@features/generation/components/generationSettingsPanel/ProviderIconButton';
import { useProviderAccounts, useProviderCapability, useProviderIdForModel, useProviders, useUnlimitedModels } from '@features/providers';

import { OPERATION_TYPES } from '@/types/operations';

interface ChainStepEditorProps {
  step: ChainStepDefinition;
  index: number;
  totalSteps: number;
  templates: BlockTemplateSummary[];
  allStepIds: string[];
  onChange: (index: number, step: ChainStepDefinition) => void;
  onDuplicate: (index: number) => void;
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
const SETTINGS_PATCH_EXCLUDE_PARAMS = new Set([
  'prompt',
  'prompts',
  'negative_prompt',
  'image_url',
  'image_urls',
  'video_url',
  'original_video_id',
  'source_asset_id',
  'source_asset_ids',
  'composition_assets',
]);

export function ChainStepEditor({
  step,
  index,
  totalSteps,
  templates,
  allStepIds,
  onChange,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ChainStepEditorProps) {
  const templateName = templates.find((t) => t.id === step.template_id)?.name ?? '';
  const isPromptStep = step.prompt != null && !(step.template_id ?? '').trim();
  const promptPreview = (step.prompt ?? '').trim();
  const [showReusableSettingsEditor, setShowReusableSettingsEditor] = useState(false);

  const baseParamsOverrides = (step.params_overrides && typeof step.params_overrides === 'object' && !Array.isArray(step.params_overrides))
    ? (step.params_overrides as Record<string, any>)
    : {};
  const dynamicParams = step.preferred_account_id != null
    ? { ...baseParamsOverrides, preferred_account_id: step.preferred_account_id }
    : baseParamsOverrides;
  const explicitProviderOverride = (step.provider_id ?? '').trim() || undefined;
  const inferredProviderFromModel = useProviderIdForModel(dynamicParams.model as string | undefined);
  const providerForSpecs = explicitProviderOverride ?? inferredProviderFromModel ?? 'pixverse';
  const { providers } = useProviders();
  const { capability } = useProviderCapability(providerForSpecs);
  const rawOperation = (step.operation ?? 'text_to_image') as string;
  const hasNativeImageToImageSpec = !!capability?.operation_specs?.image_to_image;
  const effectiveOperationForSpecs =
    rawOperation === 'image_to_image' && !hasNativeImageToImageSpec
      ? 'image_to_video'
      : rawOperation;
  const operationSpecs = (capability?.operation_specs ?? {}) as Record<string, { parameters?: ParamSpec[] }>;
  const allParamSpecs = operationSpecs[effectiveOperationForSpecs]?.parameters ?? [];
  const filteredParamSpecs = useMemo(
    () => filterQuickGenStyleParamSpecs(allParamSpecs, rawOperation, SETTINGS_PATCH_EXCLUDE_PARAMS),
    [allParamSpecs, rawOperation],
  );
  const advancedParamSpecs = useMemo(
    () => getQuickGenStyleAdvancedParamSpecs(filteredParamSpecs),
    [filteredParamSpecs],
  );
  const { accounts: allAccounts } = useProviderAccounts(providerForSpecs);
  const activeAccounts = useMemo(
    () => allAccounts.filter((a) => a.status === 'active'),
    [allAccounts],
  );
  const unlimitedModels = useUnlimitedModels(step.preferred_account_id ?? undefined, providerForSpecs);
  const settingsOverrideCount =
    Object.keys(baseParamsOverrides).length
    + (step.preferred_account_id != null ? 1 : 0)
    + ((step.provider_id ?? '').trim() ? 1 : 0);

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

  const handleSettingsParamChange = useCallback((name: string, value: any) => {
    if (name === 'preferred_account_id') {
      const nextPatch = { ...baseParamsOverrides };
      if (value === undefined || value === null || value === '') {
        update({
          preferred_account_id: null,
          params_overrides: Object.keys(nextPatch).length > 0 ? nextPatch : null,
        });
        return;
      }
      const n = Number(value);
      update({
        preferred_account_id: Number.isFinite(n) ? n : null,
        params_overrides: Object.keys(nextPatch).length > 0 ? nextPatch : null,
      });
      return;
    }

    const next = { ...baseParamsOverrides };
    if (value === undefined || value === null || value === '') {
      delete next[name];
    } else {
      next[name] = value;
    }
    update({ params_overrides: Object.keys(next).length > 0 ? next : null });
  }, [baseParamsOverrides, update]);

  const headerLabel = (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-mono text-neutral-400 shrink-0">
        #{index + 1}
      </span>
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200 truncate">
        {step.label || `Step ${index + 1}`}
      </span>
      {isPromptStep && promptPreview && (
        <span className="text-[10px] text-neutral-400 truncate">
          {promptPreview}
        </span>
      )}
      {!isPromptStep && templateName && (
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
          {/* Step type */}
          <div>
            <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-1">
              Step Type
            </label>
            <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 p-0.5 bg-neutral-50 dark:bg-neutral-900/40">
              <button
                type="button"
                onClick={() => update({ prompt: null })}
                className={clsx(
                  'text-[10px] px-2 py-0.5 rounded transition-colors',
                  !isPromptStep
                    ? 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
                )}
              >
                Template
              </button>
              <button
                type="button"
                onClick={() => update({ template_id: '', prompt: step.prompt ?? '' })}
                className={clsx(
                  'text-[10px] px-2 py-0.5 rounded transition-colors',
                  isPromptStep
                    ? 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
                )}
              >
                Prompt
              </button>
            </div>
          </div>

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

          {/* Template picker / inline prompt */}
          {!isPromptStep ? (
            <div>
              <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
                Template
              </label>
              <select
                value={step.template_id}
                onChange={(e) => update({ template_id: e.target.value, prompt: null })}
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
          ) : (
            <div>
              <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
                Prompt
              </label>
              <textarea
                value={step.prompt ?? ''}
                onChange={(e) => update({ template_id: '', prompt: e.target.value })}
                rows={3}
                placeholder="Describe this generation step (inline prompt)"
                className="w-full text-xs px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none resize-y"
              />
              <div className="mt-1 text-[10px] text-neutral-400">
                Simple mode: runs this step with a direct prompt instead of rolling a block template.
              </div>
            </div>
          )}

          {/* Operation override */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
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
            <div>
              <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
                Repeat
              </label>
              <input
                type="number"
                min={1}
                max={64}
                value={step.repeat_count ?? 1}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const next = Number.isFinite(raw) ? Math.max(1, Math.min(64, Math.floor(raw))) : 1;
                  update({ repeat_count: next <= 1 ? null : next });
                }}
                className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
                title="Repeat this step sequentially (later iterations use the previous iteration output as input)"
              />
            </div>
          </div>

          {/* Asset input source */}
          {index > 0 && (
            <div>
              <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
                Asset Input Source
              </label>
              <select
                value={step.input_from ?? ''}
                onChange={(e) => update({ input_from: e.target.value || null })}
                className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
              >
                <option value="">Previous step (default)</option>
                {inputFromOptions.map((id) => (
                  <option key={id} value={id}>
                    Step output: {id}
                  </option>
                ))}
                <option value="__external_asset__" disabled>
                  External asset (coming soon)
                </option>
              </select>
              <div className="mt-1 text-[10px] text-neutral-400">
                Chooses which asset output this step consumes. Prompt/template content is configured separately above.
              </div>
            </div>
          )}
          {index === 0 && (
            <div className="text-[10px] text-neutral-400">
              Asset Input Source: first step uses the chain execution&apos;s initial asset (if provided) or runs without an asset.
            </div>
          )}

          {/* Step settings inheritance + overrides */}
          <div className="space-y-2 rounded border border-neutral-100 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/20 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300">
                  Step Settings (QuickGen-compatible)
                </div>
                <span className="text-[10px] text-neutral-400">
                  {settingsOverrideCount} override{settingsOverrideCount === 1 ? '' : 's'}
                </span>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={step.inherit_previous_settings ?? true}
                  onChange={(e) => update({ inherit_previous_settings: e.target.checked ? null : false })}
                />
                Inherit previous step settings
              </label>
            </div>

            <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowReusableSettingsEditor((v) => !v)}
                  className="text-[10px] px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  {showReusableSettingsEditor ? 'Hide Settings Editor' : 'Customize Settings'}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => update({
                      provider_id: null,
                      preferred_account_id: null,
                      params_overrides: null,
                    })}
                    disabled={settingsOverrideCount === 0}
                    className="text-[10px] px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    Clear Overrides
                  </button>
                </div>
            </div>

            {showReusableSettingsEditor && (
              <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/30 p-2">
                <div className="mb-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                  Shared Generation Settings UI ({effectiveOperationForSpecs} • specs from {providerForSpecs})
                </div>
                <div className="mb-2 flex items-center gap-1.5">
                  <ProviderIconButton
                    providerId={step.provider_id ?? undefined}
                    providers={providers}
                    onSelect={(providerId) => update({ provider_id: providerId ?? null })}
                    disabled={false}
                  />
                  <AdvancedSettingsPopover
                    params={advancedParamSpecs}
                    values={dynamicParams}
                    onChange={handleSettingsParamChange}
                    disabled={false}
                    currentModel={dynamicParams.model as string | undefined}
                    accounts={activeAccounts}
                  />
                  <div className="text-[10px] text-neutral-400 truncate">
                    Provider/account overrides + advanced params
                  </div>
                </div>
                <GenerationParamControls
                  paramSpecs={filteredParamSpecs}
                  values={dynamicParams}
                  onChange={handleSettingsParamChange}
                  generating={false}
                  unlimitedModels={unlimitedModels}
                />
                {filteredParamSpecs.length === 0 && advancedParamSpecs.length === 0 && (
                  <div className="mt-2 text-[10px] text-neutral-500">
                    No reusable param specs available for this operation/provider yet. Provider/account overrides still apply.
                  </div>
                )}
              </div>
            )}
          </div>

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
              <button
                type="button"
                onClick={() => onDuplicate(index)}
                className="text-[10px] px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                title="Duplicate step"
              >
                Duplicate
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
