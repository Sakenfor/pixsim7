/**
 * GenerationSettingsPanel
 *
 * Reusable generation settings panel with operation type, provider,
 * model, quality, duration controls, and Go button with cost estimate.
 *
 * Used by both Control Center and Media Viewer for consistent UI.
 */

import { Dropdown, DropdownItem, IconButton } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useMemo, useEffect, useState, useRef, type ReactNode } from 'react';

import {
  getDurationOptions,
  getQualityOptions,
  getAspectRatioLabel,
  COMMON_ASPECT_RATIOS,
  getParamIcon,
  isVisualParam,
} from '@lib/generation-ui';
import { Icon, IconBadge, type IconName } from '@lib/icons';

// ── Provider brand config ──────────────────────────────────────────────
const PROVIDER_BRANDS: Record<string, { color: string; short: string }> = {
  pixverse: { color: '#7C3AED', short: 'Px' },
  sora:     { color: '#6B7280', short: 'So' },
  remaker:  { color: '#059669', short: 'Rm' },
};
const AUTO_BRAND = { color: '#3B82F6', short: 'A' };

// ── Operation type config ──────────────────────────────────────────────
const OPERATION_ICONS: Record<string, { icon: IconName; label: string; color: string }> = {
  image_to_image:   { icon: 'image',          label: 'Image',      color: '#8B5CF6' },
  image_to_video:   { icon: 'film',           label: 'Video',      color: '#2563EB' },
  video_extend:     { icon: 'arrowRight',     label: 'Extend',     color: '#0891B2' },
  video_transition: { icon: 'arrowRightLeft', label: 'Transition', color: '#D97706' },
  fusion:           { icon: 'layers',         label: 'Fusion',     color: '#DC2626' },
};

// ── Shared close-on-outside hook ───────────────────────────────────────
function useClickOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, ref, close]);
}

// ── Shared dropdown menu shell ─────────────────────────────────────────
const DROPDOWN_MENU_CLS = 'absolute left-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded-lg shadow-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700';
const DROPDOWN_ITEM_CLS = 'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700';

