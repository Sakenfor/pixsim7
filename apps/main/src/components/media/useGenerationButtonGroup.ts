/**
 * Skin-agnostic hook for the media-card generation button group.
 *
 * Returns logical action descriptors and container state. A "skin" component
 * (pill, cube, etc.) consumes these and handles rendering — the hook itself
 * contains no JSX, which keeps behavior and presentation independently
 * swappable.
 */

import { useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { uploadAssetToProvider } from '@lib/api/assets';
import { searchBlocks, type PromptBlockResponse } from '@lib/api/blockTemplates';
import { useAction } from '@lib/capabilities';
import { useActionHotkeyContextMenu } from '@lib/capabilities/useActionHotkeyContextMenu';
import { getArrayParamLimits, type ParamSpec } from '@lib/generation-ui';
import { resolveButtonState, makeAsyncStates, UPLOAD_BUTTON_STATES } from '@lib/ui/buttonStates';

import {
  toViewerAsset,
  toViewerAssets,
  useAssetViewerStore,
  type AssetModel,
} from '@features/assets';
import { hydrateAssetModel } from '@features/assets/lib/hydrateAssetModel';
import { getUploadCapableProviders, resolveUploadTarget } from '@features/assets/lib/resolveUploadTarget';
import { extractUploadError } from '@features/assets/lib/uploadActions';
import { useUploadProviderStore } from '@features/assets/stores/uploadProviderStore';
import {
  CAP_GENERATION_WIDGET,
  CAP_CHARACTER_INGEST_ACTION,
  useCapability,
  useCapabilityAll,
  useContextHubOverridesStore,
  usePanelContext,
  type CharacterIngestActionContext,
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  useGenerationScopeStores,
  getGenerationSessionStore,
  getGenerationSettingsStore,
  useQuickGenOpenersStore,
  getQuickGenOpener,
} from '@features/generation';
import { providerCapabilityRegistry, useProviderCapabilities, useOperationSpec, useProviderIdForModel } from '@features/providers';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

import { useExtendPromptSourceStore } from './extendPromptSourceStore';
import {
  STYLE_VARIATION_CATEGORIES,
  applyOrder,
  useGenerationActionPrefs,
  useVisibleStyleCategories,
  type StyleVariationCategory,
} from './generationButtonPrefsStore';
import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardActionMode } from './mediaCardActionModeStore';
import { useMediaCardActionModeStore } from './mediaCardActionModeStore';
import { useMediaCardActionStore } from './mediaCardActionStore';
import { MEDIA_CARD_ACTION_IDS } from './mediaCardCapabilityActions';
import type { MediaCardOverlayData } from './mediaCardWidgets';
import {
  useGenerationSeedModeStore,
  type GenerationSeedModePreference,
} from './quickGenerateModeStore';
import { getSmartActionLabel, resolveMaxSlotsForModel } from './SlotPicker';
import { useGenerationCardHandlers } from './useGenerationCardHandlers';
import { useSelectedVideoTimestamp, useVideoMarksStore, SELECT_LAST_FRAME } from './videoMarksStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GenerationActionId =
  | 'upload'
  | 'smart-action'
  | 'quick-generate'
  | 'extend-video'
  | 'regenerate'
  | 'style-variations';

export type UploadTargetOption = {
  id: string;
  label: string;
};

export type GenerationActionExpand =
  | {
      kind: 'slot-picker';
      asset: AssetModel;
      operationType: OperationType;
      maxSlots: number;
      inputScopeId?: string;
      onSelectSlot: (asset: AssetModel, slotIndex: number) => void;
    }
  | {
      kind: 'extend-menu';
      promptSource: 'same' | 'active';
      setPromptSource: (s: 'same' | 'active') => void;
      onNativeExtend: () => void;
      onArtificialFirst: () => void;
      onArtificialLast: () => void;
      onArtificialCurrent: () => void;
      hasSelectedFrame: boolean;
      currentFrameTitle: string;
      artificialLastTitle: string;
      isExtending: boolean;
    }
  | {
      kind: 'quick-generate-menu';
      onQuickGenerateCurrent: (count?: number) => void;
      onQuickGenerateReuseSeed: (count?: number) => void;
      primaryMode: GenerationSeedModePreference;
      hasSourceGenerationContext: boolean;
    }
  | {
      kind: 'regenerate-menu';
      assetAcceptsInput: boolean;
      assetId: number;
      operationType: OperationType;
      isLoadingSource: boolean;
      isInsertingPrompt: boolean;
      isInsertingSeed: boolean;
      isInsertingAssets: boolean;
      primarySeedMode: GenerationSeedModePreference;
      insertPromptTitle: string;
      insertSeedTitle: string;
      insertAssetsTitle: string;
      showInsertAssets: boolean;
      onRegenerateDefault: () => void;
      onRegenerateReuseSeed: () => void;
      /** Burst (fire `count` with one consolidated toast) per seed mode. */
      onRegenerateBurstDefault: (count: number) => void;
      onRegenerateBurstReuseSeed: (count: number) => void;
      onLoadToQuickGen: () => void;
      onLoadToQuickGenNoSeed: () => void;
      onInsertPrompt: () => void;
      onInsertSeed: () => void;
      onInsertAssets: () => void;
      onOpenSourceAsset: (asset: AssetModel, list?: AssetModel[]) => void;
      /** Selectable Quick Gen target surfaces (sets the active widget for all actions). */
      targetSurfaces: { widgetId: string; label: string; isLive: boolean }[];
      /** Current sticky target widgetId, or null for "Auto". */
      activeTargetWidgetId: string | null;
      /** Set the active target (null = Auto / clear override); opens it if needed. */
      onSetTarget: (widgetId: string | null) => void;
    }
  | {
      kind: 'style-variations';
      isGenerating: boolean;
      categories: StyleVariationCategory[];
      activeCategory: string;
      blocks: PromptBlockResponse[] | null;
      onSelectCategory: (category: string) => void;
      onPickPreset: (blockId: string) => void;
      onSweepCategory: () => void;
    };

/**
 * Hint that a skin can render as a small corner badge on the action.
 * Semantic (not visual) so each skin picks its own representation.
 */
export type GenerationActionBadgeHint =
  | 'mode-switch'        // multi-mode available (e.g. generation ↔ character-ingest)
  | 'replace-or-mode'    // replace mode active, or mode-switch available
  | 'selected-frame'     // video has a selected frame ready to upload
  | 'multi-target'       // multiple upload targets and no default
  | null;

