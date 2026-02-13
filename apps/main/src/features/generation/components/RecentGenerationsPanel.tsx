import { ActionHintBadge, useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { listAssets } from '@lib/api/assets';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { Icon, ThemedIcon } from '@lib/icons';

import { fromAssetResponses, getAssetDisplayUrls, useAssetViewerStore } from '@features/assets';
import type { AssetModel } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared';
import { GenerationScopeProvider, useGenerationScopeStores } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { useOperationSpec, useProviderIdForModel } from '@features/providers';

import { SlotPickerGrid, resolveMaxSlotsFromSpecs, resolveMaxSlotsForModel } from '@/components/media/SlotPicker';
import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA, isMultiAssetOperation } from '@/types/operations';

export interface RecentGenerationsPanelProps {
  operationType?: OperationType;
  generationScopeId?: string;
  sourceLabel?: string;
  context?: {
    operationType?: OperationType;
    generationScopeId?: string;
    sourceLabel?: string;
  };
}

interface GenerationItemProps {
  asset: AssetModel;
  isLoading: boolean;
  operationType: OperationType;
  onSelect: () => void;
  onSelectSlot: (asset: AssetModel, slotIndex: number) => void;
  onOpenViewer: () => void;
  inputScopeId?: string;
  maxSlots?: number;
  isReplaceMode?: boolean;
}

