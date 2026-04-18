/**
 * GenerationSettingsPanel
 *
 * Reusable generation settings panel with operation type, provider,
 * model, quality, duration controls, and Go button with cost estimate.
 *
 * Used by both Control Center and Media Viewer for consistent UI.
 */

import clsx from 'clsx';
import { useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { getAspectRatioLabel } from '@lib/generation-ui';
import { Icon } from '@lib/icons';

import { useAccentButtonClasses } from '@features/appearance';
import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import {
  CAP_GENERATION_WIDGET,
  useContextHubOverridesStore,
} from '@features/contextHub';
import { useGenerationWorkbench, useGenerationScopeStores, usePersistedScopeState } from '@features/generation';
import { useAuthoringHintsStore, type AuthoringHints } from '@features/generation/stores/authoringHintsStore';
import { useCostEstimate, useProviderIdForModel, useProviderAccounts, useUnlimitedModels, useModelPromotions } from '@features/providers';
import { providerCapabilityRegistry } from '@features/providers';

import { OPERATION_METADATA, OPERATION_TYPES, type OperationType } from '@/types/operations';

import type { FanoutRunOptions } from '../lib/fanoutPresets';

import { AdvancedSettingsPopover } from './AdvancedSettingsPopover';
import { AccountIconButton } from './generationSettingsPanel/AccountIconButton';
import { EachSplitButton } from './generationSettingsPanel/EachSplitButton';
import { GenerationParamControls } from './generationSettingsPanel/GenerationParamControls';
import {
  filterQuickGenStyleParamSpecs,
  getQuickGenStyleAdvancedParamSpecs,
} from './generationSettingsPanel/generationParamFilters';
import { MaskPicker } from './generationSettingsPanel/MaskPicker';
import { OperationIconButton } from './generationSettingsPanel/OperationIconButton';
import { ProviderIconButton } from './generationSettingsPanel/ProviderIconButton';
import { PresetSelector } from './PresetSelector';

function getModelMatchKeys(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, '');
  const lastSegment = lower.split(/[/:]/).filter(Boolean).at(-1) ?? lower;
  const compactLastSegment = lastSegment.replace(/[\s_-]+/g, '');
  return [trimmed, lower, compact, lastSegment, compactLastSegment];
}

function isModelInUnlimitedSet(unlimitedModels: Set<string>, value: unknown): boolean {
  return getModelMatchKeys(value).some((key) => unlimitedModels.has(key));
}