/** Smart-action variant — picks between add-to-generation and character-ingest. */
export type SmartActionVariant = 'generation' | 'character-ingest';

export type GenerationAction = {
  id: GenerationActionId;
  /**
   * Pre-resolved icon node for buttons whose icon comes from `resolveButtonState`.
   * Null for actions where the icon depends on a variant the skin decides
   * (currently only `smart-action` — see `variant`).
   */
  icon: React.ReactNode | null;
  label?: string;
  title: string;
  onClick?: (e: React.MouseEvent) => void;
  onAuxClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  /**
   * Semantic corner-badge hint. Skin chooses how (or whether) to render it.
   */
  badgeHint?: GenerationActionBadgeHint;
  /**
   * Live count of in-flight submits for this action (e.g. rapid regenerate
   * spam). When set and > 0, the skin renders a numeric corner badge instead
   * of the semantic `badgeHint`. Non-blocking: the button stays tappable.
   */
  countBadge?: number | null;
  /**
   * Skin-specific accent color (e.g. provider brand color on upload).
   * Pill skin renders as a translucent background + inner ring; other skins
   * may use it differently (e.g. a cube face color).
   */
  accentColor?: string;
  /** Smart-action variant. Only set on `smart-action`. */
  variant?: SmartActionVariant;
  expand?: GenerationActionExpand;
  expandDelay?: number;
  collapseDelay?: number;
  /** Press-and-drag-up burst: fire this action `count` times on release. */
  burst?: { steps: number[]; onFire: (count: number) => void };
};

export type GenerationProviderMenuState = {
  open: boolean;
  position: { x: number; y: number } | null;
  options: UploadTargetOption[];
  defaultId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onClearDefault: () => void;
};