function GenerationItem({
  asset,
  isLoading,
  operationType,
  onSelect,
  onSelectSlot,
  onOpenViewer,
  inputScopeId,
  maxSlots,
  isReplaceMode,
}: GenerationItemProps) {
  const showSlotPicker = isMultiAssetOperation(operationType);
  const zapRef = useRef<HTMLButtonElement | null>(null);
  const { isExpanded: slotPickerExpanded, handlers: slotPickerHandlers } = useHoverExpand({
    expandDelay: 150,
    collapseDelay: 150,
  });

  const stableHandlers = useMemo(
    () => slotPickerHandlers,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotPickerHandlers.onMouseEnter, slotPickerHandlers.onMouseLeave],
  );

  const [slotPickerPos, setSlotPickerPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (slotPickerExpanded && zapRef.current) {
      const rect = zapRef.current.getBoundingClientRect();
      setSlotPickerPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    } else {
      setSlotPickerPos(null);
    }
  }, [slotPickerExpanded]);

  const overlay = useMemo(
    () => (
      <>
        {/* Video indicator - bottom right */}
        {asset.mediaType === 'video' && (
          <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center pointer-events-none">
            <ThemedIcon name="play" size={10} variant="default" className="text-white" />
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white pointer-events-none">
            Loading...
          </div>
        )}
      </>
    ),
    [asset.mediaType, isLoading],
  );

  const hoverActions = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {/* Zap button — add as input; hover triggers slot picker for multi-asset ops */}
        <div {...(showSlotPicker ? stableHandlers : {})}>
          <button
            ref={zapRef}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="relative w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-colors text-white"
            title={isReplaceMode ? 'Replace current input' : showSlotPicker ? 'Add to input (hover for slot picker)' : 'Add to input'}
            type="button"
          >
            <Icon name="zap" size={12} className="text-white" color="#fff" />
            {isReplaceMode && (
              <ActionHintBadge icon={<Icon name="refresh-cw" size={7} color="#fff" />} />
            )}
          </button>
        </div>

        {/* Open in viewer */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenViewer();
          }}
          className="w-7 h-7 rounded-full bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center transition-colors text-white"
          title="Open in viewer"
          type="button"
        >
          <Icon name="eye" size={12} className="text-white" color="#fff" />
        </button>
      </div>
    ),
    [showSlotPicker, stableHandlers, onSelect, onOpenViewer, isReplaceMode],
  );

  return (
    <>
      <CompactAssetCard
        asset={asset}
        hideFooter
        className={isLoading ? 'opacity-60 pointer-events-none' : ''}
        onClick={onSelect}
        enableHoverPreview={asset.mediaType === 'video'}
        showPlayOverlay={false}
        overlay={overlay}
        hoverActions={hoverActions}
      />

      {/* Slot picker grid - portal to body to escape overflow-hidden */}
      {showSlotPicker && slotPickerExpanded && slotPickerPos && createPortal(
        <div
          className="fixed pb-4"
          style={{
            zIndex: 99999,
            left: slotPickerPos.x,
            bottom: window.innerHeight - slotPickerPos.y,
            transform: 'translateX(-50%)',
          }}
          {...stableHandlers}
        >
          <SlotPickerGrid
            asset={asset}
            operationType={operationType}
            onSelectSlot={onSelectSlot}
            maxSlots={maxSlots}
            inputScopeId={inputScopeId}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

// Track if we've already fetched in this session
let sessionHasFetched = false;

function RecentGenerationsPanelContent(props: RecentGenerationsPanelProps) {
  const controller = useQuickGenerateController();
  const operationType =
    controller.operationType ?? props.operationType ?? props.context?.operationType;
  const { useInputStore, useSessionStore, useSettingsStore, id: scopeId } = useGenerationScopeStores();
  const addInput = useInputStore((s) => s.addInput);
  const isReplaceMode = useInputStore((s) => s.inputModeByOperation?.[operationType] === 'replace');

  // Resolve max slots for slot picker
  const activeModel = useSettingsStore((s) => s.params?.model as string | undefined);
  const scopedProviderId = useSessionStore((s) => s.providerId);
  const inferredProviderId = useProviderIdForModel(activeModel);
  const effectiveProviderId = scopedProviderId ?? inferredProviderId;
  const operationSpec = useOperationSpec(effectiveProviderId, operationType);
  const maxSlots = useMemo(() => {
    const fromSpecs = resolveMaxSlotsFromSpecs(operationSpec?.parameters, operationType, activeModel);
    return fromSpecs ?? resolveMaxSlotsForModel(operationType, activeModel);
  }, [operationSpec?.parameters, operationType, activeModel]);

  // Fetch recent generated assets directly
  const [assets, setAssets] = useState<AssetModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listAssets({
        sort_by: 'created_at',
        sort_dir: 'desc',
        limit: 50,
      });

      if (mountedRef.current) {
        const allAssets = fromAssetResponses(response.assets);
        // Filter to only assets produced by a generation
        const generated = allAssets.filter((a) => a.sourceGenerationId != null);
        setAssets(generated);
        sessionHasFetched = true;
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(extractErrorMessage(err, 'Failed to fetch assets'));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!sessionHasFetched) {
      fetchAssets();
    }
    return () => { mountedRef.current = false; };
  }, [fetchAssets]);

  const acceptsInput = OPERATION_METADATA[operationType]?.acceptsInput ?? [];
  const canAcceptAssets = acceptsInput.length > 0;
  const openViewer = useAssetViewerStore((s) => s.openViewer);

  const handleSelect = useCallback(
    (asset: AssetModel) => {
      const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(asset);

      if (canAcceptAssets && acceptsInput.includes(asset.mediaType)) {
        addInput({ asset, operationType });
      } else {
        openViewer({
          id: asset.id,
          name: asset.name || `Asset ${asset.id}`,
          type: asset.mediaType === 'video' ? 'video' : 'image',
          url: thumbnailUrl || previewUrl || mainUrl || '',
          fullUrl: mainUrl,
          source: 'gallery',
        });
      }
    },
    [addInput, operationType, canAcceptAssets, acceptsInput, openViewer],
  );

  const handleOpenViewer = useCallback(
    (asset: AssetModel) => {
      const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(asset);

      openViewer({
        id: asset.id,
        name: asset.name || `Asset ${asset.id}`,
        type: asset.mediaType === 'video' ? 'video' : 'image',
        url: thumbnailUrl || previewUrl || mainUrl || '',
        fullUrl: mainUrl,
        source: 'gallery',
      });
    },
    [openViewer],
  );

  const handleSelectSlot = useCallback(
    (asset: AssetModel, slotIndex: number) => {
      addInput({ asset, operationType, slotIndex });
    },
    [addInput, operationType],
  );

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          Recent Generations
          {assets.length > 0 && (
            <span className="ml-1.5 text-[10px] font-normal text-neutral-500 dark:text-neutral-400">
              ({assets.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <span className="text-[10px] text-neutral-400">Loading...</span>
          )}
          <button
            type="button"
            onClick={fetchAssets}
            className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Refresh"
            disabled={isLoading}
          >
            <Icon name="refresh-cw" size={12} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-1 text-[10px] text-red-500 bg-red-50 dark:bg-red-900/20">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {assets.length === 0 && !isLoading && (
          <div className="text-xs text-neutral-500 italic text-center py-4">
            No completed generations yet.
          </div>
        )}

        {assets.length === 0 && isLoading && (
          <div className="text-xs text-neutral-500 italic text-center py-4">
            Loading...
          </div>
        )}

        {assets.length > 0 && (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
          >
            {assets.map((asset) => (
              <GenerationItem
                key={asset.id}
                asset={asset}
                isLoading={false}
                operationType={operationType}
                onSelect={() => handleSelect(asset)}
                onSelectSlot={handleSelectSlot}
                onOpenViewer={() => handleOpenViewer(asset)}
                inputScopeId={scopeId}
                maxSlots={maxSlots}
                isReplaceMode={isReplaceMode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RecentGenerationsPanel(props: RecentGenerationsPanelProps) {
  const scopeId =
    props.generationScopeId ?? props.context?.generationScopeId ?? undefined;

  if (!scopeId) {
    return <RecentGenerationsPanelContent {...props} />;
  }

  return (
    <GenerationScopeProvider scopeId={scopeId} label="Generation Settings">
      <RecentGenerationsPanelContent {...props} />
    </GenerationScopeProvider>
  );
}
