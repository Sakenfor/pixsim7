import { ActionHintBadge, IconButton, useHoverExpand } from '@pixsim7/shared.ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';

import type { AssetModel } from '@features/assets';
import { getAssetDisplayUrls, useAssetViewerStore } from '@features/assets';
import type { AssetFilters } from '@features/assets/hooks/useAssets';
import { useAssets } from '@features/assets/hooks/useAssets';
import { CompactAssetCard } from '@features/assets/components/shared';
import { GalleryFilters } from '@features/assets/components/shared/GalleryFilters';
import { GenerationScopeProvider, useGenerationScopeStores } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { useOperationSpec, useProviderIdForModel } from '@features/providers';

import { SlotPickerGrid, resolveMaxSlotsFromSpecs, resolveMaxSlotsForModel } from '@/components/media/SlotPicker';
import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA, isMultiAssetOperation } from '@/types/operations';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MiniGalleryProps {
  /** Initial filter state (user can change via UI) */
  initialFilters?: AssetFilters;

  // Which filter controls to show (only when using useAssets data source)
  showSearch?: boolean;
  showMediaType?: boolean;
  showSort?: boolean;
  /** Explicit override for filter bar visibility. Defaults to true when using
   *  useAssets, false when `items` is provided. */
  showFilters?: boolean;

  // Generation input integration (optional)
  generationScopeId?: string;
  operationType?: OperationType;

  // Context from floating panel system
  context?: {
    operationType?: OperationType;
    generationScopeId?: string;
    sourceLabel?: string;
    initialFilters?: AssetFilters;
  };

  // --- External data source ---
  /** When provided, these items are rendered instead of fetching via useAssets. */
  items?: AssetModel[];

  // --- UI customization ---
  /** Custom header rendered above the grid (below filter bar if visible). */
  header?: ReactNode;
  /** Empty-state text. */
  emptyMessage?: string;

  // --- Card customization ---
  /** Extra overlay content rendered on top of each card (pin badges, counts, etc.). */
  renderItemOverlay?: (asset: AssetModel) => ReactNode;
  /** Wrap or replace the default hover actions (zap + viewer buttons).
   *  Receives the asset and the default action buttons as `defaultActions`. */
  renderItemActions?: (asset: AssetModel, defaultActions: ReactNode) => ReactNode;

  // --- Asset resolution ---
  /** Called before addInput / openViewer when asset data may be incomplete
   *  (e.g. history entries that only carry a thumbnail). Return the full
   *  AssetModel so downstream logic has all URLs. */
  resolveAsset?: (asset: AssetModel) => Promise<AssetModel>;
}

// ---------------------------------------------------------------------------
// MiniGalleryItem — individual card with hover actions + slot picker
// ---------------------------------------------------------------------------

interface MiniGalleryItemProps {
  asset: AssetModel;
  isResolving: boolean;
  operationType: OperationType;
  onSelect: () => void;
  onSelectSlot: (asset: AssetModel, slotIndex: number) => void;
  onOpenViewer: () => void;
  inputScopeId?: string;
  maxSlots?: number;
  isReplaceMode?: boolean;
  extraOverlay?: ReactNode;
  renderActions?: (asset: AssetModel, defaultActions: ReactNode) => ReactNode;
}

