import { ActionHintBadge, IconButton, useHoverExpand } from '@pixsim7/shared.ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';
import { panelSelectors } from '@lib/plugins/catalogSelectors';
import type { OverlayWidget } from '@lib/ui/overlay';
import type { OverlayContextId } from '@lib/widgets';


import type { AssetModel } from '@features/assets';
import { useAssetViewerStore, selectIsViewerOpen, toViewerAsset, toViewerAssets } from '@features/assets';
import { PaginationStrip } from '@features/assets/components/shared';
import { CompactAssetCard } from '@features/assets/components/shared';
import { GalleryFilters } from '@features/assets/components/shared/GalleryFilters';
import type { AssetFilters } from '@features/assets/hooks/useAssets';
import { useAssets } from '@features/assets/hooks/useAssets';
import { useViewerScopeSync } from '@features/assets/hooks/useAssetViewer';
import { hydrateAssetModel, isStubAssetModel } from '@features/assets/lib/hydrateAssetModel';
import { GenerationScopeProvider, useGenerationScopeStores } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { useOperationSpec, useProviderIdForModel } from '@features/providers';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { SlotPickerGrid, resolveMaxSlotsFromSpecs, resolveMaxSlotsForModel } from '@/components/media/SlotPicker';
import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA, isMultiAssetOperation } from '@/types/operations';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** A switchable filter preset shown in the variant dropdown. */
export interface GalleryVariant {
  id: string;
  label: string;
  icon?: string;
  filters: AssetFilters;
  /** Optional group label for dropdown optgroup. */
  group?: string;
}

/** Sentinel prefix for peer-panel entries in the variant dropdown. */
const PEER_PANEL_PREFIX = '_panel:';

/** Discover peer gallery panels from the registry via the 'asset-gallery' tag. */
function discoverPeerPanels(excludeId?: string): GalleryVariant[] {
  return panelSelectors
    .getAll()
    .filter((p) => p.tags?.includes('asset-gallery') && p.id !== excludeId)
    .map((p) => ({
      id: `${PEER_PANEL_PREFIX}${p.id}`,
      label: p.title,
      icon: typeof p.icon === 'string' ? p.icon : 'layout',
      filters: {},
      group: 'Panels',
    }));
}

export interface MiniGalleryProps {
  /** Initial filter state (user can change via UI) */
  initialFilters?: AssetFilters;
  /** When true, re-apply `initialFilters`/`context.initialFilters` when they change. */
  syncInitialFilters?: boolean;
  /** Optional cap on total results shown in this gallery (across pages). */
  maxItems?: number;

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

  // --- Variant switching ---
  /** Available filter presets the user can switch between (e.g. "More from" options). */
  variants?: GalleryVariant[];
  /** Which variant is initially active (by id). */
  activeVariantId?: string;
  /** Panel definition ID (used to exclude self from peer panel discovery). */
  panelId?: string;
  /** Floating panel instance ID (injected by FloatingPanelsManager for self-replace). */
  _floatingPanelId?: string;

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
   *  Receives the asset and the default action buttons as `defaultActions`.
   *  Return `null` to suppress hover actions entirely. */
  renderItemActions?: (asset: AssetModel, defaultActions: ReactNode) => ReactNode | null;

  /** Extra overlay widgets to add per card (e.g. pin badge, remove badge). */
  renderItemWidgets?: (asset: AssetModel) => OverlayWidget[] | undefined;

  // --- Pagination ---
  /** 'infinite' (default) uses intersection observer, 'page' shows page controls. */
  paginationMode?: 'infinite' | 'page';
  /** Items per page when paginationMode='page'. Default 20. */
  pageSize?: number;

  // --- Hover action suppression ---
  /** When true, skip hover actions entirely (zap + viewer buttons). Useful
   *  when overlay widgets or generation button groups handle interactions. */
  suppressHoverActions?: boolean;

  // --- Custom selection ---
  /** When provided, both card clicks and zap buttons call this callback
   *  instead of the default addInput / openViewer behavior.
   *  Useful for picker-style usage (e.g. mask selection). */
  onItemSelect?: (asset: AssetModel) => void;