function toPositiveId(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

type MaskSourceAssetLike =
  | {
      id?: unknown;
      providerAssetId?: unknown;
      last_upload_asset_id?: unknown;
      lastUploadAssetId?: unknown;
      parentAssetId?: unknown;
      parent_asset_id?: unknown;
      uploadContext?: Record<string, unknown> | null;
      upload_context?: Record<string, unknown> | null;
    }
  | null
  | undefined;

function pushUniquePositiveId(target: number[], value: unknown): void {
  const id = toPositiveId(value);
  if (id && !target.includes(id)) {
    target.push(id);
  }
}

/**
 * Resolve all plausible backend source IDs for mask lookup.
 * This lets linked masks appear even when the selected input is a sibling
 * variant (local folder mirror, library upload, or version-chain relative).
 */
function resolveMaskSourceAssetIds(asset: MaskSourceAssetLike): number[] {
  if (!asset) return [];
  const resolved: number[] = [];

  pushUniquePositiveId(resolved, asset.last_upload_asset_id);
  pushUniquePositiveId(resolved, asset.lastUploadAssetId);
  pushUniquePositiveId(resolved, asset.id);
  pushUniquePositiveId(resolved, asset.providerAssetId);
  pushUniquePositiveId(resolved, asset.parentAssetId);
  pushUniquePositiveId(resolved, asset.parent_asset_id);

  const uploadContext =
    (asset.uploadContext ?? asset.upload_context) as Record<string, unknown> | null | undefined;
  if (uploadContext) {
    pushUniquePositiveId(resolved, uploadContext.source_asset_id);
    const sourceAssetIds = uploadContext.source_asset_ids;
    if (Array.isArray(sourceAssetIds)) {
      sourceAssetIds.forEach((id) => pushUniquePositiveId(resolved, id));
    }
  }

  return resolved;
}

const OP_SHORT: Record<string, string> = {
  text_to_image: 'T2I',
  text_to_video: 'T2V',
  image_to_video: 'I2V',
  image_to_image: 'I2I',
  video_extend: 'V-Ext',
  video_transition: 'V-Trans',
  video_modify: 'V-Mod',
  fusion: 'Fusion',
};

function formatParamLabel(key: string): string {
  if (key === 'aspect_ratio') return 'ratio';
  return key.replace(/_/g, ' ');
}

function formatParamValue(key: string, value: unknown): string {
  if (key === 'aspect_ratio' && typeof value === 'string') return getAspectRatioLabel(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  try { return JSON.stringify(value); } catch { return String(value); }
}

function AuthoringHintsBadges({
  hints,
  currentOperation,
  currentParams,
  onToggleOperation,
  onToggleParam,
}: {
  hints: AuthoringHints;
  currentOperation: string;
  currentParams: Record<string, any>;
  onToggleOperation: () => void;
  onToggleParam: (key: string, value: unknown) => void;
}) {
  const entries = Object.entries(hints.suggestedParams);
  if (!hints.suggestedOperation && entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 px-0.5">
      <Icon name="sparkles" size={10} className="text-neutral-400 dark:text-neutral-500 flex-shrink-0" />
      {hints.suggestedOperation && (() => {
        const match = currentOperation === hints.suggestedOperation;
        const cls = match
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
          : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40';
        const label = OP_SHORT[hints.suggestedOperation] ?? hints.suggestedOperation;
        return (
          <button
            type="button"
            onClick={onToggleOperation}
            title={match ? `Operation: ${label} (active)` : `Suggested: ${label} — click to apply`}
            className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${cls}`}
          >
            {match && <Icon name="check" size={9} />}
            {!match && <Icon name="alertCircle" size={9} />}
            op: {label}
            {!match && <span className="opacity-70">({OP_SHORT[currentOperation] ?? currentOperation})</span>}
          </button>
        );
      })()}
      {entries.map(([key, value]) => {
        const current = currentParams?.[key];
        const isEmpty = current === undefined || current === null || current === '';
        const isMatch = !isEmpty && String(current) === String(value);
        const isConflict = !isEmpty && !isMatch;
        const cls = isMatch
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
          : isConflict
            ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
            : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40';
        const tooltip = isMatch
          ? `${key}: ${formatParamValue(key, value)} (applied — click to clear)`
          : isConflict
            ? `${key}: suggested ${formatParamValue(key, value)}, current ${formatParamValue(key, current)} — click to apply`
            : `${key}: ${formatParamValue(key, value)} — click to apply`;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggleParam(key, value)}
            title={tooltip}
            className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${cls}`}
          >
            {isMatch && <Icon name="check" size={9} />}
            {isConflict && <Icon name="alertCircle" size={9} />}
            {formatParamLabel(key)}: {formatParamValue(key, value)}
            {isConflict && <span className="opacity-70">({formatParamValue(key, current)})</span>}
          </button>
        );
      })}
    </div>
  );
}

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
  /** Callback for sequential burst generation (waits for each run to complete before the next) */
  onGenerateSequentialBurst?: (count: number) => void;
  /** Callback for generate-each mode (one generation per queued asset or group) */
  onGenerateEach?: (options?: FanoutRunOptions) => void;
  /** Callback to generate using only the currently selected carousel input (receives burst count) */
  onGenerateCurrentOnly?: (count?: number) => void;
  /** Optional node rendered in Row 2 next to Presets (e.g. Asset/My Settings toggle) */
  sourceToggle?: ReactNode;
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
  onGenerateSequentialBurst,
  onGenerateEach,
  onGenerateCurrentOnly,
  sourceToggle,
}: GenerationSettingsPanelProps) {
  const { id: scopeId, useSessionStore, useInputStore } = useGenerationScopeStores();
  const operationType = useSessionStore(s => s.operationType);
  const providerId = useSessionStore(s => s.providerId);
  const setProvider = useSessionStore(s => s.setProvider);
  const setOperationType = useSessionStore(s => s.setOperationType);
  const switchProviderInputs = useInputStore(s => s.switchProviderInputs);
  const setCurrentProviderForOp = useInputStore(s => s.setCurrentProviderForOp);
  const taggedProviderForOp = useInputStore(s => s.currentProviderByOp[operationType]);
  const [perProviderInputs] = usePersistedScopeState('perProviderInputs', false, { stable: true });

  // Burst mode - persisted per operation type in session store uiState
  const [burstCount, setBurstCount] = usePersistedScopeState(`burstCount:${operationType}`, 1);
  const [burstSequentialMode, setBurstSequentialMode] = usePersistedScopeState(`burstSequentialMode:${operationType}`, false);
  const isBurstMode = burstCount > 1;
  const canUseSequentialBurst = !!onGenerateSequentialBurst;

  // Non-passive wheel listener for burst count stepper (React onWheel is passive)
  const burstWheelRef = useRef<HTMLDivElement>(null);
  const burstWheelStateRef = useRef({ generating, canGenerate, setBurstCount });
  burstWheelStateRef.current = { generating, canGenerate, setBurstCount };
  useEffect(() => {
    const el = burstWheelRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const { generating: g, canGenerate: c, setBurstCount: set } = burstWheelStateRef.current;
      if (g || !c) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        set((v: number) => Math.min(50, v + 1));
      } else if (e.deltaY > 0) {
        set((v: number) => Math.max(1, v - 1));
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Input count and current index from scoped store
  const inputCount = useInputStore(s => s.inputsByOperation[operationType]?.items?.length ?? 0);
  const currentIndex = useInputStore(s => s.inputsByOperation[operationType]?.currentIndex ?? 1);
  const isOnEmptySlot = inputCount === 0 || (inputCount > 0 && currentIndex > inputCount);
  // Read preferred provider directly from state slice for reliable reactivity
  // (getPreferredProviderId uses get() internally which can cause stale selector reads)
  const preferredProviderId = useContextHubOverridesStore(
    (state) => state.overrides[CAP_GENERATION_WIDGET as string]?.preferredProviderId
  );
  const setPreferredProvider = useContextHubOverridesStore((state) => state.setPreferredProvider);
  const clearOverride = useContextHubOverridesStore((state) => state.clearOverride);
  const isTargeted = !!targetProviderId && preferredProviderId === targetProviderId;
  const canTarget = !!targetProviderId;

  // Button style from appearance settings
  const btn = useAccentButtonClasses();

  // Use the shared generation workbench hook for settings management
  const workbench = useGenerationWorkbench({ operationType });

  const modelProviderId = useProviderIdForModel(
    workbench.dynamicParams?.model as string | undefined
  );
  const inferredProviderId = providerId ?? modelProviderId;

  // Seed the store's currentProviderByOp tag once per {op, provider} pair so
  // that the first switchProviderInputs call saves the current items under
  // the right bucket.  We only seed when the tag is missing — subsequent
  // writes happen through switchProviderInputs itself, which preserves the
  // tag against model-triggered inferredProviderId drift.
  useEffect(() => {
    if (!perProviderInputs) return;
    if (!inferredProviderId) return;
    if (taggedProviderForOp !== undefined) return;
    setCurrentProviderForOp(operationType, inferredProviderId);
  }, [perProviderInputs, inferredProviderId, taggedProviderForOp, operationType, setCurrentProviderForOp]);

  // Account selector data (used by row picker + AdvancedSettingsPopover)
  const { accounts: allAccounts } = useProviderAccounts(inferredProviderId);
  const activeAccounts = useMemo(
    () => allAccounts.filter(a => a.status === 'active'),
    [allAccounts]
  );

  // Account context for free/promo model resolution
  const preferredAccountIdRaw = workbench.dynamicParams?.preferred_account_id;
  const preferredAccountId = (() => {
    if (preferredAccountIdRaw === undefined || preferredAccountIdRaw === null || preferredAccountIdRaw === '') {
      return undefined;
    }
    const n = Number(preferredAccountIdRaw);
    return Number.isFinite(n) ? n : undefined;
  })();
  const knownModelIds = useMemo(() => {
    const known = new Set<string>();
    for (const spec of workbench.paramSpecs) {
      if (spec.name !== 'model' || !Array.isArray(spec.enum)) continue;
      for (const model of spec.enum) {
        if (typeof model === 'string' && model.trim()) known.add(model.trim());
      }
    }
    return Array.from(known);
  }, [workbench.paramSpecs]);
  const unlimitedModels = useUnlimitedModels(preferredAccountId, inferredProviderId);
  const {
    promoted: promotedModels,
    discounts: modelDiscounts,
    unknownPromotions,
  } = useModelPromotions(preferredAccountId, inferredProviderId, knownModelIds);
  const unknownPromotionModels = useMemo(
    () => Array.from(unknownPromotions).sort(),
    [unknownPromotions]
  );
  const hasUnknownPromotionPricing = unknownPromotionModels.length > 0;
  const unknownPromotionTooltip = useMemo(() => {
    if (!hasUnknownPromotionPricing) return '';
    const preview = unknownPromotionModels.slice(0, 4).join(', ');
    const extraCount = unknownPromotionModels.length - 4;
    return `Promotion detected without local pricing mapping: ${preview}${extraCount > 0 ? ` +${extraCount}` : ''}. Open Advanced Settings for details.`;
  }, [hasUnknownPromotionPricing, unknownPromotionModels]);

  // Credit estimation for Go button (inject active discounts for accurate estimate).
  // Only apply promotional discounts when a specific account is pinned — in Auto
  // mode the backend picks the account which may not have the promo, so showing
  // the discounted price would be misleading.
  const costParams = useMemo(() => {
    const hasDiscounts = preferredAccountId != null && Object.keys(modelDiscounts).length > 0;
    return hasDiscounts
      ? { ...workbench.dynamicParams, discounts: modelDiscounts }
      : workbench.dynamicParams;
  }, [workbench.dynamicParams, modelDiscounts, preferredAccountId]);
  const { estimate: costEstimate, loading: creditLoading } = useCostEstimate({
    providerId: inferredProviderId,
    operationType,
    params: costParams,
  });
  const creditEstimate = costEstimate?.estimated_credits ?? null;

  const currentModel = workbench.dynamicParams?.model as string | undefined;
  const isModelUnlimited = isModelInUnlimitedSet(unlimitedModels, currentModel);
  const isCurrentGenerationFree = isModelUnlimited || (creditEstimate !== null && creditEstimate <= 0);

  const filteredParamSpecs = useMemo(() => {
    return filterQuickGenStyleParamSpecs(workbench.paramSpecs, operationType, excludeParams);
  }, [operationType, workbench.paramSpecs, excludeParams]);

  // OpenAPI toggle visibility: only for Pixverse, only when the resolvable
  // account actually has OpenAPI credits.  In auto mode we check whether any
  // active account has some; when a specific account is pinned we check that
  // account directly.  Image operations cannot use OpenAPI (adapter enforces),
  // so hide the toggle for those too.
  const showApiMethodToggle = useMemo(() => {
    if (inferredProviderId !== 'pixverse') return false;
    if (operationType === 'text_to_image' || operationType === 'image_to_image'
      || operationType === 'video_transition' || operationType === 'video_modify') {
      return false;
    }
    const hasOpenapi = (account: typeof activeAccounts[number]) => {
      const credits = (account as { credits?: Record<string, number> | null }).credits;
      return !!credits && typeof credits.openapi === 'number' && credits.openapi > 0;
    };
    if (preferredAccountId == null) {
      return activeAccounts.some(hasOpenapi);
    }
    const chosen = activeAccounts.find((a) => a.id === preferredAccountId);
    return !!chosen && hasOpenapi(chosen);
  }, [inferredProviderId, operationType, preferredAccountId, activeAccounts]);

  // Clear a stale api_method override when the toggle stops being applicable
  // (e.g., user switches provider or to an op that can't use OpenAPI).
  useEffect(() => {
    if (!showApiMethodToggle && workbench.dynamicParams?.api_method !== undefined) {
      workbench.handleParamChange('api_method', undefined);
    }
  }, [showApiMethodToggle, workbench.dynamicParams?.api_method, workbench.handleParamChange]);

  const advancedParams = useMemo(() => {
    return getQuickGenStyleAdvancedParamSpecs(filteredParamSpecs);
  }, [filteredParamSpecs]);

  // Mask picker: detect if provider exposes mask_url param AND current model supports it
  const hasMaskParam = useMemo(() => {
    const maskSpec = workbench.allParamSpecs.find((p) => p.name === 'mask_url');
    if (!maskSpec) return false;
    // Check visible_when: { param_name: [allowed_values] }
    const visibleWhen = maskSpec.metadata?.visible_when;
    if (visibleWhen && typeof visibleWhen === 'object') {
      for (const [param, allowedValues] of Object.entries(visibleWhen)) {
        const currentValue = workbench.dynamicParams?.[param];
        if (Array.isArray(allowedValues) && currentValue != null && !allowedValues.includes(currentValue)) {
          return false;
        }
      }
    }
    return true;
  }, [workbench.allParamSpecs, workbench.dynamicParams]);
  // Read mask and asset ID from the current input item (per-asset masks)
  const {
    currentInputId,
    currentInputAsset,
    currentInputMaskUrl,
    currentInputMaskLayers,
  } = useInputStore(
    useShallow((s) => {
      const inputs = s.inputsByOperation[operationType];
      if (!inputs || inputs.items.length === 0) {
        return {
          currentInputId: null,
          currentInputAsset: null,
          currentInputMaskUrl: undefined,
          currentInputMaskLayers: undefined,
        };
      }
      const idx = Math.max(0, Math.min(inputs.currentIndex - 1, inputs.items.length - 1));
      const item = inputs.items[idx];
      return {
        currentInputId: item?.id ?? null,
        currentInputAsset: item?.asset ?? null,
        currentInputMaskUrl: item?.maskUrl,
        currentInputMaskLayers: item?.maskLayers,
      };
    }),
  );
  const currentInputSourceAssetIds = useMemo(
    () => resolveMaskSourceAssetIds(currentInputAsset as MaskSourceAssetLike),
    [currentInputAsset],
  );
  const currentInputAssetId = currentInputSourceAssetIds[0] ?? null;
  const addMaskLayer = useInputStore((s) => s.addMaskLayer);
  const removeMaskLayer = useInputStore((s) => s.removeMaskLayer);
  const updateMaskLayer = useInputStore((s) => s.updateMaskLayer);
  const setMaskLayers = useInputStore((s) => s.setMaskLayers);

  const showTargetButton = canTarget;

  // Authoring hints — only shown when the authoring editor has synced hints for this scope
  const authoringHints: AuthoringHints | undefined = useAuthoringHintsStore(
    (s) => s.byScopeId[scopeId],
  );
  const hasAuthoringHints = !!authoringHints && (
    authoringHints.suggestedOperation != null
    || Object.keys(authoringHints.suggestedParams).length > 0
  );

  return (
    <div className={clsx('h-full flex flex-col bg-neutral-50 dark:bg-neutral-900 rounded-xl', className)}>
      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
      <div className="gen-panel-content flex flex-col gap-1 p-1.5">
        {/* Row 1: Provider icon, Operation type, Target, Advanced settings */}
        <div className="flex flex-wrap gap-1 items-center">
          {showProvider && (
            <ProviderIconButton
              providerId={inferredProviderId}
              providers={workbench.providers}
              onSelect={(id) => {
                // Save/restore inputs per provider when enabled.  The store
                // tracks the "old" provider itself (see currentProviderByOp),
                // so drift in `inferredProviderId` from model changes cannot
                // route items to the wrong bucket.
                if (perProviderInputs && inferredProviderId !== id) {
                  switchProviderInputs(operationType, id);
                }
                // setProvider handles prompt + param save/restore atomically
                setProvider(id);
                // Auto-switch operation if current one isn't supported by the new provider
                if (!providerCapabilityRegistry.supportsOperation(id, operationType)) {
                  const fallback = OPERATION_TYPES.find(
                    (op) => OPERATION_METADATA[op].icon && OPERATION_METADATA[op].color
                      && providerCapabilityRegistry.supportsOperation(id, op),
                  );
                  if (fallback) setOperationType(fallback);
                }
              }}
              disabled={generating}
            />
          )}
          {showOperationType && (
            <OperationIconButton
              operationType={operationType}
              onSelect={(op) => setOperationType(op as OperationType)}
              disabled={generating}
              providerId={inferredProviderId}
              textMode={isOnEmptySlot && (operationType === 'image_to_video' || operationType === 'image_to_image')}
            />
          )}
          {(activeAccounts.length > 0 || preferredAccountId != null) && (
            <AccountIconButton
              accounts={activeAccounts}
              selectedAccountId={preferredAccountId}
              onSelect={(id) => workbench.handleParamChange('preferred_account_id', id)}
              disabled={generating}
              operationType={operationType}
              model={currentModel}
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
              title={isTargeted ? 'Targeted for generation actions' : 'Target this widget for generation actions (quick add, gestures, etc.)'}
            >
              <Icon name="target" size={12} />
            </button>
          )}
          {showPresets && <PresetSelector disabled={generating} />}
          {/* Credit estimate pill — compact cost indicator */}
          {!isCurrentGenerationFree && creditEstimate !== null && !creditLoading && (
            <span
              className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-white dark:bg-neutral-800 shadow-sm text-[10px] font-medium text-amber-600 dark:text-amber-400 tabular-nums"
              title={`Estimated credits per generation${burstCount > 1 ? ` (×${burstCount} = ${Math.round(creditEstimate * burstCount)})` : ''}`}
            >
              <span aria-hidden="true">◆</span>
              <span>{creditEstimate < 10 ? creditEstimate.toFixed(1) : Math.round(creditEstimate)}</span>
            </span>
          )}
          {sourceToggle}
        </div>

        {/* Mask picker (shown when provider supports mask_url) */}
        {hasMaskParam && currentInputId && (
          <MaskPicker
            maskLayers={currentInputMaskLayers}
            maskUrl={currentInputMaskUrl}
            onAddMaskLayer={(asset) => {
              const layerId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
              addMaskLayer(operationType, currentInputId, {
                id: layerId,
                assetUrl: `asset:${asset.id}`,
                label: asset.description || undefined,
                visible: true,
              });
            }}
            onRemoveMaskLayer={(layerId) => removeMaskLayer(operationType, currentInputId, layerId)}
            onToggleMaskLayer={(layerId) => {
              const layer = currentInputMaskLayers?.find((l) => l.id === layerId);
              if (layer) updateMaskLayer(operationType, currentInputId, layerId, { visible: !layer.visible });
            }}
            onClearAllMasks={() => setMaskLayers(operationType, currentInputId, [])}
            hasMaskParam={hasMaskParam}
            sourceAssetId={currentInputAssetId}
            sourceAssetIds={currentInputSourceAssetIds}
            disabled={generating}
          />
        )}

        {/* Authoring suggested overrides */}
        {hasAuthoringHints && (
          <AuthoringHintsBadges
            hints={authoringHints!}
            currentOperation={operationType}
            currentParams={workbench.dynamicParams}
            onToggleOperation={() => {
              if (authoringHints!.suggestedOperation) {
                setOperationType(authoringHints!.suggestedOperation);
              }
            }}
            onToggleParam={(key, value) => {
              const current = workbench.dynamicParams?.[key];
              if (String(current) === String(value)) {
                workbench.handleParamChange(key, undefined);
              } else {
                workbench.handleParamChange(key, value);
              }
            }}
          />
        )}

        {/* Dynamic params */}
        <div className="gen-panel-params flex flex-col gap-1">
          <GenerationParamControls
            paramSpecs={filteredParamSpecs}
            values={workbench.dynamicParams}
            onChange={workbench.handleParamChange}
            generating={generating}
            unlimitedModels={unlimitedModels}
            promotedModels={promotedModels}
            showApiMethodToggle={showApiMethodToggle}
          />
        </div>

      </div>
      </div>
      {/* Action area — pinned to bottom */}
      <div className="gen-panel-footer flex-shrink-0 flex flex-col gap-1 px-1.5 pb-1.5 pt-1">
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

        {/* Action area: Each row + Go row */}
        <div className="gen-panel-action-group quickgen-actions-no-motion flex flex-col gap-1 min-w-0 rounded-xl bg-white/70 dark:bg-neutral-800/60 p-1 shadow-sm ring-1 ring-neutral-200/70 dark:ring-neutral-700/70">
          {/* Generate Each split-button — full width row */}
          {onGenerateEach && (inputCount > 1 || useAssetSetStore.getState().sets.length > 0) && OPERATION_METADATA[operationType].multiAssetMode !== 'required' && (
            <div className="min-w-0">
              <EachSplitButton
                onGenerateEach={onGenerateEach}
                disabled={generating || !canGenerate}
                generating={generating}
                queueProgress={queueProgress}
                inputCount={inputCount}
              />
            </div>
          )}

          <div className="flex items-stretch gap-1.5 min-w-0">
            {/* Advanced settings gear icon */}
            <div className="flex-shrink-0">
              <AdvancedSettingsPopover
                params={advancedParams}
                values={workbench.dynamicParams}
                onChange={workbench.handleParamChange}
                disabled={generating}
                currentModel={workbench.dynamicParams?.model as string | undefined}
              />
            </div>
            {/* Primary Go button with inline burst stepper */}
            <div
              ref={burstWheelRef}
              className="min-w-0 flex flex-1"
            >
            {hasUnknownPromotionPricing && (
              <div
                className={clsx(
                  'px-1.5 flex items-center justify-center border-r border-white/20 rounded-l-lg',
                  generating || !canGenerate
                    ? 'text-white bg-neutral-400 opacity-70'
                    : 'text-amber-50 bg-amber-500',
                )}
                title={unknownPromotionTooltip}
              >
                <Icon name="alertTriangle" size={11} />
              </div>
            )}
            {/* Main Go area */}
            <button
              onClick={() => {
                if (isBurstMode && onGenerateBurst) {
                  if (burstSequentialMode && onGenerateSequentialBurst) {
                    onGenerateSequentialBurst(burstCount);
                  } else {
                    onGenerateBurst(burstCount);
                  }
                } else {
                  onGenerate();
                }
              }}
              disabled={generating || !canGenerate}
              className={clsx(
                'flex-1 px-2 py-1.5 text-xs font-semibold tabular-nums',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                hasUnknownPromotionPricing ? 'rounded-none' : 'rounded-l-lg',
                generating || !canGenerate
                  ? 'text-white bg-neutral-400'
                  : error
                  ? 'text-white bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                  : btn.primary
              )}
              style={{ transition: 'none', animation: 'none' }}
            >
              {generating ? (
                <span className="inline-flex min-w-[6ch] justify-center">Go</span>
              ) : isCurrentGenerationFree ? (
                <span className="flex min-w-0 items-center justify-center gap-1">
                  <span className="truncate">Go</span>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full bg-emerald-100/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-emerald-100 ring-1 ring-emerald-200/40"
                    title={isModelUnlimited ? "Currently free for the selected account/model" : "Estimated free"}
                  >
                    Free
                  </span>
                </span>
              ) : (
                isBurstMode && burstSequentialMode && onGenerateSequentialBurst
                  ? 'Go Seq'
                  : 'Go'
              )}
            </button>
            {/* "Current only" split — visible when multiple inputs queued */}
            {onGenerateCurrentOnly && inputCount > 1 && (() => {
              const currentOnlyIsText = isOnEmptySlot && (operationType === 'image_to_video' || operationType === 'image_to_image');
              const t2Label = operationType === 'image_to_video' ? 'text-to-video' : 'text-to-image';
              return (
                <button
                  onClick={() => onGenerateCurrentOnly(isBurstMode ? burstCount : undefined)}
                  disabled={generating || !canGenerate}
                  className={clsx(
                    'px-1.5 py-1.5 text-[10px] font-semibold border-l border-white/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    generating || !canGenerate
                      ? 'text-white bg-neutral-400'
                      : error
                      ? 'text-white bg-red-600 hover:bg-red-700'
                      : btn.primary
                  )}
                  style={{ transition: 'none', animation: 'none' }}
                  title={currentOnlyIsText
                    ? `Generate as ${t2Label}${isBurstMode ? ` (${burstCount}x)` : ''}`
                    : isBurstMode ? `Generate ${burstCount}x with selected input only` : 'Generate with selected input only'}
                >
                  {currentOnlyIsText
                    ? <span className="text-[8px] px-0.5">T</span>
                    : <Icon name="image" size={11} />}
                </button>
              );
            })()}
            {/* Burst stepper area */}
            <div
              className={clsx(
                'flex flex-col border-l border-white/20 rounded-r-lg min-w-[28px]',
                generating || !canGenerate
                  ? 'text-white bg-neutral-400'
                  : error
                  ? 'text-white bg-red-600'
                  : btn.tertiary,
                (generating || !canGenerate) && 'opacity-50',
              )}
              style={{ transition: 'none', animation: 'none' }}
            >
              <button
                type="button"
                onClick={() => setBurstCount((c: number) => Math.min(50, c + 1))}
                disabled={generating || !canGenerate}
                className="px-1.5 flex-1 flex items-center justify-center hover:bg-white/10 rounded-tr-lg disabled:cursor-not-allowed"
              >
                <Icon name="chevronUp" size={10} />
              </button>
              <button
                type="button"
                onClick={() => canUseSequentialBurst && setBurstSequentialMode((v: boolean) => !v)}
                disabled={generating || !canGenerate || !canUseSequentialBurst}
                className={clsx(
                  'text-[11px] font-mono text-center leading-none px-1.5 py-0.5',
                  burstSequentialMode && canUseSequentialBurst ? 'bg-white/15' : '',
                  canUseSequentialBurst ? 'hover:bg-white/10' : '',
                  'disabled:cursor-not-allowed',
                )}
                title={
                  canUseSequentialBurst
                    ? (burstSequentialMode
                        ? 'Sequential burst: wait for each run to finish before starting the next'
                        : 'Burst mode: queue all runs immediately (click to toggle sequential)')
                    : 'Sequential burst not available in this context'
                }
              >
                {burstCount}{burstSequentialMode && canUseSequentialBurst ? 'S' : ''}
              </button>
              <button
                type="button"
                onClick={() => setBurstCount((c: number) => Math.max(1, c - 1))}
                disabled={generating || !canGenerate || burstCount <= 1}
                className="px-1.5 flex-1 flex items-center justify-center hover:bg-white/10 rounded-br-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="chevronDown" size={10} />
              </button>
            </div>
          </div>

          {/* Secondary Go button (with media viewer asset) */}
          {secondaryButton && (
            <button
              onClick={secondaryButton.onGenerate}
              disabled={generating || !canGenerate}
              className={clsx(
                'min-w-0 px-2 py-1.5 rounded-lg text-xs font-semibold tabular-nums',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                generating || !canGenerate
                  ? 'text-white bg-neutral-400'
                  : error
                  ? 'text-white bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                  : btn.secondary
              )}
              style={{ transition: 'none', animation: 'none' }}
              title="Generate using Media Viewer asset"
            >
              {isCurrentGenerationFree && !generating ? (
                <span className="flex min-w-0 items-center justify-center gap-1">
                  <span className="truncate">{secondaryButton.label || 'Go'}</span>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full bg-emerald-100/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-emerald-100 ring-1 ring-emerald-200/40"
                    title={isModelUnlimited ? "Currently free for the selected account/model" : "Estimated free"}
                  >
                    Free
                  </span>
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
