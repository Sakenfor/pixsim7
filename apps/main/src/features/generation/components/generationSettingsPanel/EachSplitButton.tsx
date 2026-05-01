import { DropdownItem, DropdownSectionHeader, Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon, type IconName } from '@lib/icons';

import { useAccentButtonClasses } from '@features/appearance';
import { useFanoutPresetStore, usePersistedScopeState } from '@features/generation';
import { openWorkspacePanel } from '@features/workspace';

import {
  EACH_STRATEGIES,
  type CombinationStrategy,
} from '../../lib/combinationStrategies';
import {
  BUILTIN_FANOUT_PRESETS,
  DEFAULT_FANOUT_RUN_OPTIONS,
  normalizeFanoutRunOptions,
  type FanoutPreset,
  type FanoutRunOptions,
} from '../../lib/fanoutPresets';

const STRATEGY_ICONS: Record<CombinationStrategy, IconName> = {
  each: 'list',
  anchor_sweep: 'target',
  sequential_pairs: 'link',
  all_pairs: 'grid',
};

/** Short 2-character codes — readable at a glance, scroll-cycle friendly. */
const STRATEGY_CODES: Record<CombinationStrategy, string> = {
  each: 'Ea',
  anchor_sweep: 'An',
  sequential_pairs: 'Pr',
  all_pairs: 'AP',
};

