import { useEffect, useMemo, useState } from 'react';

import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import {
  EACH_STRATEGIES,
  SET_STRATEGIES,
  isSetStrategy,
  useFanoutPresetStore,
} from '@features/generation';
import {
  BUILTIN_FANOUT_PRESETS,
  normalizeFanoutRunOptions,
  type FanoutPreset,
  type FanoutRunOptions,
} from '@features/generation/lib/fanoutPresets';

type PresetSelection =
  | { source: 'builtin'; id: string }
  | { source: 'custom'; id: string }
  | null;

export function ExecutionPresetsPanel() {
  const customPresets = useFanoutPresetStore((s) => s.presets);
  const savePreset = useFanoutPresetStore((s) => s.savePreset);
  const updatePreset = useFanoutPresetStore((s) => s.updatePreset);
  const deletePreset = useFanoutPresetStore((s) => s.deletePreset);
  const duplicatePreset = useFanoutPresetStore((s) => s.duplicatePreset);
  const resetCustomPresets = useFanoutPresetStore((s) => s.reset);

  const assetSets = useAssetSetStore((s) => s.sets);

  const [selected, setSelected] = useState<PresetSelection>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftOptions, setDraftOptions] = useState<FanoutRunOptions>(BUILTIN_FANOUT_PRESETS[0]);

  const builtins = BUILTIN_FANOUT_PRESETS;
  const builtinBasic = useMemo(
    () =>
      builtins.filter(
        (p) => !p.id.startsWith('overnight-') && !p.id.startsWith('progression-scan-'),
      ),
    [builtins],
  );
  const builtinOvernight = useMemo(
    () =>
      builtins.filter(
        (p) => p.id.startsWith('overnight-') || p.id.startsWith('progression-scan-'),
      ),
    [builtins],
  );
  const selectedPreset = useMemo(() => {
    if (!selected) return null;
    return selected.source === 'builtin'
      ? builtins.find((p) => p.id === selected.id) ?? null
      : customPresets.find((p) => p.id === selected.id) ?? null;
  }, [selected, builtins, customPresets]);

  useEffect(() => {
    const preset = selectedPreset;
    if (!preset) {
      setDraftLabel('');
      setDraftDescription('');
      setDraftOptions(BUILTIN_FANOUT_PRESETS[0]);
      return;
    }
    setDraftLabel(preset.label);
    setDraftDescription(preset.description ?? '');
    setDraftOptions(normalizeFanoutRunOptions(preset));
  }, [selectedPreset]);

  const allStrategies = useMemo(() => [...EACH_STRATEGIES, ...SET_STRATEGIES], []);
  const isCustomSelected = selected?.source === 'custom' && !!selectedPreset;
  const needsSet = isSetStrategy(draftOptions.strategy);
  const selectedSet = assetSets.find((s) => s.id === (draftOptions.setId ?? ''));

  function setDraftPatch(patch: Partial<FanoutRunOptions>) {
    setDraftOptions((prev) => normalizeFanoutRunOptions({ ...prev, ...patch }));
  }

  function createNewPresetFromCurrent() {
    const created = savePreset({
      label: `Fanout Preset ${customPresets.length + 1}`,
      options: draftOptions,
      description: draftDescription || undefined,
    });
    setSelected({ source: 'custom', id: created.id });
  }

  function copySelectedToCustom() {
    if (!selectedPreset) return;
    const created = savePreset({
      label: `${selectedPreset.label} Copy`,
      description: selectedPreset.description,
      options: selectedPreset,
    });
    setSelected({ source: 'custom', id: created.id });
  }

  function saveDraftToSelectedCustom() {
    if (!isCustomSelected || !selected?.id) return;
    updatePreset(selected.id, {
      label: draftLabel.trim() || 'Untitled Fanout Preset',
      description: draftDescription.trim() || undefined,
      ...draftOptions,
    });
  }

  function deleteSelectedCustom() {
    if (!isCustomSelected || !selected?.id) return;
    deletePreset(selected.id);
    setSelected(null);
  }

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Execution Presets</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Manage fanout (Each) presets and execution behavior defaults.
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={createNewPresetFromCurrent}
            className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            New From Draft
          </button>
          <button
            type="button"
            onClick={resetCustomPresets}
            className="px-2 py-1 text-xs rounded bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700"
            title="Clear all custom fanout presets"
          >
            Reset Custom
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr]">
        <div className="border-r border-neutral-200 dark:border-neutral-800 overflow-y-auto p-2">
          <SectionTitle title="Built-in" />
          <div className="space-y-1 mb-3">
            {builtinBasic.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                selected={selected?.source === 'builtin' && selected.id === preset.id}
                source="builtin"
                onSelect={() => setSelected({ source: 'builtin', id: preset.id })}
              />
            ))}
          </div>

          {builtinOvernight.length > 0 && (
            <>
              <SectionTitle title="Overnight / Long Runs" />
              <div className="space-y-1 mb-3">
                {builtinOvernight.map((preset) => (
                  <PresetRow
                    key={preset.id}
                    preset={preset}
                    selected={selected?.source === 'builtin' && selected.id === preset.id}
                    source="builtin"
                    onSelect={() => setSelected({ source: 'builtin', id: preset.id })}
                  />
                ))}
              </div>
            </>
          )}

          <SectionTitle title={`Custom (${customPresets.length})`} />
          <div className="space-y-1">
            {customPresets.length === 0 && (
              <div className="px-2 py-2 text-xs text-neutral-500 dark:text-neutral-400 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                No custom presets yet. Save from the Each popup or create one here.
              </div>
            )}
            {customPresets.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                selected={selected?.source === 'custom' && selected.id === preset.id}
                source="custom"
                onSelect={() => setSelected({ source: 'custom', id: preset.id })}
              />
            ))}
          </div>
        </div>

        <div className="overflow-y-auto p-3">
          {!selectedPreset ? (
            <div className="h-full flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
              Select a preset to inspect or edit.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">
                    {selectedPreset.label}{' '}
                    <span className="text-xs font-normal text-neutral-500">
                      ({selected?.source === 'builtin' ? 'built-in' : 'custom'})
                    </span>
                  </div>
                  {selectedPreset.description && (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{selectedPreset.description}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={copySelectedToCustom}
                    className="px-2 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    Copy to Custom
                  </button>
                  {isCustomSelected && (
                    <>
                      <button
                        type="button"
                        onClick={() => duplicatePreset(selected!.id)}
                        className="px-2 py-1 text-xs rounded bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedCustom}
                        className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <LabeledField label="Preset Label">
                    <input
                      type="text"
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      disabled={!isCustomSelected}
                      className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 disabled:opacity-60"
                    />
                  </LabeledField>
                  <LabeledField label="Strategy">
                    <select
                      value={draftOptions.strategy}
                      onChange={(e) => setDraftPatch({ strategy: e.target.value as FanoutRunOptions['strategy'] })}
                      className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                    >
                      {allStrategies.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </LabeledField>
                  <LabeledField label="Description" className="col-span-2">
                    <input
                      type="text"
                      value={draftDescription}
                      onChange={(e) => setDraftDescription(e.target.value)}
                      disabled={!isCustomSelected}
                      className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 disabled:opacity-60"
                    />
                  </LabeledField>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <LabeledField label="Repeat Count">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={draftOptions.repeatCount}
                      onChange={(e) => setDraftPatch({ repeatCount: Number(e.target.value || 1) })}
                      className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                    />
                  </LabeledField>
                  <LabeledField label="On Error">
                    <select
                      value={draftOptions.onError}
                      onChange={(e) => setDraftPatch({ onError: e.target.value as FanoutRunOptions['onError'] })}
                      className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                    >
                      <option value="continue">continue</option>
                      <option value="stop">stop</option>
                    </select>
                  </LabeledField>
                  <LabeledField label="Dispatch">
                    <select
                      value={draftOptions.dispatch}
                      onChange={(e) => setDraftPatch({ dispatch: e.target.value as FanoutRunOptions['dispatch'] })}
                      disabled={draftOptions.executionMode === 'sequential'}
                      className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                    >
                      <option value="auto">auto</option>
                      <option value="frontend">frontend</option>
                      <option value="backend_fanout">backend_fanout</option>
                    </select>
                  </LabeledField>
                  <LabeledField label="Mode">
                    <select
                      value={draftOptions.executionMode}
                      onChange={(e) => setDraftPatch({ executionMode: e.target.value as FanoutRunOptions['executionMode'] })}
                      className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                    >
                      <option value="fanout">fanout</option>
                      <option value="sequential">sequential</option>
                    </select>
                  </LabeledField>
                  <LabeledField label="Seed (0 = random)">
                    <input
                      type="number"
                      value={draftOptions.seed ?? 0}
                      onChange={(e) => setDraftPatch({ seed: Math.trunc(Number(e.target.value || 0)) || undefined })}
                      className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                    />
                  </LabeledField>
                </div>

                {draftOptions.executionMode === 'sequential' && (
                  <label className="flex items-center gap-2 text-xs rounded border border-neutral-200 dark:border-neutral-800 p-2">
                    <input
                      type="checkbox"
                      checked={draftOptions.reusePreviousOutputAsInput}
                      onChange={(e) => setDraftPatch({ reusePreviousOutputAsInput: e.target.checked })}
                    />
                    <span>Reuse previous step result as next input (frontend sequential Each)</span>
                  </label>
                )}

                {needsSet && (
                  <div className="rounded border border-neutral-200 dark:border-neutral-800 p-2 space-y-2">
                    <div className="text-xs font-semibold">Asset Set Strategy</div>
                    <div className="grid grid-cols-2 gap-2">
                      <LabeledField label="Set">
                        <select
                          value={draftOptions.setId ?? ''}
                          onChange={(e) => setDraftPatch({ setId: e.target.value || undefined })}
                          className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                        >
                          <option value="">Select set...</option>
                          {assetSets.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.kind === 'manual' ? `${s.assetIds.length}` : 'smart'})
                            </option>
                          ))}
                        </select>
                      </LabeledField>
                      <LabeledField label="Set Pick Mode">
                        <select
                          value={draftOptions.setPickMode}
                          onChange={(e) => setDraftPatch({ setPickMode: e.target.value as FanoutRunOptions['setPickMode'] })}
                          className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                        >
                          <option value="all">all</option>
                          <option value="first_n">first_n</option>
                          <option value="random_n">random_n</option>
                        </select>
                      </LabeledField>
                      <LabeledField label="Set Pick Count">
                        <input
                          type="number"
                          min={1}
                          max={500}
                          disabled={draftOptions.setPickMode === 'all'}
                          value={draftOptions.setPickCount ?? 8}
                          onChange={(e) => setDraftPatch({ setPickCount: Number(e.target.value || 1) })}
                          className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 disabled:opacity-60"
                        />
                      </LabeledField>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-end">
                        {selectedSet ? (
                          <span>
                            Selected set: <strong>{selectedSet.name}</strong> ({selectedSet.kind})
                          </span>
                        ) : (
                          <span>No set selected</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded border border-dashed border-neutral-300 dark:border-neutral-700 p-2 text-xs">
                  <div className="font-semibold mb-1">Execution Mapping</div>
                  {draftOptions.executionMode === 'fanout' ? (
                    <>
                      <div className="text-neutral-600 dark:text-neutral-300">
                        backend policy: dispatch_mode=<code>fanout</code>, wait_policy=<code>none</code>, failure_policy=
                        <code>{draftOptions.onError === 'stop' ? 'stop' : 'continue'}</code>
                      </div>
                      <div className="mt-1 text-neutral-500 dark:text-neutral-400">
                        Dispatch target: <code>{draftOptions.dispatch}</code>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-neutral-600 dark:text-neutral-300">
                        frontend sequential runner (waits per step); optional previous-output piping:
                        <code> {String(draftOptions.reusePreviousOutputAsInput)}</code>
                      </div>
                      <div className="mt-1 text-neutral-500 dark:text-neutral-400">
                        Backend fanout dispatch is not used in sequential mode.
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isCustomSelected ? (
                    <button
                      type="button"
                      onClick={saveDraftToSelectedCustom}
                      className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Save Changes
                    </button>
                  ) : (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      Built-in presets are read-only. Use “Copy to Custom” to edit.
                    </div>
                  )}
                </div>
              </div>

              <details className="rounded border border-neutral-200 dark:border-neutral-800">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
                  JSON Preview
                </summary>
                <pre className="px-3 pb-3 text-[11px] overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(
                    {
                      label: draftLabel,
                      description: draftDescription || undefined,
                      ...normalizeFanoutRunOptions(draftOptions),
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
      {title}
    </div>
  );
}

function PresetRow({
  preset,
  selected,
  source,
  onSelect,
}: {
  preset: FanoutPreset;
  selected: boolean;
  source: 'builtin' | 'custom';
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full text-left rounded border px-2 py-1.5',
        selected
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
          : 'border-neutral-200 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800/50',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium truncate">{preset.label}</div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
            {preset.strategy} • x{preset.repeatCount} • {preset.dispatch}
          </div>
        </div>
        <span
          className={`text-[9px] px-1 py-0.5 rounded ${source === 'builtin' ? 'bg-neutral-200 dark:bg-neutral-800' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}
        >
          {source}
        </span>
      </div>
    </button>
  );
}

function LabeledField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={['flex flex-col gap-1 text-xs', className ?? ''].join(' ')}>
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
