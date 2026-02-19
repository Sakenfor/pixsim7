 
/**
 * Content component for the generation button group.
 * Handles smart action, menu, slot picker, and regenerate functionality.
 */

import { ActionHintBadge, ButtonGroup, type ButtonGroupItem } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useMemo } from 'react';

import { getArrayParamLimits, type ParamSpec } from '@lib/generation-ui';
import { Icon } from '@lib/icons';
import type { MenuItem } from '@lib/ui/overlay';

import type { AssetModel } from '@features/assets';
import {
  CAP_GENERATION_WIDGET,
  useCapability,
  type GenerationWidgetContext,
} from '@features/contextHub';
import { useGenerationScopeStores } from '@features/generation';
import { useOperationSpec, useProviderIdForModel } from '@features/providers';

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

  const hasQuickGenerate = !!actions?.onQuickAdd;

  // Build button group items
  const supportsSlots = operationMetadata?.multiAssetMode !== 'single';
  const inputScopeId = widgetContext?.scopeId;
  const buttonItems: ButtonGroupItem[] = [];

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
    buttonItems.push({
      id: 'quick-generate',
      icon: isQuickGenerating ? (
        <Icon name="loader" size={14} className="animate-spin" />
      ) : (
        <Icon name="sparkles" size={14} />
      ),
      onClick: handleQuickGenerate,
      title: [
        'Quick generate with current settings',
        `Op: ${operationMetadata?.label ?? operationType}`,
        activeModel ? `Model: ${activeModel}` : null,
        effectiveProviderId ? `Provider: ${effectiveProviderId}` : null,
        targetLabel ? `Target: ${targetLabel}` : null,
      ].filter(Boolean).join('\n'),
      disabled: isQuickGenerating,
    });
  }

  // Extend Video button - only show for videos with generation context
  if (mediaType === 'video' && hasGenContext) {
    buttonItems.push({
      id: 'extend-video',
      icon: isExtending ? (
        <Icon name="loader" size={14} className="animate-spin" />
      ) : (
        <Icon name="arrowRight" size={14} />
      ),
      onClick: handleExtendWithSamePrompt,
      title: 'Extend video',
      disabled: isExtending,
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
    buttonItems.push({
      id: 'regenerate',
      icon: isRegenerating ? (
        <Icon name="loader" size={14} className="animate-spin" />
      ) : (
        <Icon name="rotateCcw" size={14} />
      ),
      onClick: handleRegenerate,
      title: 'Regenerate (run same generation again)',
      disabled: isRegenerating,
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
    </div>
  );
}