/** Split-button for "Each" (fanout) with strategy + preset controls. */
export function EachSplitButton({
  onGenerateEach,
  disabled,
  generating,
  queueProgress,
  inputCount,
  iterateSetSizes,
}: {
  onGenerateEach: (options?: FanoutRunOptions) => void;
  disabled: boolean;
  generating: boolean;
  queueProgress?: { queued: number; total: number } | null;
  inputCount: number;
  /** Set sizes for slots in iterate mode (manual sets only). When non-empty,
   * the iterate dimension drives plan count instead of `inputCount`. */
  iterateSetSizes?: number[];
}) {
  const btn = useAccentButtonClasses();
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
  const strategyWheelRef = useRef<HTMLButtonElement>(null);

  const currentRunOptions = normalizeFanoutRunOptions(draftRunOptions);
  const selectedStrategy = currentRunOptions.strategy;
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

  const canRun = true;
  const showProgress = generating && queueProgress;

  function setDraftPatch(patch: Partial<FanoutRunOptions>) {
    setDraftRunOptions((prev) => normalizeFanoutRunOptions({ ...prev, ...patch }));
  }
  const plannedGroupCount = (iterateSetSizes && iterateSetSizes.length > 0)
    ? estimateIterateGroupCount({
        iterateSetSizes,
        slotCount: inputCount,
        strategy: selectedStrategy,
        repeatCount: currentRunOptions.repeatCount,
      })
    : estimatePlannedGroupCount({
        inputCount,
        strategy: selectedStrategy,
        repeatCount: currentRunOptions.repeatCount,
      });

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

  const handleToggle = () => setOpen((o) => !o);

  // Wheel cycles through the "each" (non-set) strategies so the compact pill
  // can scroll-through without opening the popover. Ref pattern keeps the
  // listener attached once with { passive: false } so preventDefault works.
  const strategyWheelStateRef = useRef({ selectedStrategy, disabled, setDraftPatch });
  strategyWheelStateRef.current = { selectedStrategy, disabled, setDraftPatch };
  useEffect(() => {
    const el = strategyWheelRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const { selectedStrategy: s, disabled: d, setDraftPatch: patch } = strategyWheelStateRef.current;
      if (d) return;
      e.preventDefault();
      const list = EACH_STRATEGIES;
      const idx = list.findIndex((x) => x.id === s);
      const baseIdx = idx < 0 ? 0 : idx;
      const next = e.deltaY < 0
        ? (baseIdx + 1) % list.length
        : (baseIdx - 1 + list.length) % list.length;
      patch({ strategy: list[next].id });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

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

  const activeStrategyEntry = useMemo(
    () => EACH_STRATEGIES.find((s) => s.id === selectedStrategy) ?? EACH_STRATEGIES[0],
    [selectedStrategy],
  );

  return (
    <div className="relative flex-shrink-0">
      <div className="flex">
        {/* Single active-strategy pill — click to run, scroll-wheel to cycle, chevron to pick */}
        <button
          ref={strategyWheelRef}
          onClick={() => {
            if (canRun) onGenerateEach(currentRunOptions);
          }}
          disabled={disabled}
          className={clsx(
            'px-2 py-1.5 text-[10px] font-semibold rounded-l-lg inline-flex items-center gap-1',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            disabled ? 'text-white bg-neutral-400' : btn.primary,
            !disabled && !canRun && 'opacity-60 cursor-not-allowed',
          )}
          style={{ transition: 'none', animation: 'none' }}
          title={
            buildStrategyTooltip(activeStrategyEntry.id, activeStrategyEntry.description, true, inputCount, currentRunOptions.repeatCount, plannedGroupCount)
            + '\n\nScroll to cycle strategies'
            + (iterateSetSizes && iterateSetSizes.length > 0
              ? `\n\nIterate-mode slots: ${iterateSetSizes.join(' × ')}${selectedStrategy === 'all_pairs' && iterateSetSizes.length >= 2 ? ' (cartesian)' : ' (zip)'}`
              : '')
          }
        >
          {canRun && !showProgress && <Icon name="play" size={9} color="#fff" />}
          <Icon name={STRATEGY_ICONS[activeStrategyEntry.id]} size={11} color="#fff" />
          <span className="text-[10px] font-bold uppercase tracking-wider tabular-nums text-white">
            {STRATEGY_CODES[activeStrategyEntry.id]}
          </span>
          {!showProgress && plannedGroupCount != null && plannedGroupCount > 1 && (
            <span className="tabular-nums">×{plannedGroupCount}</span>
          )}
        </button>
        {/* Popover trigger + asset sets */}
        <div className="flex flex-col">
          <button
            ref={triggerRef}
            onClick={handleToggle}
            disabled={disabled}
            className={clsx(
              'px-1 py-1 rounded-tr-lg text-[11px] font-semibold border-l border-white/20',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              disabled
                ? 'text-white bg-neutral-400'
                : btn.tertiary,
            )}
            style={{ transition: 'none', animation: 'none' }}
            title="Fanout options & presets"
          >
            <Icon name="chevronDown" size={10} className={clsx(open && 'rotate-180')} />
          </button>
          <button
            onClick={() => openWorkspacePanel('asset-sets')}
            className={clsx(
              'px-1 py-0.5 rounded-br-lg opacity-70 hover:opacity-100 border-l border-t border-white/20',
              disabled
                ? 'text-white bg-neutral-400'
                : btn.tertiary,
            )}
            style={{ transition: 'none', animation: 'none' }}
            title="Manage asset sets"
          >
            <Icon name="layers" size={8} />
          </button>
        </div>
      </div>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={triggerRef.current}
        placement="top"
        align="end"
        offset={6}
        triggerRef={triggerRef}
        className="w-[460px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
      >
        <div className="flex flex-col max-h-[70vh]">
          {/* Scrollable content area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Two-column layout: Set Strategies | Presets */}
            <div className="flex divide-x divide-neutral-200 dark:divide-neutral-700">
          {/* Left column: input combination strategies (also cycle-able via wheel on the pill) */}
          <div className="flex-1 min-w-0">
            <DropdownSectionHeader first>Combination Strategy</DropdownSectionHeader>
            {EACH_STRATEGIES.map((s) => (
              <DropdownItem
                key={s.id}
                onClick={() => setDraftPatch({ strategy: s.id })}
                className={clsx(selectedStrategy === s.id && 'font-semibold bg-violet-500/10')}
                icon={selectedStrategy === s.id ? <Icon name="check" size={10} /> : <Icon name={STRATEGY_ICONS[s.id]} size={10} />}
              >
                <div className="flex flex-col items-start">
                  <span>{s.label}</span>
                  <span className="text-[9px] text-neutral-400">{s.description}</span>
                </div>
              </DropdownItem>
            ))}
            <div className="px-2 py-1.5 mt-1 mx-1 rounded text-[9px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
              Iterate over an asset set by linking it to a slot — hover the slot, click the shuffle badge, pick <span className="font-semibold">Iterate</span>. The slot drives run count.
            </div>
          </div>

          {/* Right column: Presets */}
          <div className="flex-1 min-w-0">
            <DropdownSectionHeader first>Built-in Presets</DropdownSectionHeader>
            {builtinBasicPresets.map((preset) => {
              const isActive = selectedPresetId === preset.id;
              return (
                <DropdownItem
                  key={preset.id}
                  onClick={() => {
                    applyPreset(preset);
                    setOpen(false);
                  }}
                  className={clsx('text-[11px]', isActive && 'font-semibold bg-accent/10')}
                  icon={isActive ? <Icon name="check" size={10} /> : <Icon name="sparkles" size={10} />}
                >
                  <div className="flex flex-col items-start">
                    <span>{preset.label}</span>
                    {preset.description && <span className="text-[9px] text-neutral-400">{preset.description}</span>}
                  </div>
                </DropdownItem>
              );
            })}
            {builtinOvernightPresets.length > 0 && (
              <>
                <DropdownSectionHeader>Overnight / Long Runs</DropdownSectionHeader>
                {builtinOvernightPresets.map((preset) => {
                  const isActive = selectedPresetId === preset.id;
                  return (
                    <DropdownItem
                      key={preset.id}
                      onClick={() => {
                        applyPreset(preset);
                        setOpen(false);
                      }}
                      className={clsx('text-[11px]', isActive && 'font-semibold bg-accent/10')}
                      icon={isActive ? <Icon name="check" size={10} /> : <Icon name="moon" size={10} />}
                    >
                      <div className="flex flex-col items-start">
                        <span>{preset.label}</span>
                        {preset.description && (
                          <span className="text-[9px] text-neutral-400">{preset.description}</span>
                        )}
                      </div>
                    </DropdownItem>
                  );
                })}
              </>
            )}
            <DropdownSectionHeader>Custom Presets</DropdownSectionHeader>
            {(customPresets || []).map((preset) => {
              const isActive = selectedPresetId === preset.id;
              return (
                <DropdownItem
                  key={preset.id}
                  onClick={() => {
                    applyPreset(preset);
                    setOpen(false);
                  }}
                  className={clsx('text-[11px]', isActive && 'font-semibold bg-accent/10')}
                  icon={isActive ? <Icon name="check" size={10} /> : <Icon name="sparkles" size={10} />}
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
              );
            })}
            <div className="px-2 py-1 border-t border-neutral-200 dark:border-neutral-700">
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
          </div>
            </div>

            {/* Status bar */}
            <div className="px-2 py-1 border-t border-neutral-200 dark:border-neutral-700 flex items-center gap-2 text-[10px] text-neutral-500">
              <span>
                Preset:{' '}
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {selectedPreset
                    ? `${selectedPreset.label}${presetDraftModified ? ' (modified)' : ''}`
                    : 'Ad hoc draft'}
                </span>
              </span>
              <span className="text-neutral-300 dark:text-neutral-600">|</span>
              <span>
                Planned: <span className="font-semibold text-neutral-700 dark:text-neutral-200">{plannedGroupCount ?? '?'}</span>
              </span>
            </div>
          </div>

          {/* Options grid — sticky at bottom */}
          <div className="flex-shrink-0 border-t border-neutral-200 dark:border-neutral-700 px-2 py-1.5 grid grid-cols-2 gap-1.5 text-[10px] bg-neutral-50 dark:bg-neutral-800 rounded-b-lg">
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
              title="Used for reproducible iterate-mode shuffle order"
            />
          </label>
          </div>
        </div>
      </Popover>
    </div>
  );
}

// Mirrors useQuickGenerateController#buildIterateGroups planning rules so the
// `×N` badge stays accurate when iterate slots drive the run.
function estimateIterateGroupCount(args: {
  iterateSetSizes: number[];
  slotCount: number;
  strategy: CombinationStrategy;
  repeatCount: number;
}): number | null {
  const sizes = args.iterateSetSizes.filter((s) => s > 0);
  if (sizes.length === 0) return null;
  const repeat = Math.max(1, Math.floor(args.repeatCount || 1));
  const useCartesian = args.strategy === 'all_pairs' && sizes.length >= 2;

  const iterDim = useCartesian
    ? sizes.reduce((a, b) => a * b, 1)
    : Math.max(...sizes);

  let perIter: number;
  if (args.strategy === 'each' || useCartesian) {
    perIter = 1;
  } else {
    const n = Math.max(0, Math.floor(args.slotCount || 0));
    switch (args.strategy) {
      case 'anchor_sweep':
      case 'sequential_pairs':
        perIter = n < 2 ? 1 : n - 1;
        break;
      case 'all_pairs':
        perIter = n < 2 ? 1 : (n * (n - 1)) / 2;
        break;
      default:
        perIter = 1;
    }
  }

  return iterDim * perIter * repeat;
}

function estimatePlannedGroupCount(args: {
  inputCount: number;
  strategy: CombinationStrategy;
  repeatCount: number;
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
      default:
        return n;
    }
  };

  return baseFromEach(args.strategy) * repeat;
}

function buildStrategyTooltip(
  strategy: CombinationStrategy,
  description: string,
  isActive: boolean,
  inputCount: number,
  repeatCount: number,
  plannedGroupCount: number | null,
): string {
  const n = inputCount;
  const r = repeatCount;

  if (!isActive) {
    // Inactive: explain what the strategy does with current inputs
    const breakdown = strategyBreakdown(strategy, n);
    return `${description}\n${breakdown}`;
  }

  // Active: show what clicking will fire
  const breakdown = strategyBreakdown(strategy, n);
  const repeatNote = r > 1 ? ` x ${r} repeats` : '';
  const total = plannedGroupCount ?? '?';
  return `Click to run ${total} generation${plannedGroupCount === 1 ? '' : 's'}\n${breakdown}${repeatNote}\n\n${description}`;
}

function strategyBreakdown(strategy: CombinationStrategy, n: number): string {
  switch (strategy) {
    case 'each':
      return `${n} input${n !== 1 ? 's' : ''} -> ${n} group${n !== 1 ? 's' : ''} (one per input)`;
    case 'anchor_sweep':
      if (n < 2) return `${n} input - need 2+ for anchor sweep`;
      return `${n} inputs -> ${n - 1} pairs (input #1 paired with each other)`;
    case 'sequential_pairs':
      if (n < 2) return `${n} input - need 2+ for pairs`;
      return `${n} inputs -> ${n - 1} pairs ([1,2], [2,3], ...)`;
    case 'all_pairs':
      if (n < 2) return `${n} input - need 2+ for pairs`;
      return `${n} inputs -> ${(n * (n - 1)) / 2} unique pairs`;
    default:
      return `${n} input${n !== 1 ? 's' : ''}`;
  }
}

