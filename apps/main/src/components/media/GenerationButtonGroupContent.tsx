 
/**
 * Content component for the generation button group.
 * Handles smart action, menu, slot picker, and regenerate functionality.
 */

import { ActionHintBadge, ButtonGroup, Dropdown, DropdownItem, DropdownDivider, PortalFloat, useToast, type ButtonGroupItem } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

import { uploadAssetToProvider } from '@lib/api/assets';
import { getArrayParamLimits, type ParamSpec } from '@lib/generation-ui';
import { Icon } from '@lib/icons';
import { resolveButtonState, makeAsyncStates, UPLOAD_BUTTON_STATES } from '@lib/ui/buttonStates';
import type { MenuItem } from '@lib/ui/overlay';

import type { AssetModel } from '@features/assets';
import { hydrateAssetModel } from '@features/assets/lib/hydrateAssetModel';
import { getUploadCapableProviders, resolveUploadTarget } from '@features/assets/lib/resolveUploadTarget';
import { extractUploadError } from '@features/assets/lib/uploadActions';
import { useUploadProviderStore } from '@features/assets/stores/uploadProviderStore';
import {
  CAP_GENERATION_WIDGET,
  useCapability,
  type GenerationWidgetContext,
} from '@features/contextHub';
import { useGenerationScopeStores, getGenerationSessionStore, getGenerationSettingsStore } from '@features/generation';
import { providerCapabilityRegistry, useProviderCapabilities, useOperationSpec, useProviderIdForModel } from '@features/providers';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

import type { MediaCardResolvedProps } from './MediaCard';
import { buildGenerationMenuItems } from './mediaCardGeneration';
import type { MediaCardOverlayData } from './mediaCardWidgets';
import { getSmartActionLabel, resolveMaxSlotsForModel, SlotPickerGrid } from './SlotPicker';
import { SourceAssetsPreview } from './SourceAssetsPreview';
import { useGenerationCardHandlers } from './useGenerationCardHandlers';

type GenerationButtonGroupContentProps = {
  data: MediaCardOverlayData;
  cardProps: MediaCardResolvedProps;
};

type UploadTargetOption = {
  id: string;
  label: string;
};