/** Compact provider badge with dropdown picker. */
function ProviderIconButton({
  providerId,
  providers,
  onSelect,
  disabled,
}: {
  providerId: string | undefined;
  providers: { id: string; name: string }[];
  onSelect: (id: string | undefined) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const brand = providerId ? (PROVIDER_BRANDS[providerId] ?? { color: '#6B7280', short: providerId.slice(0, 2) }) : AUTO_BRAND;

  return (
    <div ref={ref} className="relative">
      <IconButton
        bg={brand.color}
        size="lg"
        icon={<span className="text-[10px] font-bold">{brand.short}</span>}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={providerId ?? 'Auto'}
      />

      {open && (
        <div className={DROPDOWN_MENU_CLS}>
          <button
            type="button"
            onClick={() => { onSelect(undefined); setOpen(false); }}
            className={clsx(DROPDOWN_ITEM_CLS, !providerId && 'font-semibold')}
          >
            <span
              className="inline-flex w-4 h-4 rounded-full text-[8px] font-bold text-white items-center justify-center shrink-0"
              style={{ backgroundColor: AUTO_BRAND.color }}
            >{AUTO_BRAND.short}</span>
            Auto
          </button>

          {providers.map(p => {
            const b = PROVIDER_BRANDS[p.id] ?? { color: '#6B7280', short: p.id.slice(0, 2) };
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onSelect(p.id); setOpen(false); }}
                className={clsx(DROPDOWN_ITEM_CLS, providerId === p.id && 'font-semibold')}
              >
                <span
                  className="inline-flex w-4 h-4 rounded-full text-[8px] font-bold text-white items-center justify-center shrink-0"
                  style={{ backgroundColor: b.color }}
                >{b.short}</span>
                {p.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Compact operation type icon button with dropdown picker. */
function OperationIconButton({
  operationType,
  onSelect,
  disabled,
}: {
  operationType: string;
  onSelect: (op: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const current = OPERATION_ICONS[operationType] ?? { icon: 'alertCircle' as IconName, label: operationType, color: '#6B7280' };

  return (
    <div ref={ref} className="relative">
      <IconButton
        bg={current.color}
        size="lg"
        icon={<Icon name={current.icon} size={14} />}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={current.label}
      />

      {open && (
        <div className={DROPDOWN_MENU_CLS}>
          {Object.entries(OPERATION_ICONS).map(([op, meta]) => (
            <button
              key={op}
              type="button"
              onClick={() => { onSelect(op); setOpen(false); }}
              className={clsx(DROPDOWN_ITEM_CLS, operationType === op && 'font-semibold')}
            >
              <IconBadge name={meta.icon} size={10} bg={meta.color} rounded="md" className="w-4 h-4 shrink-0" />
              {meta.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import {
  CAP_GENERATION_WIDGET,
  useContextHubOverridesStore,
} from '@features/contextHub';
import { useGenerationWorkbench, useGenerationScopeStores, usePersistedScopeState } from '@features/generation';
import { useCostEstimate, useProviderIdForModel, useProviderAccounts } from '@features/providers';
import { openWorkspacePanel } from '@features/workspace';

import { OPERATION_METADATA } from '@/types/operations';

import {
  EACH_STRATEGIES,
  SET_STRATEGIES,
  isSetStrategy,
  type CombinationStrategy,
} from '../lib/combinationStrategies';

import { AdvancedSettingsPopover } from './AdvancedSettingsPopover';
import { PresetSelector } from './PresetSelector';

export interface GenerationSettingsPanelProps {
  /** Whether to show operation type selector (default: true) */
  showOperationType?: boolean;
  /** Whether to show provider selector (default: true) */
  showProvider?: boolean;
  /** Whether to show preset selector (default: true) */
  showPresets?: boolean;
  /** Optional widget provider id to target this panel for quick add */
  targetProviderId?: string;
  /** Whether generation is in progress */
  generating: boolean;
  /** Whether the Go button should be enabled */
  canGenerate: boolean;
  /** Callback when Go button is clicked */
  onGenerate: () => void;
  /** Custom class name for the container */
  className?: string;
  /** Secondary "Go with Asset" button configuration */
  secondaryButton?: {
    /** Callback when secondary Go button is clicked */
    onGenerate: () => void;
    /** Label override (default: "Go") */
    label?: string;
  };
  /** Params to filter out from display (default: ['image_url', 'image_urls', 'video_url', 'original_video_id', 'source_asset_id', 'source_asset_ids', 'composition_assets', 'negative_prompt', 'prompt']) */
  excludeParams?: string[];
  /** Error message to display */
  error?: string | null;
  /** Queue progress state */
  queueProgress?: { queued: number; total: number } | null;
  /** Callback for burst generation (receives count) */
  onGenerateBurst?: (count: number) => void;
  /** Callback for generate-each mode (one generation per queued asset or group) */
  onGenerateEach?: (strategy?: CombinationStrategy, setId?: string) => void;
  /** Optional node rendered in Row 2 next to Input Sets (e.g. Asset/My Settings toggle) */
  sourceToggle?: ReactNode;
}

// ── Aspect Ratio Dropdown ──────────────────────────────────────────────

function AspectRatioDropdown({
  options,
  currentValue,
  onChange,
  disabled,
}: {
  options: string[];
  currentValue: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const label = getAspectRatioLabel(currentValue);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={clsx(
          'flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
          'bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700',
          'text-neutral-700 dark:text-neutral-200',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {getParamIcon('aspect_ratio', currentValue)}
        <span className="flex-1 text-left truncate">{label}</span>
        <Icon name="chevronDown" size={12} className={clsx('text-neutral-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute z-50 mt-1 left-0 right-0 bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 max-h-[200px] overflow-y-auto"
        >
          {options.map((opt) => {
            const isSelected = currentValue === opt;
            return (
              <button
                type="button"
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={clsx(
                  'flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-left transition-colors',
                  isSelected
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                )}
              >
                {getParamIcon('aspect_ratio', opt)}
                <span>{getAspectRatioLabel(opt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Split-button for "Each" with strategy dropdown. */
function EachSplitButton({
  onGenerateEach,
  disabled,
  generating,
  queueProgress,
}: {
  onGenerateEach: (strategy?: CombinationStrategy, setId?: string) => void;
  disabled: boolean;
  generating: boolean;
  queueProgress?: { queued: number; total: number } | null;
}) {
  const [selectedStrategy, setSelectedStrategy] = usePersistedScopeState<CombinationStrategy>('eachStrategy', 'each');
  const [selectedSetId, setSelectedSetId] = usePersistedScopeState<string | null>('eachSetId', null);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const sets = useAssetSetStore(s => s.sets);

  const current =
    EACH_STRATEGIES.find(s => s.id === selectedStrategy) ??
    SET_STRATEGIES.find(s => s.id === selectedStrategy) ??
    EACH_STRATEGIES[0];
  const showProgress = generating && queueProgress;
  const needsSet = isSetStrategy(selectedStrategy);
  const canRun = !needsSet || !!selectedSetId;

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setAnchorPos({ x: rect.right, y: rect.top });
    }
    setOpen(o => !o);
  };

  const totalItems = EACH_STRATEGIES.length + SET_STRATEGIES.length + 1; // +1 for divider

  return (
    <div className="relative flex-shrink-0">
      <div className="flex">
        {/* Main area — run with selected strategy */}
        <button
          onClick={() => canRun && onGenerateEach(selectedStrategy, selectedSetId ?? undefined)}
          disabled={disabled || !canRun}
          className={clsx(
            'px-2 py-1.5 rounded-l-lg text-[11px] font-semibold text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            disabled || !canRun
              ? 'bg-neutral-400'
              : needsSet
                ? 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
          )}
          style={{ transition: 'none', animation: 'none' }}
          title={current.description}
        >
          {showProgress ? `${queueProgress.queued}/${queueProgress.total}` : current.shortLabel}
        </button>
        {/* Right column: arrow + sets shortcut */}
        <div className="flex flex-col">
          {/* Arrow area — open strategy picker */}
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
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
            )}
            style={{ transition: 'none', animation: 'none' }}
            title="Select combination strategy"
          >
            <Icon name="chevronDown" size={10} className={clsx(open && 'rotate-180')} />
          </button>
          {/* Open Asset Sets panel */}
          <button
            onClick={() => {
              openWorkspacePanel('asset-sets');
            }}
            className={clsx(
              'px-1 py-0.5 rounded-br-lg text-white/70 hover:text-white border-l border-t border-white/20',
              disabled
                ? 'bg-neutral-400'
                : needsSet
                  ? 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
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
        anchorPosition={{ x: anchorPos.x - 180, y: anchorPos.y - (totalItems * 40 + 24) }}
        minWidth="180px"
        triggerRef={triggerRef}
        className="!p-0"
      >
        {/* Input strategies section */}
        <div className="px-2 pt-1.5 pb-0.5 text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">Input</div>
        {EACH_STRATEGIES.map(s => (
          <DropdownItem
            key={s.id}
            onClick={() => { setSelectedStrategy(s.id); setSelectedSetId(null); setOpen(false); }}
            className={clsx(selectedStrategy === s.id && 'font-semibold')}
            icon={
              <span className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                selectedStrategy === s.id ? 'bg-amber-500' : 'bg-neutral-300 dark:bg-neutral-600'
              )} />
            }
          >
            <div className="flex flex-col items-start">
              <span>{s.label}</span>
              <span className="text-[9px] text-neutral-400">{s.description}</span>
            </div>
          </DropdownItem>
        ))}

        {/* Divider + set strategies section */}
        <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
        <div className="px-2 pt-0.5 pb-0.5 text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">Asset Set</div>
        {SET_STRATEGIES.map(s => (
          <DropdownItem
            key={s.id}
            onClick={() => { setSelectedStrategy(s.id); setOpen(false); }}
            className={clsx(selectedStrategy === s.id && 'font-semibold')}
            icon={
              <span className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                selectedStrategy === s.id ? 'bg-violet-500' : 'bg-neutral-300 dark:bg-neutral-600'
              )} />
            }
          >
            <div className="flex flex-col items-start">
              <span>{s.label}</span>
              <span className="text-[9px] text-neutral-400">{s.description}</span>
            </div>
          </DropdownItem>
        ))}
      </Dropdown>

      {/* Inline set picker when a set strategy is selected */}
      {needsSet && (
        <select
          value={selectedSetId ?? ''}
          onChange={(e) => setSelectedSetId(e.target.value || null)}
          className="mt-1 w-full px-1.5 py-1 text-[10px] rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
          title="Select asset set"
        >
          <option value="">Pick a set…</option>
          {sets.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.kind === 'manual' ? `${s.assetIds.length} assets` : 'smart'})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function GenerationSettingsPanel({
  showOperationType = true,
  showProvider = true,
  showPresets = true,
  targetProviderId,
  generating,
  canGenerate,
  onGenerate,
  className,
  secondaryButton,
  excludeParams = ['image_url', 'image_urls', 'video_url', 'original_video_id', 'source_asset_id', 'source_asset_ids', 'composition_assets', 'negative_prompt', 'prompt', 'mask_url', 'mask_source'],
  error,
  queueProgress,
  onGenerateBurst,
  onGenerateEach,
  sourceToggle,
}: GenerationSettingsPanelProps) {
  const { useSessionStore, useInputStore } = useGenerationScopeStores();
  const operationType = useSessionStore(s => s.operationType);
  const providerId = useSessionStore(s => s.providerId);
  const setProvider = useSessionStore(s => s.setProvider);
  const setOperationType = useSessionStore(s => s.setOperationType);

  // Burst mode - persisted in session store uiState
  const [burstCount, setBurstCount] = usePersistedScopeState('burstCount', 1);
  const isBurstMode = burstCount > 1;

  // Input count from scoped store
  const inputCount = useInputStore(s => s.inputsByOperation[operationType]?.items?.length ?? 0);
  // Read preferred provider directly from state slice for reliable reactivity
  // (getPreferredProviderId uses get() internally which can cause stale selector reads)
  const preferredProviderId = useContextHubOverridesStore(
    (state) => state.overrides[CAP_GENERATION_WIDGET as string]?.preferredProviderId
  );
  const setPreferredProvider = useContextHubOverridesStore((state) => state.setPreferredProvider);
  const clearOverride = useContextHubOverridesStore((state) => state.clearOverride);
  const isTargeted = !!targetProviderId && preferredProviderId === targetProviderId;
  const canTarget = !!targetProviderId;

  // Use the shared generation workbench hook for settings management
  const workbench = useGenerationWorkbench({ operationType });

  const modelProviderId = useProviderIdForModel(
    workbench.dynamicParams?.model as string | undefined
  );
  const inferredProviderId = providerId ?? modelProviderId;

  // Account selector (rendered inside AdvancedSettingsPopover)
  const { accounts: allAccounts } = useProviderAccounts(inferredProviderId);
  const activeAccounts = useMemo(
    () => allAccounts.filter(a => a.status === 'active'),
    [allAccounts]
  );

  // Credit estimation for Go button
  const { estimate: costEstimate, loading: creditLoading } = useCostEstimate({
    providerId: inferredProviderId,
    operationType,
    params: workbench.dynamicParams,
  });
  const creditEstimate = costEstimate?.estimated_credits ?? null;

  // Filter params based on operation type
  const filteredParamSpecs = useMemo(() => {
    const hideParams = new Set<string>();

    if (operationType === 'video_transition') {
      hideParams.add('duration');
    }

    // Operations that inherit aspect ratio from source (don't support custom aspect_ratio)
    const INHERITS_ASPECT_RATIO = new Set(['image_to_video', 'video_extend']);
    if (INHERITS_ASPECT_RATIO.has(operationType)) {
      hideParams.add('aspect_ratio');
    }

    // Add excluded params
    excludeParams.forEach(p => hideParams.add(p));

    if (hideParams.size === 0) {
      return workbench.paramSpecs;
    }

    return workbench.paramSpecs.filter(p => !hideParams.has(p.name));
  }, [operationType, workbench.paramSpecs, excludeParams]);

  // Advanced params: those not shown in the main settings panel
  const advancedParams = useMemo(() => {
    const PRIMARY_PARAMS = ['model', 'quality', 'duration', 'aspect_ratio', 'motion_mode', 'camera_movement'];
    const HIDDEN_PARAMS = ['image_url', 'image_urls', 'prompt', 'prompts', 'video_url', 'original_video_id', 'source_asset_id', 'source_asset_ids', 'composition_assets'];

    return filteredParamSpecs.filter(p => {
      if (PRIMARY_PARAMS.includes(p.name)) return false;
      if (HIDDEN_PARAMS.includes(p.name)) return false;
      return true;
    });
  }, [filteredParamSpecs]);

  // Get duration presets from param specs metadata
  const durationOptions = useMemo(
    () => getDurationOptions(workbench.paramSpecs, workbench.dynamicParams?.model)?.options ?? null,
    [workbench.paramSpecs, workbench.dynamicParams?.model]
  );

  // Get quality options filtered by model
  const qualityOptionsForModel = useMemo(
    () => getQualityOptions(workbench.paramSpecs, workbench.dynamicParams?.model),
    [workbench.paramSpecs, workbench.dynamicParams?.model]
  );

  // Reset quality when model changes and current quality is invalid
  useEffect(() => {
    if (!qualityOptionsForModel) return;
    const currentQuality = workbench.dynamicParams?.quality;
    if (currentQuality && !qualityOptionsForModel.includes(currentQuality)) {
      workbench.handleParamChange('quality', qualityOptionsForModel[0]);
    } else if (!currentQuality && qualityOptionsForModel.length > 0) {
      workbench.handleParamChange('quality', qualityOptionsForModel[0]);
    }
  }, [qualityOptionsForModel, workbench.dynamicParams?.quality, workbench.handleParamChange]);

  const showTargetButton = canTarget;

  return (
    <div className={clsx('h-full overflow-y-auto thin-scrollbar bg-neutral-50 dark:bg-neutral-900 rounded-xl', className)}>
      <div className="flex flex-col gap-1 p-1.5">
        {/* Row 1: Provider icon, Operation type, Target, Advanced settings */}
        <div className="flex gap-1 items-center">
          {showProvider && (
            <ProviderIconButton
              providerId={providerId}
              providers={workbench.providers}
              onSelect={(id) => setProvider(id)}
              disabled={generating}
            />
          )}
          {showOperationType && (
            <OperationIconButton
              operationType={operationType}
              onSelect={(op) => setOperationType(op as any)}
              disabled={generating}
            />
          )}
          {showTargetButton && (
            <button
              type="button"
              onClick={() => {
                if (!targetProviderId) return;
                if (isTargeted) {
                  clearOverride(CAP_GENERATION_WIDGET);
                  return;
                }
                setPreferredProvider(CAP_GENERATION_WIDGET, targetProviderId);
              }}
              className={clsx(
                'flex items-center justify-center px-2 py-1.5 rounded-lg border text-[10px] font-medium',
                isTargeted
                  ? 'bg-accent border-accent text-accent-text'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
              )}
              title={isTargeted ? 'Targeted for quick add' : 'Target this quick generate for quick add'}
            >
              <Icon name="target" size={12} />
            </button>
          )}
          {sourceToggle && <div className="ml-auto">{sourceToggle}</div>}
        </div>

        {/* Row 2: Input Sets */}
        {showPresets && (
          <div className="flex items-center gap-1">
            <PresetSelector disabled={generating} />
          </div>
        )}

        {/* Mask attached indicator */}
        {workbench.dynamicParams?.mask_url && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/15 border border-accent/30">
            <Icon name="paintbrush" size={11} className="text-accent" />
            <span className="text-[11px] text-accent font-medium">Mask attached</span>
            <button
              type="button"
              onClick={() => workbench.handleParamChange('mask_url', undefined)}
              className="ml-auto p-0.5 rounded hover:bg-accent/30 text-accent hover:text-accent-hover transition-colors"
              title="Remove mask"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        )}

        {/* Dynamic params */}
        {filteredParamSpecs.map(param => {
          if (param.type === 'boolean') return null;
          if (param.type === 'string' && !param.enum) return null;

          // Duration dropdown
          if (param.name === 'duration' && param.type === 'number' && durationOptions) {
            const currentDuration = Number(workbench.dynamicParams[param.name]) || durationOptions[0];
            return (
              <select
                key="duration"
                value={currentDuration}
                onChange={(e) => workbench.handleParamChange('duration', Number(e.target.value))}
                disabled={generating}
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
                title="Duration"
              >
                {durationOptions.map((seconds) => (
                  <option key={seconds} value={seconds}>{seconds}s</option>
                ))}
              </select>
            );
          }

          const options = param.name === 'quality' && qualityOptionsForModel
            ? qualityOptionsForModel
            : (param.enum && param.enum.length > 0)
              ? param.enum
              : (param.name === 'aspect_ratio' ? COMMON_ASPECT_RATIOS : null);

          if (param.type === 'number' && !options) {
            return (
              <input
                key={param.name}
                type="number"
                value={workbench.dynamicParams[param.name] ?? param.default ?? ''}
                onChange={(e) => workbench.handleParamChange(param.name, e.target.value === '' ? undefined : Number(e.target.value))}
                disabled={generating}
                placeholder={param.name}
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
                title={param.name}
              />
            );
          }

          if (!options) return null;

          // Visual params that should show as button grids with icons
          const showAsVisualGrid = isVisualParam(param.name);
          const currentValue = workbench.dynamicParams[param.name] ?? param.default ?? options[0];

          // Aspect ratio: dropdown picker
          if (param.name === 'aspect_ratio') {
            return (
              <AspectRatioDropdown
                key={param.name}
                options={options}
                currentValue={currentValue}
                onChange={(val) => workbench.handleParamChange(param.name, val)}
                disabled={generating}
              />
            );
          }

          // Show as button grid for visual params
          const isIconOnly = param.name === 'quality';
          const gridLimit = isIconOnly ? 14 : 8;
          if (showAsVisualGrid && options.length <= gridLimit) {
            return (
              <div key={param.name} className="flex flex-wrap gap-1">
                {options.map((opt: string) => {
                  const icon = getParamIcon(param.name, opt);
                  const isSelected = currentValue === opt;

                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => workbench.handleParamChange(param.name, opt)}
                      disabled={generating}
                      className={clsx(
                        'rounded-lg text-[11px] font-medium transition-colors duration-200',
                        'flex items-center',
                        isIconOnly ? 'px-1.5 py-1 justify-center' : 'px-2 py-1 gap-1.5',
                        isSelected
                          ? 'bg-accent text-accent-text shadow-sm'
                          : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-accent-subtle dark:hover:bg-neutral-700'
                      )}
                      title={opt}
                    >
                      {icon}
                      {!isIconOnly && <span>{opt}</span>}
                    </button>
                  );
                })}
              </div>
            );
          }

          // Fallback to dropdown for non-visual params or long lists
          return (
            <select
              key={param.name}
              value={currentValue}
              onChange={(e) => workbench.handleParamChange(param.name, e.target.value)}
              disabled={generating}
              className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
              title={param.name}
            >
              {options.map((opt: string) => (
                <option key={opt} value={opt}>
                  {param.name === 'aspect_ratio' ? getAspectRatioLabel(opt) : opt}
                </option>
              ))}
            </select>
          );
        })}

        {/* Go button — sticky so it stays visible when scrolling */}
        <div className="sticky bottom-0 flex flex-col gap-1 -mx-1.5 px-1.5 pb-1.5 pt-1 bg-neutral-50 dark:bg-neutral-900">
        {/* Queue progress */}
        {queueProgress && (
          <div className="flex items-center gap-2 text-[10px] text-accent">
            <div className="flex-1 bg-neutral-200 dark:bg-neutral-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-accent h-full transition-all duration-300"
                style={{ width: `${(queueProgress.queued / queueProgress.total) * 100}%` }}
              />
            </div>
            <span className="font-medium">{queueProgress.queued}/{queueProgress.total}</span>
          </div>
        )}

        {/* Error message - for prompt rejections only */}
        {error && (
          <div
            className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded border border-red-200 dark:border-red-800"
            style={{ transition: 'none', animation: 'none' }}
          >
            Error: {error}
          </div>
        )}

        {/* Action row: gear, burst, queued, [Each], Go, [Secondary] */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Advanced settings gear icon */}
          <div className="flex-shrink-0">
            <AdvancedSettingsPopover
              params={advancedParams}
              values={workbench.dynamicParams}
              onChange={workbench.handleParamChange}
              disabled={generating}
              currentModel={workbench.dynamicParams?.model as string | undefined}
              accounts={activeAccounts}
            />
          </div>

          {/* Burst count — collapses first */}
          <div className="flex items-center gap-0.5 min-w-0 flex-shrink text-[10px] overflow-hidden">
            <input
              type="number"
              min={1}
              max={50}
              value={burstCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setBurstCount(Math.max(1, Math.min(50, val)));
              }}
              disabled={generating}
              className={clsx(
                'w-10 px-1 py-1.5 rounded-md font-medium border-0 shadow-sm text-center text-[10px]',
                isBurstMode
                  ? 'bg-accent text-accent-text'
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
              )}
              title="Number of generations to run"
            />
            <span className="text-neutral-500">×</span>
          </div>

          {/* Queued indicator — hides when tight */}
          {inputCount > 0 && (
            <div className="flex-shrink text-[10px] text-neutral-500 dark:text-neutral-400 overflow-hidden whitespace-nowrap min-w-0">
              <span className="font-mono text-accent">{inputCount}</span>
              <span className="ml-0.5">in</span>
            </div>
          )}

          {/* Generate Each split-button — visible with 2+ inputs or when sets exist */}
          {onGenerateEach && (inputCount > 1 || useAssetSetStore.getState().sets.length > 0) && OPERATION_METADATA[operationType].multiAssetMode !== 'required' && (
            <EachSplitButton
              onGenerateEach={onGenerateEach}
              disabled={generating || !canGenerate}
              generating={generating}
              queueProgress={queueProgress}
            />
          )}

          {/* Primary Go button — always visible */}
          <button
            onClick={() => {
              if (isBurstMode && onGenerateBurst) {
                onGenerateBurst(burstCount);
              } else {
                onGenerate();
              }
            }}
            disabled={generating || !canGenerate}
            className={clsx(
              'flex-1 min-w-[48px] flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-semibold text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              generating || !canGenerate
                ? 'bg-neutral-400'
                : error
                ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                : 'bg-accent hover:bg-accent-hover'
            )}
            style={{ transition: 'none', animation: 'none' }}
          >
            {generating ? (
              queueProgress ? `${queueProgress.queued}/${queueProgress.total}` : '...'
            ) : creditLoading ? (
              isBurstMode ? `Go x${burstCount}` : 'Go'
            ) : creditEstimate !== null ? (
              <span className="flex items-center justify-center gap-1">
                {isBurstMode ? `Go x${burstCount}` : 'Go'}
                <span className="text-amber-200 text-[10px]">
                  +{Math.round(creditEstimate * burstCount)}
                </span>
              </span>
            ) : (
              isBurstMode ? `Go x${burstCount}` : 'Go'
            )}
          </button>

          {/* Secondary Go button (with media viewer asset) */}
          {secondaryButton && (
            <button
              onClick={secondaryButton.onGenerate}
              disabled={generating || !canGenerate}
              className={clsx(
                'flex-1 min-w-[48px] flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-semibold text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                generating || !canGenerate
                  ? 'bg-neutral-400'
                  : error
                  ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
              )}
              style={{ transition: 'none', animation: 'none' }}
              title="Generate using Media Viewer asset"
            >
              {generating ? (
                '...'
              ) : creditLoading ? (
                secondaryButton.label || 'Go'
              ) : creditEstimate !== null ? (
                <span className="flex items-center justify-center gap-1">
                  {secondaryButton.label || 'Go'} <span className="text-amber-200 text-[10px]">+{Math.round(creditEstimate)}</span>
                </span>
              ) : (
                secondaryButton.label || 'Go'
              )}
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
