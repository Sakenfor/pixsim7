/**
 * Skin-agnostic hook for the media-card generation button group.
 *
 * Returns logical action descriptors and container state. A "skin" component
 * (pill, cube, etc.) consumes these and handles rendering — the hook itself
 * contains no JSX, which keeps behavior and presentation independently
 * swappable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@pixsim7/shared.ui';

import { uploadAssetToProvider } from '@lib/api/assets';
import { searchBlocks, type PromptBlockResponse } from '@lib/api/blockTemplates';
import { useAction } from '@lib/capabilities';
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
  usePanelContext,
  type CharacterIngestActionContext,
  type GenerationWidgetContext,
} from '@features/contextHub';
import { useGenerationScopeStores, getGenerationSessionStore, getGenerationSettingsStore } from '@features/generation';
import { providerCapabilityRegistry, useProviderCapabilities, useOperationSpec, useProviderIdForModel } from '@features/providers';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardActionMode } from './mediaCardActionModeStore';
import { useMediaCardActionModeStore } from './mediaCardActionModeStore';
import { useMediaCardActionStore } from './mediaCardActionStore';
import { MEDIA_CARD_ACTION_IDS } from './mediaCardCapabilityActions';
import { useExtendPromptSourceStore } from './extendPromptSourceStore';
import { useSelectedVideoTimestamp, useVideoMarksStore, SELECT_LAST_FRAME } from './videoMarksStore';
import type { MediaCardOverlayData } from './mediaCardWidgets';
import { getSmartActionLabel, resolveMaxSlotsForModel } from './SlotPicker';
import { useGenerationCardHandlers } from './useGenerationCardHandlers';

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
      kind: 'regenerate-menu';
      assetAcceptsInput: boolean;
      assetId: number;
      operationType: OperationType;
      isLoadingSource: boolean;
      isInsertingPrompt: boolean;
      insertPromptTitle: string;
      insertSeedTitle: string;
      onLoadToQuickGen: () => void;
      onLoadToQuickGenNoSeed: () => void;
      onInsertPrompt: () => void;
      onInsertSeed: () => void;
      onOpenSourceAsset: (asset: AssetModel, list?: AssetModel[]) => void;
    }
  | {
      kind: 'style-variations';
      isGenerating: boolean;
      blocks: PromptBlockResponse[] | null;
      onPickPreset: (blockId: string) => void;
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

  const { value: widgetContext, provider: widgetProvider } =
    useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
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

  const {
    isQuickGenerating,
    isLoadingSource,
    isExtending,
    isRegenerating,
    isGeneratingVariations,
    isInsertingPrompt,
    handleQuickGenerate,
    handleLoadToQuickGen,
    handleInsertPromptOnly,
    handleInsertSeedOnly,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    handleArtificialExtend,
    handleRegenerate,
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

  // Style variation picker state (lazy-loaded on hover)
  const [styleBlocks, setStyleBlocks] = useState<PromptBlockResponse[] | null>(null);
  const styleBlocksFetchedRef = useRef(false);
  const fetchStyleBlocks = useCallback(() => {
    if (styleBlocksFetchedRef.current) return;
    styleBlocksFetchedRef.current = true;
    void searchBlocks({ category: 'aesthetic_preset', limit: 20 }).then(setStyleBlocks);
  }, []);

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

  useEffect(() => {
    const isVideoWithContext = mediaType === 'video' && !!hasGenContext;
    useMediaCardActionStore.getState().publishHandlers(id, {
      handleQuickGenerate: hasQuickGenerate ? handleQuickGenerate : undefined,
      handleExtendWithSamePrompt: isVideoWithContext ? handleExtendWithSamePrompt : undefined,
      handleExtendWithActivePrompt: isVideoWithContext ? handleExtendWithActivePrompt : undefined,
      handleArtificialExtend: isVideoWithContext ? handleArtificialExtend : undefined,
      handleRegenerate: hasGenContext ? handleRegenerate : undefined,
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
    handleQuickGenerate,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    handleArtificialExtend,
    handleRegenerate,
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
    const quickGenStates = makeAsyncStates('sparkles', [
      'Quick generate with current settings',
      `Op: ${widgetOpMetadata?.label ?? widgetOpType}`,
      widgetModel ? `Model: ${widgetModel}` : null,
      widgetEffectiveProviderId ? `Provider: ${widgetEffectiveProviderId}` : null,
      targetLabel ? `Target: ${targetLabel}` : null,
    ].filter(Boolean).join('\n'), 'Generating...');
    const resolved = resolveButtonState(quickGenStates, isQuickGenerating ? 'busy' : 'idle');
    actions.push({
      id: 'quick-generate',
      icon: resolved.icon,
      label: resolved.label,
      title: withShortcut(resolved.title, quickGenAction?.shortcut),
      onClick: handleQuickGenerate,
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
    const regenStates = makeAsyncStates('rotateCcw', 'Regenerate (run same generation again)', 'Regenerating...');
    const resolved = resolveButtonState(regenStates, isRegenerating ? 'busy' : 'idle');
    actions.push({
      id: 'regenerate',
      icon: resolved.icon,
      label: resolved.label,
      title: withShortcut(resolved.title, regenerateAction?.shortcut),
      onClick: handleRegenerate,
      expand: {
        kind: 'regenerate-menu',
        assetAcceptsInput,
        assetId: id,
        operationType,
        isLoadingSource,
        isInsertingPrompt,
        insertPromptTitle: withShortcut('Insert only the prompt', insertPromptAction?.shortcut),
        insertSeedTitle: 'Insert only the seed',
        onLoadToQuickGen: () => { void handleLoadToQuickGen(); },
        onLoadToQuickGenNoSeed: handleLoadToQuickGenNoSeed,
        onInsertPrompt: handleInsertPromptOnly,
        onInsertSeed: handleInsertSeedOnly,
        onOpenSourceAsset: handleOpenSourceAsset,
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
      onClick: () => { void handleGenerateStyleVariations(); },
      onMouseEnter: fetchStyleBlocks,
      expand: {
        kind: 'style-variations',
        isGenerating: isGeneratingVariations,
        blocks: styleBlocks,
        onPickPreset: (blockId: string) => {
          void handleGenerateStyleVariations('aesthetic_preset', [blockId]);
        },
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

  return {
    actions,
    providerMenu,
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