export function GenerationButtonGroupContent({ data, cardProps }: GenerationButtonGroupContentProps) {
  const { id, mediaType, actions } = cardProps;
  const toast = useToast();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [providerMenuPos, setProviderMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Use capability to get nearest generation widget, with global fallback
  const { value: widgetContext, provider: widgetProvider } =
    useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);

  // Get scoped stores (follows same scoping as the widget capability)
  const { useSessionStore, useSettingsStore, useInputStore, id: scopedScopeId } = useGenerationScopeStores();
  const scopedOperationType = useSessionStore((s) => s.operationType);
  const scopedAddInput = useInputStore((s) => s.addInput);
  const scopedAddInputs = useInputStore((s) => s.addInputs);
  const isReplaceMode = useInputStore((s) => s.inputModeByOperation?.[scopedOperationType] === 'replace');

  // For widget open/close, use capability if available
  // If no widget context, inputs are still added - user can manually open generation UI
  const setWidgetOpen = widgetContext?.setOpen;

  // Operation type and input actions come from scoped stores (via capability or scope context)
  const operationType = widgetContext?.operationType ?? scopedOperationType;
  const addInput = widgetContext?.addInput ?? scopedAddInput;
  const addInputs = widgetContext?.addInputs ?? scopedAddInputs;
  const activeModel = useSettingsStore((s) => s.params?.model as string | undefined);
  const scopedProviderId = useSessionStore((s) => s.providerId);
  const inferredProviderId = useProviderIdForModel(activeModel);
  const effectiveProviderId = scopedProviderId ?? inferredProviderId;

  // Widget scope stores — quick generate delegates to the widget's generateWithAsset,
  // which runs in the widget's scope (not the media card's local scope).
  // Read model/provider from the widget scope so tooltip and visibility checks are accurate.
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
  // Resolve max slots the same way AssetPanel does (getArrayParamLimits on composition_assets).
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

  // Keep the full source asset when available so we preserve providerUploads and
  // other metadata needed by upload-target resolution.
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
    isInsertingPrompt,
    handleQuickGenerate,
    handleLoadToQuickGen,
    handleInsertPromptOnly,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    handleRegenerate,
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

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  const handleSmartAction = useCallback(() => {
    void (async () => {
      const resolvedAsset = await resolveInputAsset(inputAsset);
      addInputs({
        assets: [resolvedAsset],
        operationType,
      });
      // Open the generation widget if available via capability
      setWidgetOpen?.(true);
    })();
  }, [resolveInputAsset, inputAsset, addInputs, operationType, setWidgetOpen]);

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    void handleSelectSlot(inputAsset, 0);
    setWidgetOpen?.(true);
  };

  const handleMenuItemClick = (item: MenuItem) => {
    item.onClick?.(data);
    setIsMenuOpen(false);
  };

  const handleSelectSlot = useCallback(async (selectedAsset: AssetModel, slotIndex: number) => {
    const resolvedAsset = await resolveInputAsset(selectedAsset);
    addInput({
      asset: resolvedAsset,
      operationType,
      slotIndex,
    });
  }, [resolveInputAsset, addInput, operationType]);

  // Upload-to-provider logic
  // useProviderCapabilities ensures registry data is loaded (triggers re-render on load)
  const { capabilities: allProviderCaps } = useProviderCapabilities();
  const defaultUploadProviderId = useUploadProviderStore((s) => s.defaultUploadProviderId);
  const setDefaultUploadProvider = useUploadProviderStore((s) => s.setDefaultUploadProvider);
  const clearDefaultUploadProvider = useUploadProviderStore((s) => s.clearDefaultUploadProvider);

  const uploadCapableProviders = useMemo(() => getUploadCapableProviders(), [allProviderCaps]);
  const hasLocalUpload = !!cardProps.onUploadClick;
  const hasProviderUpload = uploadCapableProviders.length > 0;
  const canRouteUploadTarget = typeof cardProps.onUploadToProvider === 'function';
  const showUploadButton = hasLocalUpload || hasProviderUpload;

  const uploadTargetOptions = useMemo<UploadTargetOption[]>(() => {
    const options: UploadTargetOption[] = [];
    if (hasLocalUpload) {
      options.push({ id: 'library', label: 'Library' });
    }
    if (!hasLocalUpload || canRouteUploadTarget) {
      for (const provider of uploadCapableProviders) {
        options.push({ id: provider.providerId, label: provider.name });
      }
    }
    return options;
  }, [hasLocalUpload, canRouteUploadTarget, uploadCapableProviders]);

  const resolveDefaultUploadTargetId = useCallback((): string | null => {
    if (hasLocalUpload) {
      if (
        defaultUploadProviderId &&
        uploadTargetOptions.some((option) => option.id === defaultUploadProviderId)
      ) {
        return defaultUploadProviderId;
      }
      return 'library';
    }
    const target = resolveUploadTarget(defaultUploadProviderId);
    return target?.providerId ?? null;
  }, [hasLocalUpload, defaultUploadProviderId, uploadTargetOptions]);

  const handleUploadToTarget = useCallback(async (targetId: string) => {
    setIsUploading(true);
    try {
      if (canRouteUploadTarget && cardProps.onUploadToProvider) {
        // Delegate handles its own toast — don't double-notify
        await cardProps.onUploadToProvider(id, targetId);
      } else if (hasLocalUpload && targetId === 'library') {
        await cardProps.onUploadClick?.(id);
        toast.success('Uploaded to library');
      } else {
        await uploadAssetToProvider(id, targetId);
        const targetLabel = uploadTargetOptions.find((o) => o.id === targetId)?.label ?? targetId;
        toast.success(`Uploaded to ${targetLabel}`);
      }
      cardProps.actions?.onReuploadDone?.();
    } catch (err: unknown) {
      const detail = extractUploadError(err);
      console.error('Upload to provider failed:', detail);
      toast.error(detail);
    } finally {
      setIsUploading(false);
    }
  }, [canRouteUploadTarget, cardProps, hasLocalUpload, id, toast, uploadTargetOptions]);

  const handleUploadClick = useCallback(() => {
    if (hasLocalUpload && !canRouteUploadTarget) {
      void cardProps.onUploadClick?.(id);
      return;
    }
    const targetId = resolveDefaultUploadTargetId();
    if (targetId) {
      void handleUploadToTarget(targetId);
    } else if (uploadTargetOptions.length > 1) {
      // Multiple providers, no default — open the picker
      // Use the button position for fixed dropdown
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setProviderMenuPos({ x: rect.left, y: rect.bottom + 4 });
      }
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
    setIsProviderMenuOpen(true);
  }, [uploadTargetOptions.length]);

  const handleProviderSelect = useCallback((targetId: string) => {
    setDefaultUploadProvider(targetId);
    setIsProviderMenuOpen(false);
    void handleUploadToTarget(targetId);
  }, [setDefaultUploadProvider, handleUploadToTarget]);

  const hasGenContext = data.sourceGenerationId || data.hasGenerationContext;

  // Check if the asset's original operation type accepts media input
  // (e.g. image_to_video does, text_to_image does not)
  const assetOpType = data.operationType as OperationType | null | undefined;
  const assetAcceptsInput = assetOpType
    ? (OPERATION_METADATA[assetOpType]?.acceptsInput?.length ?? 0) > 0
    : false;
  const menuItems = useMemo<MenuItem[]>(() => {
    const items = buildGenerationMenuItems(id, mediaType, actions);

    if (hasGenContext) {
      items.push({
        id: 'load-to-quick-gen',
        label: 'Load to Quick Gen',
        icon: 'edit',
        onClick: () => {
          void handleLoadToQuickGen();
        },
        disabled: isLoadingSource,
      });
      items.push({
        id: 'regenerate-now',
        label: 'Regenerate Now',
        icon: 'rotateCcw',
        onClick: () => {
          void handleRegenerate();
        },
        disabled: isRegenerating,
      });
    }

    if (mediaType === 'video' && hasGenContext) {
      items.unshift(
        {
          id: 'extend-active-prompt-now',
          label: 'Extend Active Prompt',
          icon: 'edit',
          onClick: () => {
            void handleExtendWithActivePrompt();
          },
          disabled: isExtending,
        },
        {
          id: 'extend-same-prompt-now',
          label: 'Extend Same Prompt',
          icon: 'arrowRight',
          onClick: () => {
            void handleExtendWithSamePrompt();
          },
          disabled: isExtending,
        },
      );
    }

    return items;
  }, [
    id,
    mediaType,
    actions,
    hasGenContext,
    handleLoadToQuickGen,
    isLoadingSource,
    handleRegenerate,
    isRegenerating,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    isExtending,
  ]);

  // Quick generate requires: capability enabled, widget available, and asset accessible to provider.
  // Providers with asset_upload feature (e.g. Pixverse) require the asset uploaded to their platform first.
  // Use widget scope provider for quick-generate visibility — the generation runs in the
  // widget's scope, so the upload check must match the provider generateWithAsset will use.
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
    && !!widgetContext?.generateWithAsset
    && assetUploadedToProvider;

  // Build button group items
  const supportsSlots = true;
  const inputScopeId = widgetContext?.scopeId;
  const buttonItems: ButtonGroupItem[] = [];

  // Upload button — context-aware: local folders get "Upload to library", library cards get "Upload to provider"
  // Both support right-click to choose provider when multiple upload-capable providers exist.
  const externalUploadState = (data.uploadState || 'idle') as keyof typeof UPLOAD_BUTTON_STATES;
  const effectiveUploadState: keyof typeof UPLOAD_BUTTON_STATES = isUploading ? 'uploading' : externalUploadState;
  if (showUploadButton && !cardProps.presetCapabilities?.skipPillUpload) {
    const resolved = resolveButtonState(UPLOAD_BUTTON_STATES, effectiveUploadState);
    const defaultTargetId = resolveDefaultUploadTargetId();
    const defaultTarget = defaultTargetId
      ? uploadTargetOptions.find((option) => option.id === defaultTargetId)
      : null;
    const uploadTitle = hasLocalUpload
      ? defaultTarget
        ? `Upload to ${defaultTarget.label} (right-click to choose target)`
        : 'Upload (right-click to choose target)'
      : (() => {
          const target = resolveUploadTarget(defaultUploadProviderId);
          if (target) return `Upload to ${target.name}`;
          return 'Upload to provider (right-click to choose)';
        })();
    buttonItems.push({
      id: 'upload',
      ...resolved,
      title: uploadTitle,
      onClick: handleUploadClick,
      onContextMenu: handleUploadContextMenu,
      badge: uploadTargetOptions.length > 1 ? (
        <ActionHintBadge icon={<Icon name="chevronDown" size={7} color="#fff" />} />
      ) : undefined,
    });
  }

  if (menuItems.length > 0) {
    buttonItems.push({
      id: 'menu',
      icon: <Icon name="chevronDown" size={12} />,
      onClick: () => setIsMenuOpen(!isMenuOpen),
      title: 'Generation options',
    });
  }

  buttonItems.push({
      id: 'smart-action',
      icon: <Icon name="zap" size={12} />,
      onClick: handleSmartAction,
      onAuxClick: handleMiddleClick,
      title: isReplaceMode
        ? `Replace current input${targetInfo}`
        : supportsSlots
          ? `${smartActionLabel}${targetInfo}\nHover: slot picker\nMiddle-click: replace slot 1`
          : `${smartActionLabel}${targetInfo}`,
      badge: isReplaceMode ? (
        <ActionHintBadge icon={<Icon name="refresh-cw" size={7} color="#fff" />} />
      ) : undefined,
      expandContent: supportsSlots ? (
        <SlotPickerGrid
          asset={inputAsset}
          operationType={operationType}
          onSelectSlot={handleSelectSlot}
          maxSlots={maxSlots}
          inputScopeId={inputScopeId}
        />
      ) : undefined,
      expandDelay: 150,
    });

  if (hasQuickGenerate) {
    // Show widget scope values — these match what generateWithAsset will actually use.
    const widgetOpType = widgetContext!.operationType ?? operationType;
    const widgetOpMetadata = OPERATION_METADATA[widgetOpType];
    const quickGenStates = makeAsyncStates('sparkles', [
      'Quick generate with current settings',
      `Op: ${widgetOpMetadata?.label ?? widgetOpType}`,
      widgetModel ? `Model: ${widgetModel}` : null,
      widgetEffectiveProviderId ? `Provider: ${widgetEffectiveProviderId}` : null,
      targetLabel ? `Target: ${targetLabel}` : null,
    ].filter(Boolean).join('\n'), 'Generating...');
    buttonItems.push({
      id: 'quick-generate',
      ...resolveButtonState(quickGenStates, isQuickGenerating ? 'busy' : 'idle'),
      onClick: handleQuickGenerate,
    });
  }

  // Extend Video button - only show for videos with generation context
  if (mediaType === 'video' && hasGenContext) {
    const extendStates = makeAsyncStates('arrowRight', 'Extend video', 'Extending...');
    buttonItems.push({
      id: 'extend-video',
      ...resolveButtonState(extendStates, isExtending ? 'busy' : 'idle'),
      onClick: handleExtendWithSamePrompt,
      expandContent: (
        <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl">
          <button
            onClick={() => { void handleExtendWithSamePrompt(); }}
            className="w-40 h-8 px-3 text-xs text-white hover:bg-white/15 rounded-t-xl transition-colors flex items-center gap-2"
            title="Extend using the original generation prompt"
            disabled={isExtending}
            type="button"
          >
            <Icon name="rotateCcw" size={12} />
            <span>Same Prompt</span>
          </button>
          <button
            onClick={() => { void handleExtendWithActivePrompt(); }}
            className="w-40 h-8 px-3 text-xs text-white hover:bg-white/15 rounded-b-xl transition-colors flex items-center gap-2"
            title="Extend using the prompt currently in the generation widget"
            disabled={isExtending}
            type="button"
          >
            <Icon name="edit" size={12} />
            <span>Active Prompt</span>
          </button>
        </div>
      ),
      expandDelay: 150,
      collapseDelay: 200,
    });
  }

  // Regenerate button - only show if asset has generation context
  if (hasGenContext) {
    const regenStates = makeAsyncStates('rotateCcw', 'Regenerate (run same generation again)', 'Regenerating...');
    buttonItems.push({
      id: 'regenerate',
      ...resolveButtonState(regenStates, isRegenerating ? 'busy' : 'idle'),
      onClick: handleRegenerate,
      expandContent: (
        <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl">
          <button
            onClick={handleLoadToQuickGen}
            className="w-36 h-8 px-3 text-xs text-white hover:bg-white/15 rounded-t-xl transition-colors flex items-center gap-2"
            title="Load everything into Quick Generate"
            disabled={isLoadingSource}
            type="button"
          >
            {isLoadingSource ? (
              <Icon name="loader" size={12} className="animate-spin" />
            ) : (
              <Icon name="edit" size={12} />
            )}
            <span>Load to Quick Gen</span>
          </button>
          <button
            onClick={handleInsertPromptOnly}
            className={`w-36 h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2 ${assetAcceptsInput ? '' : 'rounded-b-xl'}`}
            title="Insert only the prompt"
            disabled={isInsertingPrompt}
            type="button"
          >
            {isInsertingPrompt ? (
              <Icon name="loader" size={12} className="animate-spin" />
            ) : (
              <Icon name="fileText" size={12} />
            )}
            <span>Insert Prompt</span>
          </button>
          {assetAcceptsInput && (
            <SourceAssetsPreview assetId={id} operationType={operationType} addInput={addInput} />
          )}
        </div>
      ),
      expandDelay: 150,
      collapseDelay: 200,
    });
  }

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        onClick={(e) => e.stopPropagation()}
        onAuxClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          // Keep card click handlers from hijacking button interactions,
          // but allow right-click to bubble so asset context menus can resolve.
          if (e.button === 0 || e.button === 1) {
            e.stopPropagation();
          }
        }}
      >
        <ButtonGroup
          layout="pill"
          size="sm"
          items={buttonItems}
          expandOffset={8}
          portal
          responsiveVisible
          wheelCycle
          preferredVisibleId="smart-action"
        />
      </div>

      {/* Menu dropdown — portaled to escape overflow/stacking-context constraints */}
      {isMenuOpen && menuItems.length > 0 && (
        <PortalFloat
          anchor={triggerRef.current}
          placement="top"
          offset={4}
          className="
            min-w-[180px]
            bg-white dark:bg-neutral-800
            border border-neutral-200 dark:border-neutral-700
            rounded-lg shadow-lg
            py-1
            overflow-hidden
          "
        >
          <div ref={menuRef}>
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleMenuItemClick(item)}
                disabled={item.disabled}
                className="
                  w-full px-3 py-2 flex items-center gap-2 text-sm text-left
                  hover:bg-neutral-100 dark:hover:bg-neutral-700
                  transition-colors cursor-pointer
                "
              >
                {item.icon && (
                  <Icon
                    name={item.icon as any}
                    size={14}
                    className="text-neutral-500 dark:text-neutral-400"
                  />
                )}
                <span className="flex-1">{item.label}</span>
              </button>
            ))}
          </div>
        </PortalFloat>
      )}

      {/* Provider picker dropdown (right-click on upload button) */}
      {isProviderMenuOpen && providerMenuPos && (
        <Dropdown
          isOpen={isProviderMenuOpen}
          onClose={() => setIsProviderMenuOpen(false)}
          positionMode="fixed"
          anchorPosition={providerMenuPos}
          minWidth="180px"
          portal
        >
          {uploadTargetOptions.map((target) => (
            <DropdownItem
              key={target.id}
              onClick={() => handleProviderSelect(target.id)}
              icon={<Icon name="upload" size={12} />}
              rightSlot={
                defaultUploadProviderId === target.id
                  ? <Icon name="check" size={12} className="text-accent" />
                  : undefined
              }
            >
              {target.label}
            </DropdownItem>
          ))}
          {defaultUploadProviderId && (
            <>
              <DropdownDivider />
              <DropdownItem
                onClick={() => {
                  clearDefaultUploadProvider();
                  setIsProviderMenuOpen(false);
                }}
                icon={<Icon name="x" size={12} />}
              >
                Clear default
              </DropdownItem>
            </>
          )}
        </Dropdown>
      )}
    </div>
  );
}