export type GenerationButtonGroupModel = {
  actions: GenerationAction[];
  providerMenu: GenerationProviderMenuState;
  hotkeyContextMenu: React.ReactNode;
  container: {
    ref: React.RefObject<HTMLDivElement>;
    onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onFocusCapture: () => void;
    onBlurCapture: (e: React.FocusEvent<HTMLDivElement>) => void;
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// The style-variation catalog + per-user button prefs live in
// generationButtonPrefsStore. Re-exported here for back-compat.
export { STYLE_VARIATION_CATEGORIES, type StyleVariationCategory };

// Count stops for the press-and-drag burst gesture on the re-fire buttons
// (regenerate, quick-generate) and their expand-menu rows. Drag through these
// to fire N at once.
export const BURST_STEPS = [1, 2, 3, 5, 10];

const UPLOAD_PROVIDER_COLORS: Record<string, string> = {
  pixverse: '#7C3AED',
  sora: '#6B7280',
  remaker: '#059669',
};

function getUploadProviderColor(providerId: string): string {
  return UPLOAD_PROVIDER_COLORS[providerId] ?? '#6B7280';
}

export function getGenerationProviderAccent(providerId: string): string {
  return getUploadProviderColor(providerId);
}

type ProviderMenuMode = 'set-default' | 'upload-now';

type SourceAssetOpenPanelContext = {
  onOpenAsset?: (asset: AssetModel, assetList?: AssetModel[]) => void;
  openAssetInViewer?: (asset: AssetModel, assetList?: AssetModel[]) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export type UseGenerationButtonGroupArgs = {
  data: MediaCardOverlayData;
  cardProps: MediaCardResolvedProps;
};

/**
 * Returns the skin-agnostic action descriptor set + container state.
 * Consumers (skin components) translate `actions` into their own UI form.
 */
export function useGenerationButtonGroup({
  data,
  cardProps,
}: UseGenerationButtonGroupArgs): GenerationButtonGroupModel {
  const { id, mediaType } = cardProps;
  const toast = useToast();
  const openViewer = useAssetViewerStore((s) => s.openViewer);
  const panelContext = usePanelContext<SourceAssetOpenPanelContext>();
  const contextOpenAsset = panelContext?.onOpenAsset ?? panelContext?.openAssetInViewer;

  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [providerMenuPos, setProviderMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [providerMenuMode, setProviderMenuMode] = useState<ProviderMenuMode>('set-default');
  const [isUploading, setIsUploading] = useState(false);
  const extendPromptSource = useExtendPromptSourceStore((s) => s.promptSource);
  const setExtendPromptSource = useExtendPromptSourceStore((s) => s.setPromptSource);
  const quickGenerateMode = useGenerationSeedModeStore((s) => s.byAction['quick-generate']);
  const regenerateMode = useGenerationSeedModeStore((s) => s.byAction.regenerate);
  const setGenerationSeedMode = useGenerationSeedModeStore((s) => s.setMode);
  const triggerRef = useRef<HTMLDivElement>(null);
  const storedActionMode = useMediaCardActionModeStore((s) => s.byAssetId[id]);
  const setStoredActionMode = useMediaCardActionModeStore((s) => s.setMode);
  const clearStoredActionMode = useMediaCardActionModeStore((s) => s.clearMode);
  const selectedTimestamp = useSelectedVideoTimestamp(id);
  const clearSelectedTimestamp = useVideoMarksStore((s) => s.setSelected);
  const isLastFrameSelected =
    mediaType === 'video' &&
    selectedTimestamp === SELECT_LAST_FRAME &&
    !!cardProps.actions?.onExtractLastFrame;
  const hasSelectedFrame =
    mediaType === 'video' &&
    selectedTimestamp !== null &&
    selectedTimestamp !== SELECT_LAST_FRAME &&
    !!cardProps.actions?.onExtractFrame;
  const hasSelectedAny = hasSelectedFrame || isLastFrameSelected;

  const { value: activeWidgetContext, provider: activeWidgetProvider } =
    useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
  const allWidgetProviders = useCapabilityAll<GenerationWidgetContext>(
    CAP_GENERATION_WIDGET,
    { includeUnavailable: true },
  );
  const fallbackWidget = useMemo(() => {
    if (activeWidgetContext) {
      return null;
    }

    let best: { context: GenerationWidgetContext; priority: number; label?: string } | null = null;
    for (const entry of allWidgetProviders) {
      const context = entry.value;
      if (!context) continue;
      const candidate = {
        context,
        priority: entry.provider.priority ?? 0,
        label: entry.provider.label,
      };
      if (!best) {
        best = candidate;
        continue;
      }
      if (candidate.context.isOpen && !best.context.isOpen) {
        best = candidate;
        continue;
      }
      if (candidate.context.isOpen === best.context.isOpen && candidate.priority > best.priority) {
        best = candidate;
      }
    }

    return best;
  }, [activeWidgetContext, allWidgetProviders]);
  const widgetContext = activeWidgetContext ?? fallbackWidget?.context;
  const widgetProvider = activeWidgetProvider
    ?? (fallbackWidget ? { label: fallbackWidget.label } : null);
  const { value: characterIngestAction } =
    useCapability<CharacterIngestActionContext>(CAP_CHARACTER_INGEST_ACTION);

  const { useSessionStore, useSettingsStore, useInputStore, id: scopedScopeId } = useGenerationScopeStores();
  const scopedOperationType = useSessionStore((s) => s.operationType);
  const scopedAddInput = useInputStore((s) => s.addInput);
  const scopedAddInputs = useInputStore((s) => s.addInputs);
  const isReplaceMode = useInputStore((s) => s.inputModeByOperation?.[scopedOperationType] === 'replace');

  const setWidgetOpen = widgetContext?.setOpen;
  const operationType = widgetContext?.operationType ?? scopedOperationType;
  const addInput = widgetContext?.addInput ?? scopedAddInput;
  const addInputs = widgetContext?.addInputs ?? scopedAddInputs;
  const activeModel = useSettingsStore((s) => s.params?.model as string | undefined);
  const scopedProviderId = useSessionStore((s) => s.providerId);
  const inferredProviderId = useProviderIdForModel(activeModel);
  const effectiveProviderId = scopedProviderId ?? inferredProviderId;

  const widgetScopeId = widgetContext?.scopeId ?? scopedScopeId ?? 'global';
  const widgetSessionHook = useMemo(() => getGenerationSessionStore(widgetScopeId), [widgetScopeId]);
  const widgetSettingsHook = useMemo(() => getGenerationSettingsStore(widgetScopeId), [widgetScopeId]);
  const widgetModel = widgetSettingsHook((s) => s.params?.model as string | undefined);
  const widgetProviderId = widgetSessionHook((s) => s.providerId);
  const widgetInferredProviderId = useProviderIdForModel(widgetModel);
  const widgetEffectiveProviderId = widgetProviderId ?? widgetInferredProviderId;

  const operationSpec = useOperationSpec(effectiveProviderId, operationType);

  const smartActionLabel = getSmartActionLabel(mediaType, operationType);
  const targetLabel = widgetProvider?.label ?? widgetContext?.widgetId;
  const targetInfo = targetLabel ? `\nTarget: ${targetLabel}` : '';
  const maxSlots = useMemo(() => {
    if (operationSpec?.parameters) {
      const limits = getArrayParamLimits(
        operationSpec.parameters as ParamSpec[],
        'composition_assets',
        activeModel,
      );
      if (typeof limits?.max === 'number' && Number.isFinite(limits.max)) {
        return Math.max(1, Math.floor(limits.max));
      }
    }
    return resolveMaxSlotsForModel(operationType, activeModel);
  }, [operationSpec?.parameters, operationType, activeModel]);

  const inputAsset = useMemo<AssetModel>(() => ({
    ...(cardProps.contextMenuAsset ?? {
      id: cardProps.id,
      createdAt: cardProps.createdAt,
      description: cardProps.description ?? null,
      durationSec: cardProps.durationSec ?? null,
      height: cardProps.height ?? null,
      isArchived: false,
      mediaType: cardProps.mediaType,
      previewUrl: cardProps.previewUrl ?? null,
      providerAssetId: cardProps.providerAssetId,
      providerId: cardProps.providerId,
      providerStatus: cardProps.providerStatus ?? null,
      remoteUrl: cardProps.remoteUrl ?? null,
      syncStatus: (cardProps.status as AssetModel['syncStatus']) ?? 'remote',
      thumbnailUrl: cardProps.thumbUrl ?? null,
      userId: 0,
      width: cardProps.width ?? null,
    }),
  }), [
    cardProps.contextMenuAsset,
    cardProps.id,
    cardProps.createdAt,
    cardProps.description,
    cardProps.durationSec,
    cardProps.height,
    cardProps.mediaType,
    cardProps.previewUrl,
    cardProps.providerAssetId,
    cardProps.providerId,
    cardProps.providerStatus,
    cardProps.remoteUrl,
    cardProps.status,
    cardProps.thumbUrl,
    cardProps.width,
  ]);
  const hydratedAssetCacheRef = useRef<Map<number, AssetModel>>(new Map());

  const resolveInputAsset = useCallback(
    async (asset: AssetModel): Promise<AssetModel> =>
      hydrateAssetModel(asset, { cache: hydratedAssetCacheRef.current }),
    [],
  );

  // ── Quick Gen target selection ────────────────────────────────────────────
  // Every Quick Gen surface that can be made the active target, keyed by
  // widgetId: mounted providers are live; registered openers cover surfaces
  // openable on demand (Control Center, viewer, panel). The specialized
  // prompt-authoring host is excluded. Selecting one sets the preferred
  // CAP_GENERATION_WIDGET provider — so EVERY card action binds to it — and
  // opens it so the preference resolves to an available provider.
  const quickGenOpeners = useQuickGenOpenersStore((s) => s.openers);
  const quickGenTargetSurfaces = useMemo(() => {
    const EXCLUDED = new Set<string>(['prompt-authoring']);
    const byId = new Map<string, { widgetId: string; label: string; isLive: boolean }>();
    for (const entry of allWidgetProviders) {
      const wid = entry.value?.widgetId;
      if (!wid || EXCLUDED.has(wid) || byId.has(wid)) continue;
      byId.set(wid, { widgetId: wid, label: entry.provider.label ?? wid, isLive: true });
    }
    for (const opener of Object.values(quickGenOpeners)) {
      const wid = opener.widgetId;
      if (EXCLUDED.has(wid) || byId.has(wid)) continue;
      byId.set(wid, { widgetId: wid, label: opener.label, isLive: false });
    }
    return [...byId.values()];
  }, [allWidgetProviders, quickGenOpeners]);

  // The current sticky target (global preferred-provider override), or null
  // for "Auto" (automatic open + priority resolution).
  const preferredWidgetProviderId = useContextHubOverridesStore(
    (s) => s.overrides[CAP_GENERATION_WIDGET]?.preferredProviderId,
  );
  const activeTargetWidgetId = preferredWidgetProviderId?.startsWith('generation-widget:')
    ? preferredWidgetProviderId.slice('generation-widget:'.length)
    : null;

  const setQuickGenTarget = useCallback(
    (targetWidgetId: string | null) => {
      const overrides = useContextHubOverridesStore.getState();
      if (!targetWidgetId) {
        overrides.clearOverride(CAP_GENERATION_WIDGET);
        return;
      }
      overrides.setPreferredProvider(
        CAP_GENERATION_WIDGET,
        `generation-widget:${targetWidgetId}`,
      );
      // Open the chosen surface so the preference resolves to an available
      // provider: mounted-but-closed → setOpen; unmounted → its opener.
      const live = allWidgetProviders.find((e) => e.value?.widgetId === targetWidgetId)?.value;
      if (live) {
        if (!live.isOpen) live.setOpen?.(true);
      } else {
        getQuickGenOpener(targetWidgetId)?.open({ asset: inputAsset });
      }
    },
    [allWidgetProviders, inputAsset],
  );

  const {
    quickGenInFlight,
    isLoadingSource,
    isExtending,
    regenerateInFlight,
    isGeneratingVariations,
    isInsertingPrompt,
    isInsertingSeed,
    isInsertingAssets,
    handleQuickGenerate,
    handleQuickGenerateReuseSeed,
    handleLoadToQuickGen,
    handleInsertPromptOnly,
    handleInsertSeedOnly,
    handleInsertAssetsOnly,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    handleArtificialExtend,
    handleRegenerate,
    handleRegenerateReuseSeed,
    handleRegenerateBurst,
    handleGenerateStyleVariations,
  } = useGenerationCardHandlers({
    inputAsset,
    operationType,
    useSessionStore,
    useSettingsStore,
    useInputStore,
    widgetContext: widgetContext ?? undefined,
    scopedScopeId,
    data,
    id,
    mediaType,
  });

  const handleLoadToQuickGenNoSeed = useCallback(() => {
    void handleLoadToQuickGen({ withoutSeed: true });
  }, [handleLoadToQuickGen]);

  const quickGenAction = useAction(MEDIA_CARD_ACTION_IDS.quickGenerate);
  const extendAction = useAction(MEDIA_CARD_ACTION_IDS.extend);
  const extendArtificialLastAction = useAction(MEDIA_CARD_ACTION_IDS.extendArtificialLast);
  const regenerateAction = useAction(MEDIA_CARD_ACTION_IDS.regenerate);
  const variationsAction = useAction(MEDIA_CARD_ACTION_IDS.variations);
  const insertPromptAction = useAction(MEDIA_CARD_ACTION_IDS.insertPrompt);
  const { getActionContextMenuHandler, hotkeyContextMenu } = useActionHotkeyContextMenu();
  const withShortcut = (title: string | undefined, shortcut: string | undefined): string => {
    if (!title) return title ?? '';
    if (!shortcut) return title;
    const [first, ...rest] = title.split('\n');
    return [`${first} (${shortcut})`, ...rest].join('\n');
  };

  const setActiveCard = useCallback(() => {
    useMediaCardActionStore.getState().setActive(id);
  }, [id]);
  const clearActiveCard = useCallback(() => {
    const s = useMediaCardActionStore.getState();
    if (s.activeId === String(id)) s.setActive(null);
  }, [id]);

  const handleSmartAction = useCallback(() => {
    void (async () => {
      const resolvedAsset = await resolveInputAsset(inputAsset);
      addInputs({
        assets: [resolvedAsset],
        operationType,
      });
      setWidgetOpen?.(true);
    })();
  }, [resolveInputAsset, inputAsset, addInputs, operationType, setWidgetOpen]);

  const handleSelectSlot = useCallback(async (selectedAsset: AssetModel, slotIndex: number) => {
    const resolvedAsset = await resolveInputAsset(selectedAsset);
    addInput({
      asset: resolvedAsset,
      operationType,
      slotIndex,
    });
  }, [resolveInputAsset, addInput, operationType]);

  const handleMiddleClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    void handleSelectSlot(inputAsset, 0);
    setWidgetOpen?.(true);
  }, [handleSelectSlot, inputAsset, setWidgetOpen]);

  const handleOpenSourceAsset = useCallback(
    (asset: AssetModel, assetList?: AssetModel[]) => {
      if (contextOpenAsset) {
        contextOpenAsset(asset, assetList);
        return;
      }
      const viewerAsset = toViewerAsset(asset);
      const viewerList = assetList && assetList.length > 0 ? toViewerAssets(assetList) : [viewerAsset];
      openViewer(viewerAsset, viewerList, 'source-assets');
    },
    [contextOpenAsset, openViewer],
  );

  // Upload-to-provider logic
  const { capabilities: allProviderCaps } = useProviderCapabilities();
  const defaultUploadProviderId = useUploadProviderStore((s) => s.defaultUploadProviderId);
  const setDefaultUploadProvider = useUploadProviderStore((s) => s.setDefaultUploadProvider);
  const clearDefaultUploadProvider = useUploadProviderStore((s) => s.clearDefaultUploadProvider);

  const uploadCapableProviders = useMemo(() => getUploadCapableProviders(), [allProviderCaps]);
  const hasLocalUpload = !!cardProps.onUploadClick;
  const hasProviderUpload = uploadCapableProviders.length > 0;
  const canRouteUploadTarget = typeof cardProps.onUploadToProvider === 'function';
  const supportsLibraryTarget = hasLocalUpload || canRouteUploadTarget;
  const showUploadButton = hasLocalUpload || hasProviderUpload;

  const uploadTargetOptions = useMemo<UploadTargetOption[]>(() => {
    const options: UploadTargetOption[] = [];
    if (supportsLibraryTarget) {
      options.push({ id: 'library', label: 'Library' });
    }
    if (!hasLocalUpload || canRouteUploadTarget) {
      for (const provider of uploadCapableProviders) {
        options.push({ id: provider.providerId, label: provider.name });
      }
    }
    return options;
  }, [supportsLibraryTarget, hasLocalUpload, canRouteUploadTarget, uploadCapableProviders]);

  const resolveDefaultUploadTargetId = useCallback((): string | null => {
    if (supportsLibraryTarget) {
      if (defaultUploadProviderId === 'library') {
        return 'library';
      }
      if (
        defaultUploadProviderId &&
        uploadTargetOptions.some((option) => option.id === defaultUploadProviderId)
      ) {
        return defaultUploadProviderId;
      }
      if (hasLocalUpload) {
        return 'library';
      }
    }
    const target = resolveUploadTarget(defaultUploadProviderId);
    return target?.providerId ?? null;
  }, [supportsLibraryTarget, hasLocalUpload, defaultUploadProviderId, uploadTargetOptions]);

  const handleUploadToTarget = useCallback(async (targetId: string) => {
    setIsUploading(true);
    try {
      if (targetId !== 'library') {
        if (isLastFrameSelected && cardProps.actions?.onExtractLastFrame) {
          await cardProps.actions.onExtractLastFrame(id);
          clearSelectedTimestamp(id, null);
          return;
        }
        if (hasSelectedFrame && cardProps.actions?.onExtractFrame) {
          await cardProps.actions.onExtractFrame(id, selectedTimestamp!);
          clearSelectedTimestamp(id, null);
          return;
        }
      }
      if (targetId === 'library') {
        if (canRouteUploadTarget && cardProps.onUploadToProvider) {
          await cardProps.onUploadToProvider(id, targetId);
        } else if (hasLocalUpload) {
          await cardProps.onUploadClick?.(id);
          toast.success('Uploaded to library');
        } else {
          toast.info('Asset is already in library.');
        }
      } else if (canRouteUploadTarget && cardProps.onUploadToProvider) {
        await cardProps.onUploadToProvider(id, targetId);
      } else {
        await uploadAssetToProvider(id, targetId);
        const tLabel = uploadTargetOptions.find((o) => o.id === targetId)?.label ?? targetId;
        toast.success(`Uploaded to ${tLabel}`);
      }
      cardProps.actions?.onReuploadDone?.();
    } catch (err: unknown) {
      const detail = extractUploadError(err);
      console.error('Upload to provider failed:', detail);
      toast.error(detail);
      cardProps.actions?.onReuploadDone?.();
    } finally {
      setIsUploading(false);
    }
  }, [canRouteUploadTarget, cardProps, hasLocalUpload, hasSelectedFrame, isLastFrameSelected, id, selectedTimestamp, clearSelectedTimestamp, toast, uploadTargetOptions]);

  const handleUploadClick = useCallback(() => {
    if (hasLocalUpload && !canRouteUploadTarget) {
      void cardProps.onUploadClick?.(id);
      return;
    }
    const targetId = resolveDefaultUploadTargetId();
    if (targetId) {
      void handleUploadToTarget(targetId);
    } else if (uploadTargetOptions.length > 1) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setProviderMenuPos({ x: rect.left, y: rect.bottom + 4 });
      }
      setProviderMenuMode('upload-now');
      setIsProviderMenuOpen(true);
    }
  }, [
    hasLocalUpload,
    canRouteUploadTarget,
    cardProps,
    id,
    resolveDefaultUploadTargetId,
    handleUploadToTarget,
    uploadTargetOptions.length,
  ]);

  const handleUploadContextMenu = useCallback((e: React.MouseEvent) => {
    if (uploadTargetOptions.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    setProviderMenuPos({ x: e.clientX, y: e.clientY });
    setProviderMenuMode('set-default');
    setIsProviderMenuOpen(true);
  }, [uploadTargetOptions.length]);

  const handleProviderSelect = useCallback((targetId: string) => {
    setDefaultUploadProvider(targetId);
    setIsProviderMenuOpen(false);
    if (providerMenuMode === 'upload-now') {
      void handleUploadToTarget(targetId);
    }
  }, [setDefaultUploadProvider, providerMenuMode, handleUploadToTarget]);

  // Per-user button-group prefs (global; follow the card across every surface).
  // Pill hide/reorder composes on top of context gating — see the return below.
  const actionPrefs = useGenerationActionPrefs();
  // Style variation picker state (blocks lazy-loaded per category on hover).
  // Visible dimensions + order come from the per-user prefs store too.
  const styleCategories = useVisibleStyleCategories();
  const [storedStyleCategory, setStoredStyleCategory] = useState<string>(
    STYLE_VARIATION_CATEGORIES[0].id,
  );
  // Fall back to the first visible dimension if the stored one was hidden.
  const activeStyleCategory =
    styleCategories.some((c) => c.id === storedStyleCategory)
      ? storedStyleCategory
      : (styleCategories[0]?.id ?? storedStyleCategory);
  const [styleBlocksByCategory, setStyleBlocksByCategory] = useState<
    Record<string, PromptBlockResponse[]>
  >({});
  const styleBlocksFetchingRef = useRef<Set<string>>(new Set());
  const fetchStyleBlocks = useCallback((category: string) => {
    if (styleBlocksFetchingRef.current.has(category)) return;
    styleBlocksFetchingRef.current.add(category);
    // Keep limit in sync with handleGenerateStyleVariations' internal fetch so
    // the popover's "Sweep all (N)" count matches what a sweep actually submits.
    void searchBlocks({ category, limit: 20 }).then((blocks) => {
      setStyleBlocksByCategory((prev) => ({ ...prev, [category]: blocks }));
    });
  }, []);
  const selectStyleCategory = useCallback((category: string) => {
    setStoredStyleCategory(category);
    fetchStyleBlocks(category);
  }, [fetchStyleBlocks]);

  const hasGenContext = data.sourceGenerationId || data.hasGenerationContext;

  const assetOpType = data.operationType as OperationType | null | undefined;
  const assetAcceptsInput = assetOpType
    ? (OPERATION_METADATA[assetOpType]?.acceptsInput?.length ?? 0) > 0
    : false;

  const providerRequiresUpload = widgetEffectiveProviderId
    ? providerCapabilityRegistry.hasFeature(widgetEffectiveProviderId, 'asset_upload')
    : false;
  const assetUploadedToProvider = providerRequiresUpload
    ? !!(
        cardProps.contextMenuAsset?.providerUploads?.[widgetEffectiveProviderId!] ||
        cardProps.contextMenuAsset?.providerId === widgetEffectiveProviderId
      )
    : true;
  const hasQuickGenerate = !!cardProps.presetCapabilities?.showsQuickGenerate
    && !!widgetContext?.executeGeneration
    && assetUploadedToProvider;
  const hasSourceGenerationContext = !!hasGenContext;

  // `count` flows through to executeGeneration({ count }) — the shared "fire N"
  // path. Callers that bind these to a DOM onClick must not forward the event
  // as the count (handlePrimaryQuickGenerate stays arg-less for that reason).
  const handleQuickGenerateCurrent = useCallback((count?: number) => {
    setGenerationSeedMode('quick-generate', 'default');
    void handleQuickGenerate(count);
  }, [setGenerationSeedMode, handleQuickGenerate]);

  const handleQuickGenerateWithReuseSeed = useCallback((count?: number) => {
    setGenerationSeedMode('quick-generate', 'reuse-source-seed');
    void handleQuickGenerateReuseSeed(count);
  }, [setGenerationSeedMode, handleQuickGenerateReuseSeed]);

  const handlePrimaryQuickGenerate = useCallback(() => {
    if (quickGenerateMode === 'reuse-source-seed' && hasSourceGenerationContext) {
      handleQuickGenerateWithReuseSeed();
      return;
    }
    handleQuickGenerateCurrent();
  }, [
    quickGenerateMode,
    hasSourceGenerationContext,
    handleQuickGenerateWithReuseSeed,
    handleQuickGenerateCurrent,
  ]);

  const handleRegenerateDefault = useCallback(() => {
    setGenerationSeedMode('regenerate', 'default');
    void handleRegenerate();
  }, [setGenerationSeedMode, handleRegenerate]);

  const handleRegenerateWithReuseSeed = useCallback(() => {
    setGenerationSeedMode('regenerate', 'reuse-source-seed');
    void handleRegenerateReuseSeed();
  }, [setGenerationSeedMode, handleRegenerateReuseSeed]);

  const handlePrimaryRegenerate = useCallback(() => {
    if (regenerateMode === 'reuse-source-seed') {
      handleRegenerateWithReuseSeed();
      return;
    }
    handleRegenerateDefault();
  }, [regenerateMode, handleRegenerateWithReuseSeed, handleRegenerateDefault]);

  // Burst handlers.
  // Quick-generate routes the count straight through executeGeneration({ count })
  // — the same single-call "fire N" path the on-card swipe uses — so seeds and
  // the in-flight counter behave identically across both surfaces.
  const fireQuickGenerateBurst = useCallback((count: number) => {
    if (quickGenerateMode === 'reuse-source-seed' && hasSourceGenerationContext) {
      handleQuickGenerateWithReuseSeed(count);
      return;
    }
    handleQuickGenerateCurrent(count);
  }, [
    quickGenerateMode,
    hasSourceGenerationContext,
    handleQuickGenerateWithReuseSeed,
    handleQuickGenerateCurrent,
  ]);

  // Regenerate has no widget-level count path (it submits via generateAsset),
  // so a burst loops N submits — but they're silenced and covered by a single
  // consolidated "Regenerating ×N…" toast (see handleRegenerateBurst). Each
  // iteration still gets its own fresh seed. The on-card swipe has no
  // regenerate-scalable counterpart.
  const fireRegenerateBurst = useCallback((count: number) => {
    void handleRegenerateBurst(count, { reuseSourceSeed: regenerateMode === 'reuse-source-seed' });
  }, [handleRegenerateBurst, regenerateMode]);
  // Explicit per-mode variants for the expand-menu re-fire rows.
  const fireRegenerateBurstDefault = useCallback((count: number) => {
    void handleRegenerateBurst(count, { reuseSourceSeed: false });
  }, [handleRegenerateBurst]);
  const fireRegenerateBurstReuseSeed = useCallback((count: number) => {
    void handleRegenerateBurst(count, { reuseSourceSeed: true });
  }, [handleRegenerateBurst]);

  useEffect(() => {
    const isVideoWithContext = mediaType === 'video' && !!hasGenContext;
    useMediaCardActionStore.getState().publishHandlers(id, {
      handleQuickGenerate: hasQuickGenerate ? handlePrimaryQuickGenerate : undefined,
      handleExtendWithSamePrompt: isVideoWithContext ? handleExtendWithSamePrompt : undefined,
      handleExtendWithActivePrompt: isVideoWithContext ? handleExtendWithActivePrompt : undefined,
      handleArtificialExtend: isVideoWithContext ? handleArtificialExtend : undefined,
      handleRegenerate: hasGenContext ? handlePrimaryRegenerate : undefined,
      handleGenerateStyleVariations: hasGenContext ? handleGenerateStyleVariations : undefined,
      handleInsertPromptOnly: hasGenContext ? handleInsertPromptOnly : undefined,
    });
    return () => {
      const s = useMediaCardActionStore.getState();
      s.unpublishHandlers(id);
      if (s.activeId === String(id)) s.setActive(null);
    };
  }, [
    id,
    mediaType,
    hasQuickGenerate,
    hasGenContext,
    handlePrimaryQuickGenerate,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    handleArtificialExtend,
    handlePrimaryRegenerate,
    handleGenerateStyleVariations,
    handleInsertPromptOnly,
  ]);

  const availableActionModes = useMemo<MediaCardActionMode[]>(() => {
    const modes: MediaCardActionMode[] = ['generation'];
    if (mediaType === 'image' && !!characterIngestAction?.addAssetsToIngest) {
      modes.push('character-ingest');
    }
    return modes;
  }, [mediaType, characterIngestAction]);

  const activeActionMode: MediaCardActionMode =
    storedActionMode && availableActionModes.includes(storedActionMode)
      ? storedActionMode
      : 'generation';

  useEffect(() => {
    if (storedActionMode && !availableActionModes.includes(storedActionMode)) {
      clearStoredActionMode(id);
    }
  }, [storedActionMode, availableActionModes, clearStoredActionMode, id]);

  const cycleActionMode = useCallback((delta: 1 | -1) => {
    if (availableActionModes.length <= 1) return;
    const currentIndex = Math.max(0, availableActionModes.indexOf(activeActionMode));
    const nextIndex = (currentIndex + delta + availableActionModes.length) % availableActionModes.length;
    setStoredActionMode(id, availableActionModes[nextIndex]);
  }, [availableActionModes, activeActionMode, id, setStoredActionMode]);

  const handleModeCycleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.altKey || e.ctrlKey)) return;
    if (availableActionModes.length <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    cycleActionMode(e.deltaY >= 0 ? 1 : -1);
  }, [availableActionModes.length, cycleActionMode]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0 || e.button === 1) {
      e.stopPropagation();
    }
  }, []);

  const handleBlurCapture = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      clearActiveCard();
    }
  }, [clearActiveCard]);

  // ─────────────────────────────────────────────────────────────────────────
  // Build action descriptors
  // ─────────────────────────────────────────────────────────────────────────

  const supportsSlots = true;
  const inputScopeId = widgetContext?.scopeId;
  const actions: GenerationAction[] = [];

  // Upload button
  const externalUploadState = (data.uploadState || 'idle') as keyof typeof UPLOAD_BUTTON_STATES;
  const effectiveUploadState: keyof typeof UPLOAD_BUTTON_STATES = isUploading ? 'uploading' : externalUploadState;
  if (showUploadButton && !cardProps.presetCapabilities?.skipPillUpload) {
    const resolved = resolveButtonState(UPLOAD_BUTTON_STATES, effectiveUploadState);
    const defaultTargetId = resolveDefaultUploadTargetId();
    const defaultTarget = defaultTargetId
      ? uploadTargetOptions.find((option) => option.id === defaultTargetId)
      : null;
    const providerAccentColor =
      defaultTargetId && defaultTargetId !== 'library'
        ? getUploadProviderColor(defaultTargetId)
        : undefined;
    const baseUploadTitle = supportsLibraryTarget
      ? defaultTarget
        ? `Upload to ${defaultTarget.label} (right-click to set default target)`
        : 'Upload (right-click to set default target)'
      : (() => {
          const target = resolveUploadTarget(defaultUploadProviderId);
          if (target) return `Upload to ${target.name}`;
          return 'Upload to provider (right-click to set default)';
        })();
    const uploadTitle = isLastFrameSelected
      ? `Upload last frame${defaultTarget ? ` to ${defaultTarget.label}` : ''}`
      : hasSelectedFrame
        ? `Upload frame at ${selectedTimestamp!.toFixed(1)}s${defaultTarget ? ` to ${defaultTarget.label}` : ''}`
        : baseUploadTitle;
    actions.push({
      id: 'upload',
      icon: resolved.icon,
      label: resolved.label,
      accentColor: providerAccentColor,
      title: uploadTitle,
      onClick: handleUploadClick,
      onContextMenu: handleUploadContextMenu,
      badgeHint: hasSelectedAny
        ? 'selected-frame'
        : uploadTargetOptions.length > 1
          ? 'multi-target'
          : null,
    });
  }

  // Smart action (add-to-generation) OR character-ingest swap
  if (activeActionMode === 'character-ingest' && mediaType === 'image' && characterIngestAction?.addAssetsToIngest) {
    const characterLabel = characterIngestAction.characterLabel || characterIngestAction.characterId;
    actions.push({
      id: 'smart-action',
      icon: null,
      variant: 'character-ingest',
      title: [
        `Add To Character Ingest`,
        `Target: ${characterLabel}`,
        availableActionModes.length > 1 ? 'Alt/Ctrl+Wheel: switch action mode' : null,
      ].filter(Boolean).join('\n'),
      onClick: async () => {
        try {
          await Promise.resolve(characterIngestAction.addAssetsToIngest([inputAsset.id]));
          toast.success(`Added to ${characterLabel} ingest`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to add to character ingest');
        }
      },
      badgeHint: availableActionModes.length > 1 ? 'mode-switch' : null,
    });
  } else {
    actions.push({
      id: 'smart-action',
      icon: null,
      variant: 'generation',
      title: [
        isReplaceMode
          ? `Replace current input${targetInfo}`
          : supportsSlots
            ? `${smartActionLabel}${targetInfo}\nHover: slot picker\nMiddle-click: replace slot 1`
            : `${smartActionLabel}${targetInfo}`,
        availableActionModes.length > 1 ? 'Alt/Ctrl+Wheel: switch action mode' : null,
      ].filter(Boolean).join('\n'),
      onClick: handleSmartAction,
      onAuxClick: handleMiddleClick,
      expand: supportsSlots
        ? {
            kind: 'slot-picker',
            asset: inputAsset,
            operationType,
            maxSlots,
            inputScopeId,
            onSelectSlot: handleSelectSlot,
          }
        : undefined,
      expandDelay: 150,
      badgeHint: isReplaceMode || availableActionModes.length > 1 ? 'replace-or-mode' : null,
    });
  }

  // Quick generate
  if (hasQuickGenerate) {
    const widgetOpType = widgetContext!.operationType ?? operationType;
    const widgetOpMetadata = OPERATION_METADATA[widgetOpType];
    const quickGenSeedLine = quickGenerateMode === 'reuse-source-seed'
      ? 'Seed: reuse source generation seed'
      : 'Seed: use current Quick Generate seed';
    const quickGenStates = makeAsyncStates('sparkles', [
      'Quick generate with current settings',
      quickGenSeedLine,
      `Op: ${widgetOpMetadata?.label ?? widgetOpType}`,
      widgetModel ? `Model: ${widgetModel}` : null,
      widgetEffectiveProviderId ? `Provider: ${widgetEffectiveProviderId}` : null,
      targetLabel ? `Target: ${targetLabel}` : null,
    ].filter(Boolean).join('\n'), 'Generating...');
    // Always render the idle (tappable) state — the action is non-blocking, so
    // the icon must never swap to a "busy" spinner. In-flight feedback comes
    // from the numeric count badge instead.
    const resolved = resolveButtonState(quickGenStates, 'idle');
    actions.push({
      id: 'quick-generate',
      icon: resolved.icon,
      label: resolved.label,
      title: `${withShortcut(resolved.title, quickGenAction?.shortcut)}\nDrag up to burst-fire (further = more, back down to cancel)`,
      countBadge: quickGenInFlight > 0 ? quickGenInFlight : null,
      burst: { steps: BURST_STEPS, onFire: fireQuickGenerateBurst },
      onClick: handlePrimaryQuickGenerate,
      onContextMenu: getActionContextMenuHandler({
        actionId: MEDIA_CARD_ACTION_IDS.quickGenerate,
        label: 'Quick generate',
      }),
      expand: {
        kind: 'quick-generate-menu',
        onQuickGenerateCurrent: handleQuickGenerateCurrent,
        onQuickGenerateReuseSeed: handleQuickGenerateWithReuseSeed,
        primaryMode: quickGenerateMode,
        hasSourceGenerationContext,
      },
      expandDelay: 150,
      collapseDelay: 200,
    });
  }

  // Extend video
  if (mediaType === 'video' && hasGenContext) {
    const extendStates = makeAsyncStates('arrowRight', 'Extend video', 'Extending...');
    const currentFrameTitle = hasSelectedFrame
      ? `Extract frame at ${(selectedTimestamp ?? 0).toFixed(2)}s and run image-to-video`
      : 'Lock a scrubber position first (hold a dot on the scrubber) to extract the current frame';
    const resolved = resolveButtonState(extendStates, isExtending ? 'busy' : 'idle');
    const artificialLastTitle = 'Extract the last frame and run image-to-video';
    const onNativeExtend = () => {
      void (extendPromptSource === 'active'
        ? handleExtendWithActivePrompt()
        : handleExtendWithSamePrompt());
    };
    actions.push({
      id: 'extend-video',
      icon: resolved.icon,
      label: resolved.label,
      title: withShortcut(resolved.title, extendAction?.shortcut),
      onClick: onNativeExtend,
      onContextMenu: getActionContextMenuHandler({
        actionId: MEDIA_CARD_ACTION_IDS.extend,
        label: 'Extend video',
      }),
      expand: {
        kind: 'extend-menu',
        promptSource: extendPromptSource,
        setPromptSource: setExtendPromptSource,
        onNativeExtend,
        onArtificialFirst: () => {
          void handleArtificialExtend({ selector: { mode: 'first' }, promptSource: extendPromptSource });
        },
        onArtificialLast: () => {
          void handleArtificialExtend({ selector: { mode: 'last' }, promptSource: extendPromptSource });
        },
        onArtificialCurrent: () => {
          if (!hasSelectedFrame || selectedTimestamp === null || selectedTimestamp === SELECT_LAST_FRAME) return;
          void handleArtificialExtend({
            selector: { mode: 'timestamp', seconds: selectedTimestamp },
            promptSource: extendPromptSource,
          });
        },
        hasSelectedFrame,
        currentFrameTitle,
        artificialLastTitle: withShortcut(artificialLastTitle, extendArtificialLastAction?.shortcut),
        isExtending,
      },
      expandDelay: 150,
      collapseDelay: 200,
    });
  }

  // Regenerate
  if (hasGenContext) {
    const regenerateSeedLine = regenerateMode === 'reuse-source-seed'
      ? 'Seed: reuse source generation seed'
      : 'Seed: fresh random seed';
    const regenStates = makeAsyncStates(
      'rotateCcw',
      ['Regenerate (run same generation again)', regenerateSeedLine].join('\n'),
      'Regenerating...',
    );
    // Non-blocking: never swap to the "busy" spinner — the count badge carries
    // in-flight feedback so the button stays tappable for rapid re-fires.
    const resolved = resolveButtonState(regenStates, 'idle');
    actions.push({
      id: 'regenerate',
      icon: resolved.icon,
      label: resolved.label,
      title: `${withShortcut(resolved.title, regenerateAction?.shortcut)}\nDrag up to burst-fire (further = more, back down to cancel)`,
      countBadge: regenerateInFlight > 0 ? regenerateInFlight : null,
      burst: { steps: BURST_STEPS, onFire: fireRegenerateBurst },
      onClick: handlePrimaryRegenerate,
      onContextMenu: getActionContextMenuHandler({
        actionId: MEDIA_CARD_ACTION_IDS.regenerate,
        label: 'Regenerate',
      }),
      expand: {
        kind: 'regenerate-menu',
        assetAcceptsInput,
        assetId: id,
        operationType,
        isLoadingSource,
        isInsertingPrompt,
        isInsertingSeed,
        isInsertingAssets,
        primarySeedMode: regenerateMode,
        insertPromptTitle: withShortcut('Insert only the prompt', insertPromptAction?.shortcut),
        insertSeedTitle: 'Insert only the seed',
        insertAssetsTitle: 'Replace widget inputs with the source generation assets',
        showInsertAssets: assetAcceptsInput,
        onRegenerateDefault: handleRegenerateDefault,
        onRegenerateReuseSeed: handleRegenerateWithReuseSeed,
        onRegenerateBurstDefault: fireRegenerateBurstDefault,
        onRegenerateBurstReuseSeed: fireRegenerateBurstReuseSeed,
        onLoadToQuickGen: () => { void handleLoadToQuickGen(); },
        onLoadToQuickGenNoSeed: handleLoadToQuickGenNoSeed,
        onInsertPrompt: handleInsertPromptOnly,
        onInsertSeed: handleInsertSeedOnly,
        onInsertAssets: handleInsertAssetsOnly,
        onOpenSourceAsset: handleOpenSourceAsset,
        targetSurfaces: quickGenTargetSurfaces,
        activeTargetWidgetId,
        onSetTarget: setQuickGenTarget,
      },
      expandDelay: 150,
      collapseDelay: 200,
    });
  }

  // Style variations
  if (hasGenContext) {
    const styleVarStates = makeAsyncStates('palette', 'Generate style variations', 'Generating variations...');
    const resolved = resolveButtonState(styleVarStates, isGeneratingVariations ? 'busy' : 'idle');
    actions.push({
      id: 'style-variations',
      icon: resolved.icon,
      label: resolved.label,
      title: withShortcut(resolved.title, variationsAction?.shortcut),
      onClick: () => { void handleGenerateStyleVariations(activeStyleCategory); },
      onContextMenu: getActionContextMenuHandler({
        actionId: MEDIA_CARD_ACTION_IDS.variations,
        label: 'Generate style variations',
      }),
      onMouseEnter: () => fetchStyleBlocks(activeStyleCategory),
      expand: {
        kind: 'style-variations',
        isGenerating: isGeneratingVariations,
        categories: styleCategories,
        activeCategory: activeStyleCategory,
        blocks: styleBlocksByCategory[activeStyleCategory] ?? null,
        onSelectCategory: selectStyleCategory,
        onPickPreset: (blockId: string) => {
          void handleGenerateStyleVariations(activeStyleCategory, [blockId]);
        },
        onSweepCategory: () => { void handleGenerateStyleVariations(activeStyleCategory); },
      },
      expandDelay: 150,
      collapseDelay: 200,
    });
  }

  const providerMenu: GenerationProviderMenuState = {
    open: isProviderMenuOpen,
    position: providerMenuPos,
    options: uploadTargetOptions,
    defaultId: defaultUploadProviderId,
    onSelect: handleProviderSelect,
    onClose: () => setIsProviderMenuOpen(false),
    onClearDefault: () => {
      clearDefaultUploadProvider();
      setIsProviderMenuOpen(false);
    },
  };

  // Apply the user's pill hide/reorder on top of context gating: only the
  // actions the card already made available can be hidden or reordered.
  const orderedActions = applyOrder(actions, actionPrefs.hidden, actionPrefs.order);

  return {
    actions: orderedActions,
    providerMenu,
    hotkeyContextMenu,
    container: {
      ref: triggerRef,
      onWheel: handleModeCycleWheel,
      onPointerEnter: setActiveCard,
      onPointerLeave: clearActiveCard,
      onFocusCapture: setActiveCard,
      onBlurCapture: handleBlurCapture,
      onMouseDown: handleMouseDown,
    },
  };
}
