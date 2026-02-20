 
/**
 * Content component for the generation button group.
 * Handles smart action, menu, slot picker, and regenerate functionality.
 */

import { ActionHintBadge, ButtonGroup, Dropdown, DropdownItem, DropdownDivider, type ButtonGroupItem } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

import { uploadAssetToProvider } from '@lib/api/assets';
import { getArrayParamLimits, type ParamSpec } from '@lib/generation-ui';
import { Icon } from '@lib/icons';
import { resolveButtonState, makeAsyncStates, UPLOAD_BUTTON_STATES } from '@lib/ui/buttonStates';
import type { MenuItem } from '@lib/ui/overlay';

import type { AssetModel } from '@features/assets';
import { getUploadCapableProviders, resolveUploadTarget } from '@features/assets/lib/resolveUploadTarget';
import { useUploadProviderStore } from '@features/assets/stores/uploadProviderStore';
import {
  CAP_GENERATION_WIDGET,
  useCapability,
  type GenerationWidgetContext,
} from '@features/contextHub';
import { useGenerationScopeStores } from '@features/generation';
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

export function GenerationButtonGroupContent({ data, cardProps }: GenerationButtonGroupContentProps) {
  const { id, mediaType, actions } = cardProps;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [providerMenuPos, setProviderMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const uploadBtnRef = useRef<HTMLButtonElement | null>(null);

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
  const operationSpec = useOperationSpec(effectiveProviderId, operationType);

  const smartActionLabel = getSmartActionLabel(mediaType, operationType);
  const targetLabel = widgetProvider?.label ?? widgetContext?.widgetId;
  const targetInfo = targetLabel ? `\nTarget: ${targetLabel}` : '';
  const operationMetadata = OPERATION_METADATA[operationType];

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

  // Reconstruct asset for slot picker and quick-generation hydration.
  const inputAsset = useMemo<AssetModel>(() => ({
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
  }), [
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

  const handleSmartAction = () => {
    addInputs({
      assets: [inputAsset],
      operationType,
    });
    // Open the generation widget if available via capability
    setWidgetOpen?.(true);
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    handleSelectSlot(inputAsset, 0);
    setWidgetOpen?.(true);
  };

  const handleMenuItemClick = (item: MenuItem) => {
    item.onClick?.(data);
    setIsMenuOpen(false);
  };

  const handleSelectSlot = (selectedAsset: AssetModel, slotIndex: number) => {
    addInput({
      asset: selectedAsset,
      operationType,
      slotIndex,
    });
  };

  // Upload-to-provider logic
  // useProviderCapabilities ensures registry data is loaded (triggers re-render on load)
  const { capabilities: allProviderCaps } = useProviderCapabilities();
  const defaultUploadProviderId = useUploadProviderStore((s) => s.defaultUploadProviderId);
  const setDefaultUploadProvider = useUploadProviderStore((s) => s.setDefaultUploadProvider);
  const clearDefaultUploadProvider = useUploadProviderStore((s) => s.clearDefaultUploadProvider);

  const uploadCapableProviders = useMemo(() => getUploadCapableProviders(), [allProviderCaps]);
  const hasLocalUpload = !!cardProps.onUploadClick;
  const hasProviderUpload = uploadCapableProviders.length > 0;
  const showUploadButton = hasLocalUpload || hasProviderUpload;

  const handleUploadToProvider = useCallback(async (providerId: string) => {
    setIsUploading(true);
    try {
      await uploadAssetToProvider(id, providerId);
      cardProps.actions?.onReuploadDone?.();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Upload failed';
      console.error('Upload to provider failed:', detail);
    } finally {
      setIsUploading(false);
    }
  }, [id, cardProps.actions]);

  const handleUploadClick = useCallback(() => {
    if (hasLocalUpload) {
      void cardProps.onUploadClick?.(id);
      return;
    }
    const target = resolveUploadTarget(defaultUploadProviderId);
    if (target) {
      void handleUploadToProvider(target.providerId);
    } else if (uploadCapableProviders.length > 1) {
      // Multiple providers, no default — open the picker
      // Use the button position for fixed dropdown
      const rect = uploadBtnRef.current?.getBoundingClientRect();
      if (rect) {
        setProviderMenuPos({ x: rect.left, y: rect.bottom + 4 });
      }
      setIsProviderMenuOpen(true);
    }
  }, [hasLocalUpload, cardProps, id, defaultUploadProviderId, handleUploadToProvider, uploadCapableProviders.length]);

  const handleUploadContextMenu = useCallback((e: React.MouseEvent) => {
    if (!hasProviderUpload) return;
    e.preventDefault();
    e.stopPropagation();
    setProviderMenuPos({ x: e.clientX, y: e.clientY });
    setIsProviderMenuOpen(true);
  }, [hasProviderUpload]);

  const handleProviderSelect = useCallback((providerId: string) => {
    setDefaultUploadProvider(providerId);
    setIsProviderMenuOpen(false);
    void handleUploadToProvider(providerId);
  }, [setDefaultUploadProvider, handleUploadToProvider]);

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
  const providerRequiresUpload = effectiveProviderId
    ? providerCapabilityRegistry.hasFeature(effectiveProviderId, 'asset_upload')
    : false;
  const assetUploadedToProvider = providerRequiresUpload
    ? !!(
        cardProps.contextMenuAsset?.providerUploads?.[effectiveProviderId!] ||
        cardProps.contextMenuAsset?.providerId === effectiveProviderId
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
  if (showUploadButton) {
    const resolved = resolveButtonState(UPLOAD_BUTTON_STATES, effectiveUploadState);
    const uploadTitle = hasLocalUpload
      ? hasProviderUpload
        ? `${resolved.title} (right-click to choose provider)`
        : resolved.title
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
      badge: hasProviderUpload && uploadCapableProviders.length > 1 ? (
        <ActionHintBadge icon={<Icon name="chevronDown" size={7} color="#fff" />} />
      ) : undefined,
    });
  }

  if (menuItems.length > 0) {
    buttonItems.push({
      id: 'menu',
      icon: <Icon name="chevronDown" size={14} />,
      onClick: () => setIsMenuOpen(!isMenuOpen),
      title: 'Generation options',
    });
  }

  buttonItems.push({
      id: 'smart-action',
      icon: <Icon name="zap" size={14} />,
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
    const quickGenStates = makeAsyncStates('sparkles', [
      'Quick generate with current settings',
      `Op: ${operationMetadata?.label ?? operationType}`,
      activeModel ? `Model: ${activeModel}` : null,
      effectiveProviderId ? `Provider: ${effectiveProviderId}` : null,
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
      <div ref={triggerRef}>
        <ButtonGroup layout="pill" items={buttonItems} expandOffset={8} />
      </div>

      {/* Menu dropdown */}
      {isMenuOpen && menuItems.length > 0 && (
        <div
          ref={menuRef}
          className="
            absolute bottom-full mb-1 left-1/2 -translate-x-1/2
            min-w-[180px]
            bg-white dark:bg-neutral-800
            border border-neutral-200 dark:border-neutral-700
            rounded-lg shadow-lg
            py-1 z-50
            overflow-hidden
          "
        >
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
          {uploadCapableProviders.map((p) => (
            <DropdownItem
              key={p.providerId}
              onClick={() => handleProviderSelect(p.providerId)}
              icon={<Icon name="upload" size={12} />}
              rightSlot={
                defaultUploadProviderId === p.providerId
                  ? <Icon name="check" size={12} className="text-accent" />
                  : undefined
              }
            >
              {p.name}
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