function MiniGalleryItem({
  asset,
  isResolving,
  operationType,
  onSelect,
  onSelectSlot,
  onOpenViewer,
  inputScopeId,
  maxSlots,
  isReplaceMode,
  extraOverlay,
  renderActions,
}: MiniGalleryItemProps) {
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
        {asset.mediaType === 'video' && (
          <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center pointer-events-none">
            <Icon name="play" size={10} variant="default" className="text-white" />
          </div>
        )}
        {isResolving && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white pointer-events-none">
            Loading...
          </div>
        )}
        {extraOverlay}
      </>
    ),
    [asset.mediaType, isResolving, extraOverlay],
  );

  const defaultActions = useMemo(
    () => (
      <>
        {/* Zap button — add as input; hover triggers slot picker for multi-asset ops */}
        <div {...(showSlotPicker ? stableHandlers : {})}>
          <IconButton
            ref={zapRef}
            size="lg"
            rounded="full"
            icon={<>
              <Icon name="zap" size={12} />
              {isReplaceMode && (
                <ActionHintBadge icon={<Icon name="refresh-cw" size={7} color="#fff" />} />
              )}
            </>}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="relative bg-blue-600 hover:bg-blue-700"
            style={{ color: '#fff' }}
            title={isReplaceMode ? 'Replace current input' : showSlotPicker ? 'Add to input (hover for slot picker)' : 'Add to input'}
          />
        </div>
      </>
    ),
    [showSlotPicker, stableHandlers, onSelect, isReplaceMode],
  );

  const hoverActions = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {renderActions ? renderActions(asset, defaultActions) : defaultActions}
      </div>
    ),
    [asset, defaultActions, renderActions],
  );

  return (
    <>
      <CompactAssetCard
        asset={asset}
        hideFooter
        aspectSquare
        className={isResolving ? 'opacity-60 pointer-events-none' : ''}
        onClick={onOpenViewer}
        enableHoverPreview={asset.mediaType === 'video'}
        showPlayOverlay={false}
        overlay={overlay}
        hoverActions={hoverActions}
      />

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

// ---------------------------------------------------------------------------
// MiniGalleryContent — inner component that requires GenerationScopeProvider
// ---------------------------------------------------------------------------

function MiniGalleryContent({
  initialFilters: propInitialFilters,
  showSearch = true,
  showMediaType = true,
  showSort = true,
  showFilters: showFiltersProp,
  operationType: propOperationType,
  context,
  items: externalItems,
  header,
  emptyMessage = 'No assets found.',
  renderItemOverlay,
  renderItemActions,
  resolveAsset,
}: MiniGalleryProps) {
  const useExternalData = externalItems !== undefined;
  const showFilters = showFiltersProp ?? !useExternalData;

  // Resolve operation type: controller > prop > context
  const controller = useQuickGenerateController();
  const operationType =
    controller.operationType ?? propOperationType ?? context?.operationType;

  // Merge initial filters from props and context
  const mergedInitialFilters = useMemo<AssetFilters>(
    () => ({
      sort: 'new' as const,
      ...context?.initialFilters,
      ...propInitialFilters,
    }),
    // Only compute once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Internal filter state (only used when fetching via useAssets)
  const [filters, setFilters] = useState<AssetFilters>(mergedInitialFilters);

  const handleFiltersChange = useCallback((updates: Partial<AssetFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  // Data via useAssets — only active when no external items provided
  const assetsHook = useAssets(useExternalData ? undefined : {
    limit: 30,
    filters,
  });

  const displayItems = useExternalData ? externalItems : assetsHook.items;
  const loading = useExternalData ? false : assetsHook.loading;
  const error = useExternalData ? null : assetsHook.error;
  const hasMore = useExternalData ? false : assetsHook.hasMore;
  const loadMore = assetsHook.loadMore;

  // Infinite scroll via intersection observer (only for useAssets mode)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (useExternalData) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [useExternalData, hasMore, loading, loadMore]);

  // Generation scope stores
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

  const acceptsInput = OPERATION_METADATA[operationType]?.acceptsInput ?? [];
  const canAcceptAssets = acceptsInput.length > 0;
  const openViewer = useAssetViewerStore((s) => s.openViewer);

  // Track which assets are currently being resolved
  const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set());
  const [resolveError, setResolveError] = useState<string | null>(null);

  /** Resolve an asset (fetch full data if `resolveAsset` is provided). */
  const resolve = useCallback(
    async (asset: AssetModel): Promise<AssetModel | null> => {
      if (!resolveAsset) return asset;
      const id = asset.id;
      setResolvingIds((prev) => new Set(prev).add(id));
      setResolveError(null);
      try {
        return await resolveAsset(asset);
      } catch (e: unknown) {
        setResolveError(e instanceof Error ? e.message : 'Failed to load asset');
        return null;
      } finally {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [resolveAsset],
  );

  const openAssetInViewer = useCallback(
    (asset: AssetModel) => {
      const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(asset);
      openViewer({
        id: asset.id,
        name: asset.description || `Asset ${asset.id}`,
        type: asset.mediaType === 'video' ? 'video' : 'image',
        url: thumbnailUrl || previewUrl || mainUrl || '',
        fullUrl: mainUrl,
        source: 'gallery',
      });
    },
    [openViewer],
  );

  const handleSelect = useCallback(
    async (asset: AssetModel) => {
      if (resolvingIds.has(asset.id)) return;
      const resolved = await resolve(asset);
      if (!resolved) return;

      if (canAcceptAssets && acceptsInput.includes(resolved.mediaType)) {
        addInput({ asset: resolved, operationType });
      } else {
        openAssetInViewer(resolved);
      }
    },
    [resolve, resolvingIds, addInput, operationType, canAcceptAssets, acceptsInput, openAssetInViewer],
  );

  const handleOpenViewer = useCallback(
    async (asset: AssetModel) => {
      if (resolvingIds.has(asset.id)) return;
      const resolved = await resolve(asset);
      if (!resolved) return;
      openAssetInViewer(resolved);
    },
    [resolve, resolvingIds, openAssetInViewer],
  );

  const handleSelectSlot = useCallback(
    async (asset: AssetModel, slotIndex: number) => {
      if (resolvingIds.has(asset.id)) return;
      const resolved = await resolve(asset);
      if (!resolved) return;
      addInput({ asset: resolved, operationType, slotIndex });
    },
    [resolve, resolvingIds, addInput, operationType],
  );

  const displayError = error || resolveError;

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Filter bar */}
      {showFilters && (
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
          <GalleryFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            showSearch={showSearch}
            showMediaType={showMediaType}
            showSort={showSort}
            layout="horizontal"
            className="text-xs"
          />
        </div>
      )}

      {/* Custom header */}
      {header}

      {/* Error banner */}
      {displayError && (
        <div className="px-3 py-1 text-[10px] text-red-500 bg-red-50 dark:bg-red-900/20">
          {displayError}
        </div>
      )}

      {/* Scrollable grid */}
      <div className="flex-1 overflow-auto p-3">
        {displayItems.length === 0 && !loading && (
          <div className="text-xs text-neutral-500 italic text-center py-4">
            {emptyMessage}
          </div>
        )}

        {displayItems.length === 0 && loading && (
          <div className="text-xs text-neutral-500 italic text-center py-4">
            Loading...
          </div>
        )}

        {displayItems.length > 0 && (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
          >
            {displayItems.map((asset) => (
              <MiniGalleryItem
                key={asset.id}
                asset={asset}
                isResolving={resolvingIds.has(asset.id)}
                operationType={operationType}
                onSelect={() => handleSelect(asset)}
                onSelectSlot={handleSelectSlot}
                onOpenViewer={() => handleOpenViewer(asset)}
                inputScopeId={scopeId}
                maxSlots={maxSlots}
                isReplaceMode={isReplaceMode}
                extraOverlay={renderItemOverlay?.(asset)}
                renderActions={renderItemActions}
              />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel (useAssets mode only) */}
        {!useExternalData && <div ref={sentinelRef} className="h-4" />}

        {loading && displayItems.length > 0 && (
          <div className="text-[10px] text-neutral-400 text-center py-2">
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniGallery — public component, wraps with GenerationScopeProvider
// ---------------------------------------------------------------------------

export function MiniGallery(props: MiniGalleryProps) {
  const scopeId =
    props.generationScopeId ?? props.context?.generationScopeId ?? undefined;

  if (!scopeId) {
    return <MiniGalleryContent {...props} />;
  }

  return (
    <GenerationScopeProvider scopeId={scopeId} label="Generation Settings">
      <MiniGalleryContent {...props} />
    </GenerationScopeProvider>
  );
}