  /** Called when the user hovers over/leaves a gallery item.
   *  `asset` is the hovered item, or `null` on mouse leave. */
  onItemHover?: (asset: AssetModel | null) => void;

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
  suppressHoverActions?: boolean;
  renderActions?: (asset: AssetModel, defaultActions: ReactNode) => ReactNode | null;
  extraWidgets?: OverlayWidget[];
  overlayContext?: OverlayContextId;
  onHover?: (asset: AssetModel | null) => void;
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
  suppressHoverActions,
  renderActions,
  extraWidgets,
  overlayContext,
  onHover,
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
          <div className="cq-btn-sm cq-inset-br absolute rounded-full bg-black/70 flex items-center justify-center pointer-events-none">
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

  const hoverActions = useMemo(() => {
    if (suppressHoverActions) return null;
    const content = renderActions ? renderActions(asset, defaultActions) : defaultActions;
    if (content === null) return null;
    return (
      <div className="flex items-center gap-1">
        {content}
      </div>
    );
  }, [suppressHoverActions, asset, defaultActions, renderActions]);

  const handleMouseEnter = useCallback(() => onHover?.(asset), [onHover, asset]);
  const handleMouseLeave = useCallback(() => onHover?.(null), [onHover]);

  return (
    <>
      <div onMouseEnter={onHover ? handleMouseEnter : undefined} onMouseLeave={onHover ? handleMouseLeave : undefined}>
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
          extraWidgets={extraWidgets}
          overlayContext={overlayContext ?? (hoverActions === null ? 'gallery' : undefined)}
        />
      </div>

      {showSlotPicker && slotPickerExpanded && slotPickerPos && createPortal(
        <div
          className="fixed pb-4 z-popover"
          style={{
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

const DEFAULT_CARD_SIZE = 100;
const MIN_CARD_SIZE = 60;
const MAX_CARD_SIZE = 200;

function MiniGalleryContent({
  initialFilters: propInitialFilters,
  syncInitialFilters = false,
  maxItems,
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
  renderItemWidgets,
  onItemSelect,
  onItemHover,
  suppressHoverActions,
  paginationMode = 'infinite',
  pageSize = 20,
  resolveAsset,
  variants,
  activeVariantId,
  panelId,
  _floatingPanelId,
}: MiniGalleryProps) {
  const useExternalData = externalItems !== undefined;
  const showFilters = showFiltersProp ?? !useExternalData;
  const usePaging = paginationMode === 'page';
  const resultCap =
    typeof maxItems === 'number' && Number.isFinite(maxItems) && maxItems > 0
      ? Math.floor(maxItems)
      : undefined;
  const [cardSize, setCardSize] = useState(DEFAULT_CARD_SIZE);

  // Variant switching — merge passed variants with dynamically discovered peer panels
  const allVariants = useMemo(() => {
    const contextVariants = (variants ?? []).map((v) => v.group ? v : { ...v, group: 'Context' });
    const peerPanels = discoverPeerPanels(panelId ?? 'mini-gallery');
    return [...contextVariants, ...peerPanels];
  }, [variants, panelId]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(activeVariantId);
  const activeVariant = allVariants.find((v) => v.id === selectedVariantId);
  const variantFilters = activeVariant?.filters;

  // Resolve operation type: controller > prop > context
  const controller = useQuickGenerateController();
  const operationType =
    controller.operationType ?? propOperationType ?? context?.operationType;

  // Merge initial filters from props and context (default behavior is still
  // "seed once", but callers can opt into syncing via `syncInitialFilters`).
  const mergedInitialFilters = useMemo<AssetFilters>(
    () => ({
      sort: 'new' as const,
      ...context?.initialFilters,
      ...propInitialFilters,
      ...variantFilters,
    }),
    [context?.initialFilters, propInitialFilters, variantFilters],
  );
  const mergedInitialFiltersKey = useMemo(
    () => JSON.stringify(mergedInitialFilters ?? {}),
    [mergedInitialFilters],
  );

  // Internal filter state (only used when fetching via useAssets)
  const [filters, setFilters] = useState<AssetFilters>(mergedInitialFilters);

  // Reset filters when variant changes
  useEffect(() => {
    if (variantFilters) {
      setFilters((prev) => ({ ...prev, ...variantFilters }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariantId]);

  useEffect(() => {
    if (!syncInitialFilters || useExternalData) return;
    setFilters(mergedInitialFilters);
  }, [syncInitialFilters, useExternalData, mergedInitialFiltersKey, mergedInitialFilters]);

  const handleFiltersChange = useCallback((updates: Partial<AssetFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  // Data via useAssets — only active when no external items provided
  const assetsHook = useAssets(useExternalData ? undefined : {
    limit: usePaging ? pageSize : 30,
    filters,
    paginationMode: usePaging ? 'page' : 'infinite',
  });

  // Client-side paging for external items
  const [clientPage, setClientPage] = useState(1);
  const clientTotalPages = useExternalData
    ? Math.max(1, Math.ceil((externalItems?.length ?? 0) / pageSize))
    : 1;

  // Reset client page when external items change significantly
  useEffect(() => {
    if (useExternalData) setClientPage(1);
  }, [useExternalData, externalItems?.length]);

  const allItems = useExternalData ? externalItems : assetsHook.items;
  const loading = useExternalData ? false : assetsHook.loading;
  const error = useExternalData ? null : assetsHook.error;
  const rawHasMore = useExternalData ? false : assetsHook.hasMore;
  const loadMore = assetsHook.loadMore;

  // Pagination state (unified for both data sources)
  const currentPage = useExternalData ? clientPage : assetsHook.currentPage;
  const rawTotalPages = useExternalData ? clientTotalPages : assetsHook.totalPages;
  const goToPage = useExternalData ? setClientPage : assetsHook.goToPage;
  const cappedTotalPages = resultCap && usePaging
    ? Math.max(1, Math.ceil(resultCap / pageSize))
    : null;
  const totalPages = cappedTotalPages
    ? Math.min(rawTotalPages, cappedTotalPages)
    : rawTotalPages;
  const pageStartIndex = usePaging ? (currentPage - 1) * pageSize : 0;
  const pageCapRemaining = resultCap !== undefined ? resultCap - pageStartIndex : undefined;
  const baseDisplayItems = usePaging && useExternalData
    ? allItems.slice(pageStartIndex, pageStartIndex + pageSize)
    : allItems;
  const displayItems =
    pageCapRemaining === undefined
      ? baseDisplayItems
      : pageCapRemaining <= 0
        ? []
        : baseDisplayItems.slice(0, pageCapRemaining);
  const hasMore = resultCap !== undefined && usePaging
    ? rawHasMore && currentPage < (cappedTotalPages ?? totalPages)
    : resultCap !== undefined && !usePaging
      ? rawHasMore && allItems.length < resultCap
      : rawHasMore;

  // Infinite scroll via intersection observer (only for useAssets mode + infinite)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (useExternalData || usePaging) return;
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
  }, [useExternalData, usePaging, hasMore, loading, loadMore]);

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
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);

  // Register mini-gallery scope for viewer navigation (use allItems for full navigation)
  const viewerItems = useMemo(() => toViewerAssets(allItems), [allItems]);
  const miniScopeLabel = context?.sourceLabel
    ? `${context.sourceLabel} (${allItems.length})`
    : `Gallery (${allItems.length})`;
  useViewerScopeSync('mini-gallery', miniScopeLabel, viewerItems, isViewerOpen);

  // Track which assets are currently being resolved
  const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set());
  const [resolveError, setResolveError] = useState<string | null>(null);
  const hydratedAssetCacheRef = useRef<Map<number, AssetModel>>(new Map());

  /** Resolve an asset (fetch full data if `resolveAsset` is provided). */
  const resolve = useCallback(
    async (asset: AssetModel): Promise<AssetModel | null> => {
      if (!resolveAsset && !isStubAssetModel(asset)) {
        return asset;
      }

      const id = asset.id;
      setResolvingIds((prev) => new Set(prev).add(id));
      setResolveError(null);
      try {
        const resolved = resolveAsset ? await resolveAsset(asset) : asset;
        return await hydrateAssetModel(resolved, {
          cache: hydratedAssetCacheRef.current,
          onError: (e) => {
            setResolveError(e instanceof Error ? e.message : 'Failed to load asset');
          },
        });
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
      const viewerAsset = toViewerAsset(asset);
      const viewerList = allItems.length > 0 ? toViewerAssets(allItems) : undefined;
      openViewer(viewerAsset, viewerList, 'mini-gallery');
    },
    [openViewer, allItems],
  );

  const handleSelect = useCallback(
    async (asset: AssetModel) => {
      if (resolvingIds.has(asset.id)) return;
      const resolved = await resolve(asset);
      if (!resolved) return;

      if (onItemSelect) {
        onItemSelect(resolved);
        return;
      }

      if (canAcceptAssets && acceptsInput.includes(resolved.mediaType)) {
        addInput({ asset: resolved, operationType });
      } else {
        openAssetInViewer(resolved);
      }
    },
    [resolve, resolvingIds, onItemSelect, addInput, operationType, canAcceptAssets, acceptsInput, openAssetInViewer],
  );

  const handleOpenViewer = useCallback(
    async (asset: AssetModel) => {
      if (resolvingIds.has(asset.id)) return;
      const resolved = await resolve(asset);
      if (!resolved) return;

      if (onItemSelect) {
        onItemSelect(resolved);
        return;
      }

      openAssetInViewer(resolved);
    },
    [resolve, resolvingIds, onItemSelect, openAssetInViewer],
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

  // Group variants by their group label for optgroup rendering
  const variantGroups = useMemo(() => {
    const groups: { label: string; items: GalleryVariant[] }[] = [];
    const seen = new Map<string, GalleryVariant[]>();
    for (const v of allVariants) {
      const g = v.group ?? '';
      let arr = seen.get(g);
      if (!arr) { arr = []; seen.set(g, arr); groups.push({ label: g, items: arr }); }
      arr.push(v);
    }
    return groups;
  }, [allVariants]);

  const showVariantSwitcher = allVariants.length > 1;

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Variant switcher + Filter bar */}
      {(showFilters || showVariantSwitcher) && (
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex flex-col gap-1.5">
          {showVariantSwitcher && (
            <div className="flex items-center gap-1.5">
              <Icon name="layers" size={11} className="text-neutral-400 shrink-0" />
              <select
                value={selectedVariantId ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith(PEER_PANEL_PREFIX)) {
                    const peerId = val.slice(PEER_PANEL_PREFIX.length);
                    if (_floatingPanelId) {
                      // Swap in-place — keeps position, size, z-index
                      useWorkspaceStore.getState().replaceFloatingPanel(_floatingPanelId, peerId);
                    } else {
                      // Fallback: not in a floating panel, open new
                      useWorkspaceStore.getState().openFloatingPanel(peerId, { width: 620, height: 520 });
                    }
                  } else {
                    setSelectedVariantId(val || undefined);
                  }
                }}
                className="flex-1 min-w-0 text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-0.5 text-neutral-700 dark:text-neutral-300 truncate"
              >
                {!selectedVariantId && (
                  <option value="">{context?.sourceLabel ?? 'Select view...'}</option>
                )}
                {variantGroups.map((group) =>
                  group.label ? (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map((v) => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </optgroup>
                  ) : (
                    group.items.map((v) => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))
                  ),
                )}
              </select>
            </div>
          )}
          {showFilters && (
            <GalleryFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              showSearch={showSearch}
              showMediaType={showMediaType}
              showSort={showSort}
              layout="horizontal"
              className="text-xs"
            />
          )}
        </div>
      )}

      {/* Custom header */}
      {header}

      {/* Grid size slider + error banner */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-neutral-200 dark:border-neutral-700">
        <Icon name="grid" size={12} className="text-neutral-400 shrink-0" />
        <input
          type="range"
          min={MIN_CARD_SIZE}
          max={MAX_CARD_SIZE}
          value={cardSize}
          onChange={(e) => setCardSize(Number(e.target.value))}
          className="flex-1 h-1 accent-accent cursor-pointer"
          title={`Card size: ${cardSize}px`}
        />
      </div>

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
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}
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
                suppressHoverActions={suppressHoverActions}
                renderActions={renderItemActions}
                extraWidgets={renderItemWidgets?.(asset)}
                onHover={onItemHover}
              />
            ))}
          </div>
        )}

        {/* Pagination controls (page mode) */}
        {usePaging && (totalPages > 1 || hasMore) && (
          <div className="flex justify-center pt-3 pb-1">
            <PaginationStrip
              currentPage={currentPage}
              totalPages={totalPages}
              hasMore={useExternalData ? undefined : hasMore}
              loading={loading}
              onPageChange={goToPage}
            />
          </div>
        )}

        {/* Infinite scroll sentinel (infinite mode, useAssets only) */}
        {!usePaging && !useExternalData && <div ref={sentinelRef} className="h-4" />}

        {!usePaging && loading && displayItems.length > 0 && (
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
