import { Dropdown, DropdownItem, DropdownSectionHeader } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import { useFanoutPresetStore, usePersistedScopeState } from '@features/generation';
import { openWorkspacePanel } from '@features/workspace';

import {
  EACH_STRATEGIES,
  SET_STRATEGIES,
  isSetStrategy,
  type CombinationStrategy,
} from '../../lib/combinationStrategies';
import {
  BUILTIN_FANOUT_PRESETS,
  DEFAULT_FANOUT_RUN_OPTIONS,
  normalizeFanoutRunOptions,
  type FanoutPreset,
  type FanoutRunOptions,
} from '../../lib/fanoutPresets';

/** Split-button for "Each" (fanout) with strategy + preset controls. */
export function EachSplitButton({
  onGenerateEach,
  disabled,
  generating,
  queueProgress,
  inputCount,
}: {
  onGenerateEach: (options?: FanoutRunOptions) => void;
  disabled: boolean;
  generating: boolean;
  queueProgress?: { queued: number; total: number } | null;
  inputCount: number;
}) {
  const [selectedPresetId, setSelectedPresetId] = usePersistedScopeState<string | null>('eachSelectedPresetId', 'each-default');
  const [draftRunOptions, setDraftRunOptions] = usePersistedScopeState<FanoutRunOptions>(
    'eachRunOptionsDraft',
    DEFAULT_FANOUT_RUN_OPTIONS,
  );
  const customPresets = useFanoutPresetStore((s) => s.presets);
  const saveCustomPreset = useFanoutPresetStore((s) => s.savePreset);
  const deleteCustomPresetAction = useFanoutPresetStore((s) => s.deletePreset);

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const sets = useAssetSetStore((s) => s.sets);
  const currentRunOptions = normalizeFanoutRunOptions(draftRunOptions);
  const selectedStrategy = currentRunOptions.strategy;
  const selectedSetId = currentRunOptions.setId ?? null;
  const selectedSet = sets.find((s) => s.id === selectedSetId) ?? null;
  const selectedPreset = useMemo(
    () => [...BUILTIN_FANOUT_PRESETS, ...(customPresets || [])].find((p) => p.id === selectedPresetId) ?? null,
    [customPresets, selectedPresetId],
  );
  const selectedPresetNormalized = useMemo(
    () => (selectedPreset ? normalizeFanoutRunOptions(selectedPreset) : null),
    [selectedPreset],
  );
  const presetDraftModified = useMemo(
    () => (
      selectedPresetNormalized
      ? JSON.stringify(selectedPresetNormalized) !== JSON.stringify(currentRunOptions)
      : false
    ),
    [selectedPresetNormalized, currentRunOptions],
  );

  const current = useMemo(
    () =>
      EACH_STRATEGIES.find((s) => s.id === selectedStrategy) ??
      SET_STRATEGIES.find((s) => s.id === selectedStrategy) ??
      EACH_STRATEGIES[0],
    [selectedStrategy],
  );
  const needsSet = isSetStrategy(selectedStrategy);
  const canRun = !needsSet || !!selectedSetId;
  const showProgress = generating && queueProgress;

  function setDraftPatch(patch: Partial<FanoutRunOptions>) {
    setDraftRunOptions((prev) => normalizeFanoutRunOptions({ ...prev, ...patch }));
  }
  const plannedGroupCount = estimatePlannedGroupCount({
    inputCount,
    strategy: selectedStrategy,
    repeatCount: currentRunOptions.repeatCount,
    setKind: needsSet ? (selectedSet?.kind ?? null) : null,
    setCount: needsSet && selectedSet && selectedSet.kind === 'manual' ? selectedSet.assetIds.length : null,
    setPickMode: currentRunOptions.setPickMode,
    setPickCount: currentRunOptions.setPickCount,
  });

  const allPresets = useMemo(
    () => [...BUILTIN_FANOUT_PRESETS, ...(customPresets || [])],
    [customPresets],
  );
  const builtinBasicPresets = useMemo(
    () =>
      BUILTIN_FANOUT_PRESETS.filter(
        (p) => !p.id.startsWith('overnight-') && !p.id.startsWith('progression-scan-'),
      ),
    [],
  );
  const builtinOvernightPresets = useMemo(
    () =>
      BUILTIN_FANOUT_PRESETS.filter(
        (p) => p.id.startsWith('overnight-') || p.id.startsWith('progression-scan-'),
      ),
    [],
  );

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setAnchorPos({ x: rect.right, y: rect.top });
    }
    setOpen((o) => !o);
  };

  function applyPreset(preset: FanoutRunOptions) {
    const normalized = normalizeFanoutRunOptions(preset);
    if ('id' in (preset as any) && typeof (preset as any).id === 'string') {
      setSelectedPresetId((preset as any).id);
    }
    setDraftRunOptions(normalized);
  }

  function saveCurrentAsPreset() {
    if (typeof window === 'undefined') return;
    const label = window.prompt('Preset name');
    if (!label || !label.trim()) return;
    const id = `custom-${Date.now()}`;
    const preset: FanoutPreset = {
      id,
      label: label.trim(),
      ...currentRunOptions,
    };
    const created = saveCustomPreset({
      label: preset.label,
      description: preset.description,
      options: preset,
    });
    setSelectedPresetId(created.id);
  }

  function deleteCustomPreset(id: string) {
    deleteCustomPresetAction(id);
    if (selectedPresetId === id) {
      setSelectedPresetId(null);
    }
  }

  const totalItems = EACH_STRATEGIES.length + SET_STRATEGIES.length + allPresets.length + 16;

  return (
    <div className="relative flex-shrink-0">
      <div className="flex">
        <button
          onClick={() => canRun && onGenerateEach(currentRunOptions)}
          disabled={disabled || !canRun}
          className={clsx(
            'px-2 py-1.5 rounded-l-lg text-[11px] font-semibold text-white tabular-nums',
            'min-w-[5.5rem]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            disabled || !canRun
              ? 'bg-neutral-400'
              : needsSet
                ? 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600',
          )}
          style={{ transition: 'none', animation: 'none' }}
          title={`${current.description} | ${currentRunOptions.executionMode}${currentRunOptions.reusePreviousOutputAsInput ? ' + pipe-prev' : ''} | repeat ${currentRunOptions.repeatCount} | ${currentRunOptions.dispatch} | planned: ${plannedGroupCount ?? '?'} `}
        >
          <span className="inline-flex min-w-[4.5ch] justify-center">
            {current.shortLabel}
            {!showProgress && currentRunOptions.repeatCount > 1 ? `x${currentRunOptions.repeatCount}` : ''}
          </span>
        </button>
        <div className="flex flex-col">
          <button
            ref={triggerRef}
            onClick={handleToggle}
            disabled={disabled}
            className={clsx(
              'px-1 py-1 rounded-tr-lg text-[11px] font-semibold text-white border-l border-white/20',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              disabled
                ? 'bg-neutral-400'
                : needsSet
                  ? 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600',
            )}
            style={{ transition: 'none', animation: 'none' }}
            title="Fanout options"
          >
            <Icon name="chevronDown" size={10} className={clsx(open && 'rotate-180')} />
          </button>
          <button
            onClick={() => openWorkspacePanel('asset-sets')}
            className={clsx(
              'px-1 py-0.5 rounded-br-lg text-white/70 hover:text-white border-l border-t border-white/20',
              disabled
                ? 'bg-neutral-400'
                : needsSet
                  ? 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600',
            )}
            style={{ transition: 'none', animation: 'none' }}
            title="Manage asset sets"
          >
            <Icon name="layers" size={8} />
          </button>
        </div>
      </div>

      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        portal
        positionMode="fixed"
        anchorPosition={{ x: anchorPos.x - 260, y: Math.max(8, anchorPos.y - (totalItems * 18)) }}
        minWidth="260px"
        triggerRef={triggerRef}
        className="!p-0"
      >
        <DropdownSectionHeader first>Built-in Presets</DropdownSectionHeader>
        {builtinBasicPresets.map((preset) => (
          <DropdownItem
            key={preset.id}
            onClick={() => {
              applyPreset(preset);
              setOpen(false);
            }}
            className="text-[11px]"
            icon={<Icon name="sparkles" size={10} />}
          >
            <div className="flex flex-col items-start">
              <span>{preset.label}</span>
              {preset.description && <span className="text-[9px] text-neutral-400">{preset.description}</span>}
            </div>
          </DropdownItem>
        ))}
        {builtinOvernightPresets.length > 0 && (
          <>
            <DropdownSectionHeader>Overnight / Long Runs</DropdownSectionHeader>
            {builtinOvernightPresets.map((preset) => (
              <DropdownItem
                key={preset.id}
                onClick={() => {
                  applyPreset(preset);
                  setOpen(false);
                }}
                className="text-[11px]"
                icon={<Icon name="moon" size={10} />}
              >
                <div className="flex flex-col items-start">
                  <span>{preset.label}</span>
                  {preset.description && (
                    <span className="text-[9px] text-neutral-400">{preset.description}</span>
                  )}
                </div>
              </DropdownItem>
            ))}
          </>
        )}
        <DropdownSectionHeader>Custom Presets</DropdownSectionHeader>
        {(customPresets || []).map((preset) => (
          <DropdownItem
            key={preset.id}
            onClick={() => {
              applyPreset(preset);
              setOpen(false);
            }}
            className="text-[11px]"
            icon={<Icon name="sparkles" size={10} />}
            rightSlot={
              preset.id.startsWith('custom-') ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCustomPreset(preset.id);
                  }}
                  className="text-[10px] text-neutral-400 hover:text-red-500"
                  title="Delete preset"
                >
                  <Icon name="trash" size={10} />
                </button>
              ) : null
            }
          >
            <div className="flex flex-col items-start">
              <span>{preset.label}</span>
              {preset.description && <span className="text-[9px] text-neutral-400">{preset.description}</span>}
            </div>
          </DropdownItem>
        ))}
        <div className="px-2 py-1 border-t border-neutral-200 dark:border-neutral-700">
          <div className="mb-1 text-[10px] text-neutral-500">
            Preset:{' '}
            <span className="font-semibold text-neutral-700 dark:text-neutral-200">
              {selectedPreset
                ? `${selectedPreset.label}${presetDraftModified ? ' (modified draft)' : ''}`
                : 'Ad hoc draft'}
            </span>
          </div>
          <div className="mb-1 text-[10px] text-neutral-500">
            Planned total: <span className="font-semibold text-neutral-700 dark:text-neutral-200">{plannedGroupCount ?? '?'}</span>
            {needsSet && selectedSet?.kind === 'smart' ? ' (smart set resolves at run time)' : ''}
          </div>
          <button
            type="button"
            onClick={saveCurrentAsPreset}
            className="w-full text-left text-[10px] px-1.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            Save current as preset
          </button>
          <button
            type="button"
            onClick={() => openWorkspacePanel('execution-presets')}
            className="mt-1 w-full text-left text-[10px] px-1.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            Open Execution Presets Panel
          </button>
        </div>

        <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
        <DropdownSectionHeader>Strategy</DropdownSectionHeader>
        {EACH_STRATEGIES.map((s) => (
          <DropdownItem
            key={s.id}
            onClick={() => {
              setDraftPatch({ strategy: s.id, setId: undefined });
              setOpen(false);
            }}
            className={clsx(selectedStrategy === s.id && 'font-semibold')}
          >
            <div className="flex flex-col items-start">
              <span>{s.label}</span>
              <span className="text-[9px] text-neutral-400">{s.description}</span>
            </div>
          </DropdownItem>
        ))}
        <DropdownSectionHeader>Asset Set</DropdownSectionHeader>
        {SET_STRATEGIES.map((s) => (
          <DropdownItem
            key={s.id}
            onClick={() => {
              setDraftPatch({ strategy: s.id });
              setOpen(false);
            }}
            className={clsx(selectedStrategy === s.id && 'font-semibold')}
          >
            <div className="flex flex-col items-start">
              <span>{s.label}</span>
              <span className="text-[9px] text-neutral-400">{s.description}</span>
            </div>
          </DropdownItem>
        ))}

        <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
        <div className="px-2 py-1 grid grid-cols-2 gap-1.5 text-[10px]">
          <label className="flex flex-col gap-0.5">
              <span className="text-neutral-500">Repeat</span>
              <input
                type="number"
                min={1}
                max={50}
                value={currentRunOptions.repeatCount}
                onChange={(e) => setDraftPatch({ repeatCount: Math.max(1, Math.min(50, Number(e.target.value || 1))) })}
                className="px-1.5 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              />
            </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-neutral-500">On Error</span>
            <select
              value={currentRunOptions.onError}
              onChange={(e) => setDraftPatch({ onError: e.target.value as 'continue' | 'stop' })}
              className="px-1.5 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            >
              <option value="continue">Continue</option>
              <option value="stop">Stop</option>
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-neutral-500">Mode</span>
            <select
              value={currentRunOptions.executionMode}
              onChange={(e) => setDraftPatch({ executionMode: e.target.value as 'fanout' | 'sequential' })}
              className="px-1.5 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            >
              <option value="fanout">Fanout</option>
              <option value="sequential">Sequential</option>
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-neutral-500">Dispatch (compat)</span>
            <select
              value={currentRunOptions.dispatch}
              onChange={(e) => setDraftPatch({ dispatch: e.target.value as 'auto' | 'frontend' | 'backend_fanout' })}
              disabled
              className="px-1.5 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              title="Each runs via backend execution now; dispatch is preserved for preset compatibility and graph tools."
            >
              <option value="auto">Auto</option>
              <option value="frontend">Frontend</option>
              <option value="backend_fanout">Backend Fanout</option>
            </select>
          </label>

          {currentRunOptions.executionMode === 'sequential' && (
            <label className="col-span-2 flex items-center gap-1.5 rounded border border-neutral-200 dark:border-neutral-700 px-1.5 py-1">
              <input
                type="checkbox"
                checked={currentRunOptions.reusePreviousOutputAsInput}
                onChange={(e) => setDraftPatch({ reusePreviousOutputAsInput: e.target.checked })}
              />
              <span className="text-neutral-600 dark:text-neutral-300">
                Reuse previous result as next input (step N uses output from step N-1 when supported)
              </span>
            </label>
          )}

          <label className="flex flex-col gap-0.5">
            <span className="text-neutral-500">Seed (optional)</span>
            <input
              type="number"
              value={currentRunOptions.seed ?? 0}
              onChange={(e) => setDraftPatch({ seed: Math.trunc(Number(e.target.value || 0)) || undefined })}
              className="px-1.5 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              placeholder="0 = random"
              title="Used for reproducible random set picking / random set pairing"
            />
          </label>

          {needsSet && (
            <>
              <label className="flex flex-col gap-0.5">
                <span className="text-neutral-500">Set pick</span>
                <select
                  value={currentRunOptions.setPickMode}
                  onChange={(e) => setDraftPatch({ setPickMode: e.target.value as 'all' | 'first_n' | 'random_n' })}
                  className="px-1.5 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                >
                  <option value="all">All</option>
                  <option value="first_n">First N</option>
                  <option value="random_n">Random N</option>
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-neutral-500">Set count</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  disabled={currentRunOptions.setPickMode === 'all'}
                  value={currentRunOptions.setPickCount ?? 8}
                  onChange={(e) => setDraftPatch({ setPickCount: Math.max(1, Math.min(500, Number(e.target.value || 1))) })}
                  className="px-1.5 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 disabled:opacity-50"
                />
              </label>
            </>
          )}
        </div>
      </Dropdown>

      {needsSet && (
        <select
          value={selectedSetId ?? ''}
          onChange={(e) => setDraftPatch({ setId: e.target.value || undefined })}
          className="mt-1 w-full px-1.5 py-1 text-[10px] rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
          title="Select asset set"
        >
          <option value="">Pick a set...</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.kind === 'manual' ? `${s.assetIds.length} assets` : 'smart'})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function estimatePlannedGroupCount(args: {
  inputCount: number;
  strategy: CombinationStrategy;
  repeatCount: number;
  setKind: 'manual' | 'smart' | null;
  setCount: number | null;
  setPickMode: 'all' | 'first_n' | 'random_n';
  setPickCount?: number;
}): number | null {
  const n = Math.max(0, Math.floor(args.inputCount || 0));
  const repeat = Math.max(1, Math.floor(args.repeatCount || 1));

  const baseFromEach = (strategy: CombinationStrategy): number => {
    switch (strategy) {
      case 'each':
        return n;
      case 'anchor_sweep':
        if (n === 0) return 0;
        return n < 2 ? 1 : n - 1;
      case 'sequential_pairs':
        if (n === 0) return 0;
        return n < 2 ? 1 : n - 1;
      case 'all_pairs':
        if (n === 0) return 0;
        return n < 2 ? 1 : (n * (n - 1)) / 2;
      case 'input_x_set_random':
      case 'input_x_set_sequential':
        return n;
      case 'set_each':
        return 0; // resolved below
      default:
        return n;
    }
  };

  if (args.strategy !== 'set_each') {
    return baseFromEach(args.strategy) * repeat;
  }

  if (args.setKind !== 'manual' || args.setCount == null) return null;
  let effectiveSetCount = Math.max(0, args.setCount);
  if (args.setPickMode !== 'all' && args.setPickCount != null) {
    effectiveSetCount = Math.min(effectiveSetCount, Math.max(0, args.setPickCount));
  }
  return effectiveSetCount * repeat;
}
