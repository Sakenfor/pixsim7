import { Button, useToastStore } from '@pixsim7/shared.ui';
import { type ComponentProps, type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';


import { listAssetGroups } from '@lib/api/assets';
import type { AssetGroupListResponse, AssetGroupRequest } from '@lib/api/assets';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { Icon, type IconName } from '@lib/icons';
import { IconPicker } from '@lib/ui/forms';
import { getMediaCardPreset } from '@lib/ui/overlay';

import { FilterChip, useFilterChipState } from '@features/gallery';
import type { GalleryToolContext, GalleryAsset } from '@features/gallery/lib/core/types';
import { galleryToolSelectors } from '@features/gallery/lib/registry';
import {
  usePanelConfigStore,
  type GalleryClusterBy,
  type GalleryGroupBy,
  type GalleryGroupMode,
  type GalleryGroupMultiLayout,
  type GalleryGroupView,
  type GalleryGroupScope,
  type GalleryPanelSettings,
  type GalleryGroupBySelection,
} from '@features/panels';
import { useProviders } from '@features/providers';
import { openWorkspacePanel, useWorkspaceStore } from '@features/workspace';

import { MasonryGrid } from '@/components/layout/MasonryGrid';
import { MediaCard, type MediaCardActions } from '@/components/media/MediaCard';

import type { AssetFilters, AssetModel } from '../hooks/useAssets';
import { useAssetsController } from '../hooks/useAssetsController';
import { useAssetViewer, useViewerScopeSync } from '../hooks/useAssetViewer';
import { buildActiveTargetWidgets, selectActiveTargetSets } from '../lib/activeTargetWidgets';
import { assetEvents } from '../lib/assetEvents';
import { buildRemoteAssetActions } from '../lib/buildRemoteAssetActions';
import { clusterAssets, isCluster } from '../lib/clusterHelpers';
import { toggleFavoriteTag } from '../lib/favoriteTag';
import { GROUP_BY_LABELS, normalizeGroupBySelection } from '../lib/groupBy';
import { normalizeGroupScopeSelection } from '../lib/groupScope';
import { normalizeTagInput } from '../lib/quickTag';
import { buildAssetSearchRequest } from '../lib/searchParams';
import { fromAssetResponses, toViewerAssets } from '../models/asset';
import { useAssetSets, useAssetSetStore, type ManualAssetSet } from '../stores/assetSetStore';
import { useAssetViewerStore, selectIsViewerOpen } from '../stores/assetViewerStore';
import { useFilterPresetStore } from '../stores/filterPresetStore';
import { useGalleryApplyTargetStore } from '../stores/galleryApplyTargetStore';

import { ClusterCard } from './ClusterCard';
import { CuratorSurfaceContent } from './CuratorGallerySurface';
import { DebugSurfaceContent } from './DebugGallerySurface';
import { DynamicFilters, ChipContextMenu } from './DynamicFilters';
import { FilterPresetBar } from './FilterPresetBar';
import { GroupBreadcrumb } from './GroupBreadcrumb';
import { GroupFolderTile, GroupListRow } from './GroupCards';
import {
  parsePageParam,
  parseGroupParams,
  formatGroupLabel,
  areScopesEqual,
  areGroupByStacksEqual,
  sortGroups,
  type GroupSortKey,
  GROUP_PREVIEW_LIMIT,
  GROUP_PAGE_SIZE,
  DEFAULT_GROUP_BY_STACK,
  DEFAULT_GROUP_VIEW,
  DEFAULT_GROUP_SCOPE,
  type AssetGroup,
  type GroupPathEntry,
} from './groupHelpers';
import { GroupingMenuDropdown } from './GroupingMenuDropdown';
import { ParallelGroupSection, type ParallelAxisData } from './ParallelGroupSection';
import { ReviewSurfaceContent } from './ReviewGallerySurface';
import { BottomPagination } from './shared/BottomPagination';
import { GalleryToolsStrip } from './shared/GalleryToolsStrip';
import { PaginationStrip } from './shared/PaginationStrip';
import { SignalTriageContent } from './SignalTriageGallerySurface';


// ---------------------------------------------------------------------------
// AssetSetChip — single chip for filter + target management per set
// ---------------------------------------------------------------------------

function AssetSetChip({
  chipKey,
  chipState,
  manualSets,
  activeSetIds,
  filterSetIds,
  onToggleFilter,
  onToggleTarget,
  onBrowseSet,
  onSetIcon,
  selectedCount,
  onAddSelected,
  onCreateSet,
  onRenameSet,
  onDeleteSet,
}: {
  chipKey: string;
  chipState: ReturnType<typeof useFilterChipState>;
  manualSets: ManualAssetSet[];
  activeSetIds: number[];
  filterSetIds: number[];
  onToggleFilter: (setId: number) => void;
  onToggleTarget: (setId: number) => void;
  onBrowseSet: (set: ManualAssetSet) => void;
  onSetIcon: (setId: number, icon: string | undefined) => void;
  selectedCount: number;
  onAddSelected: () => void;
  onCreateSet: () => Promise<number | void> | number | void;
  onRenameSet: (id: number, name: string) => void;
  onDeleteSet: (id: number) => void;
}) {
  const [rowMenu, setRowMenu] = useState<{ set: ManualAssetSet; x: number; y: number } | null>(null);
  const [iconPickerId, setIconPickerId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startEdit = useCallback((s: ManualAssetSet) => {
    setEditingId(s.id);
    setDraftName(s.name);
  }, []);

  const commitEdit = useCallback(() => {
    if (editingId) {
      const trimmed = draftName.trim();
      if (trimmed.length > 0) onRenameSet(editingId, trimmed);
    }
    setEditingId(null);
  }, [editingId, draftName, onRenameSet]);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleCreate = useCallback(async () => {
    const newId = await onCreateSet();
    if (typeof newId === 'number') {
      setEditingId(newId);
      setDraftName('New Set');
    }
  }, [onCreateSet]);

  const handleDelete = useCallback(
    (s: ManualAssetSet) => {
      const msg = s.assetIds.length > 0
        ? `Delete set "${s.name}" (${s.assetIds.length} assets)? The assets themselves are not deleted.`
        : `Delete set "${s.name}"?`;
      if (window.confirm(msg)) onDeleteSet(s.id);
    },
    [onDeleteSet],
  );

  if (manualSets.length === 0) return null;
  const activeTargetSets = manualSets.filter((s) => activeSetIds.includes(s.id));
  const activeCount = filterSetIds.length + activeTargetSets.length;
  return (
    <FilterChip
      chipKey={chipKey}
      label="Sets"
      icon="layers"
      count={activeCount}
      isOpen={chipState.openFilters.has(chipKey)}
      isHovered={chipState.hoveredKey === chipKey}
      onToggleOpen={() => chipState.toggleOpen(chipKey)}
      onClose={() => chipState.closeChip(chipKey)}
      onMouseEnter={() => chipState.openHover(chipKey)}
      onMouseLeave={() => chipState.closeHover(chipKey)}
      popoverMode="portal"
      wide
    >
      <div className="flex flex-col gap-0.5 p-1">
        {/* Column headers */}
        <div className="flex items-center gap-2 px-1.5 pb-0.5 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
          <span className="w-4 flex items-center justify-center flex-shrink-0" title="Filter: show only assets in this set"><Icon name="eye" size={11} /></span>
          <span className="w-4 text-center flex-shrink-0" title="Target: add assets to this set">T</span>
          <span className="flex-1">Set</span>
          <button
            type="button"
            onClick={() => void handleCreate()}
            title="Create new set"
            className="flex items-center justify-center w-4 h-4 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          >
            <Icon name="plus" size={11} />
          </button>
        </div>
        {manualSets.map((s) => {
          const isFiltered = filterSetIds.includes(s.id);
          const isTarget = activeSetIds.includes(s.id);
          const isEditing = editingId === s.id;
          return (
            <div
              key={s.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setRowMenu({ set: s, x: e.clientX, y: e.clientY });
              }}
              className={`group/row flex items-center gap-2 px-1.5 py-1 text-sm rounded transition-colors ${
                isTarget
                  ? 'bg-emerald-500/5'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              {/* Filter toggle (eye = showing only this set) */}
              <button
                type="button"
                onClick={() => onToggleFilter(s.id)}
                title={isFiltered ? 'Stop filtering by this set' : 'Filter gallery to this set'}
                className={`flex-shrink-0 w-4 h-4 flex items-center justify-center transition-colors ${
                  isFiltered
                    ? 'text-blue-500'
                    : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
                }`}
              >
                <Icon name={isFiltered ? 'eye' : 'eyeOff'} size={13} />
              </button>
              {/* Target toggle (multi-select, capped) */}
              <button
                type="button"
                onClick={() => onToggleTarget(s.id)}
                title={isTarget ? 'Remove from add targets' : 'Add as add target'}
                className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
              >
                <span className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  isTarget
                    ? 'bg-emerald-500 ring-2 ring-emerald-500/30'
                    : 'bg-neutral-300 dark:bg-neutral-600 hover:bg-emerald-400/60'
                }`} />
              </button>
              {/* Icon swatch — shows the set's glyph/color; click to change icon */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIconPickerId((cur) => (cur === s.id ? null : s.id));
                  }}
                  title="Change icon"
                  className="w-5 h-5 rounded flex items-center justify-center hover:ring-2 ring-accent/40"
                  style={{ backgroundColor: s.color || '#3B82F6' }}
                >
                  <Icon name={(s.icon as IconName) || 'layers'} size={11} color="#fff" />
                </button>
                {iconPickerId === s.id && (
                  <div className="absolute z-30 top-6 left-0 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg">
                    <IconPicker
                      value={s.icon}
                      onSelect={(icon) => {
                        onSetIcon(s.id, icon);
                        setIconPickerId(null);
                      }}
                    />
                  </div>
                )}
              </div>
              {/* Set name — inline editable */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                  }}
                  className="flex-1 min-w-0 px-1 py-0.5 text-sm bg-white dark:bg-neutral-900 border border-accent rounded outline-none text-neutral-800 dark:text-neutral-100"
                />
              ) : (
                <span
                  onDoubleClick={() => startEdit(s)}
                  title="Double-click to rename"
                  className={`flex-1 truncate cursor-text select-none ${
                    isTarget ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  {s.name}
                </span>
              )}
              {/* Hover actions */}
              {!isEditing && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    title="Rename"
                    className="flex items-center justify-center w-4 h-4 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  >
                    <Icon name="edit" size={10} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (s.assetIds.length === 0) return;
                      onBrowseSet(s);
                      chipState.closeChip(chipKey);
                    }}
                    disabled={s.assetIds.length === 0}
                    title={s.assetIds.length > 0 ? 'Edit set in mini gallery' : 'Set is empty'}
                    className="flex items-center justify-center w-4 h-4 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                  >
                    <Icon name="image" size={10} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s)}
                    title="Delete set"
                    className="flex items-center justify-center w-4 h-4 rounded text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Icon name="trash" size={10} />
                  </button>
                </div>
              )}
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums w-6 text-right">
                {s.assetIds.length}
              </span>
            </div>
          );
        })}
        {/* Add selected action */}
        {selectedCount > 0 && activeTargetSets.length > 0 && (
          <>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            <button
              type="button"
              onClick={() => { onAddSelected(); chipState.closeChip(chipKey); }}
              className="flex items-center gap-1.5 px-1.5 py-1 text-sm text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-500/10 transition-colors"
            >
              <Icon name="plus" size={12} />
              <span>
                Add {selectedCount} to{' '}
                {activeTargetSets.length === 1
                  ? activeTargetSets[0].name
                  : `${activeTargetSets.length} sets`}
              </span>
            </button>
          </>
        )}
        {/* Manage link */}
        <div className="border-t border-neutral-200 dark:border-neutral-700 mt-1 pt-1">
          <button
            type="button"
            onClick={() => {
              openWorkspacePanel('asset-sets');
              chipState.closeChip(chipKey);
            }}
            className="flex items-center gap-1.5 px-1.5 py-1 text-xs text-neutral-500 dark:text-neutral-400 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors w-full"
          >
            <Icon name="settings" size={11} />
            <span>Manage sets…</span>
          </button>
        </div>
      </div>
      {rowMenu && createPortal(
        <ChipContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          onBrowse={() => {
            onBrowseSet(rowMenu.set);
            setRowMenu(null);
            chipState.closeChip(chipKey);
          }}
          onClose={() => setRowMenu(null)}
        />,
        document.body,
      )}
    </FilterChip>
  );
}

// ---------------------------------------------------------------------------
// RemoteGalleryCard — memoized so a single asset-update event (which replaces
// only the changed asset's ref in the list) re-renders just that one card
// rather than every card in the grid. That per-card churn was a major fuel
// source for the asset-update render storms. All props except `asset` /
// `isSelected` must stay referentially stable across update bursts (callbacks
// via useCallback, providers from useState, a selection stabilized on the
// selection set, etc.) — otherwise the memo silently stops working.
// ---------------------------------------------------------------------------

interface RemoteGalleryCardProps {
  asset: AssetModel;
  isSelected: boolean;
  providers: { id: string; name: string }[];
  filterProviderId: string | undefined;
  activeSets: ManualAssetSet[];
  contextMenuSelection: ComponentProps<typeof MediaCard>['contextMenuSelection'];
  overlayConfig: ComponentProps<typeof MediaCard>['overlayConfig'];
  overlayPresetId?: string;
  getAssetActions: (asset: AssetModel) => MediaCardActions;
  reuploadAsset: (asset: AssetModel, providerId: string) => Promise<void>;
  onOpenAsset: (asset: AssetModel) => void;
  onFilterByTagShortcut: (tagSlug: string) => void;
  onAddToActiveTargets: (assetId: number) => void;
  onToggleSelection: (asset: AssetModel) => void;
  onResetAssets: () => void;
}

const RemoteGalleryCard = memo(function RemoteGalleryCard({
  asset,
  isSelected,
  providers,
  filterProviderId,
  activeSets,
  contextMenuSelection,
  overlayConfig,
  overlayPresetId,
  getAssetActions,
  reuploadAsset,
  onOpenAsset,
  onFilterByTagShortcut,
  onAddToActiveTargets,
  onToggleSelection,
  onResetAssets,
}: RemoteGalleryCardProps) {
  const actions = useMemo(
    () =>
      buildRemoteAssetActions(asset, {
        baseActions: {
          ...getAssetActions(asset),
          onAddToActiveSet: activeSets.length > 0 ? onAddToActiveTargets : undefined,
        },
        providers,
        filterProviderId,
        reuploadAsset,
        refresh: onResetAssets,
      }),
    [asset, getAssetActions, activeSets, onAddToActiveTargets, providers, filterProviderId, reuploadAsset, onResetAssets],
  );

  const customWidgets = useMemo(() => {
    const widgets = buildActiveTargetWidgets(asset.id, activeSets);
    return widgets.length > 0 ? widgets : undefined;
  }, [asset, activeSets]);

  return (
    <div
      className={`relative cursor-pointer group rounded-md ${
        isSelected ? 'ring-4 ring-purple-500' : ''
      }`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelection(asset);
        }
      }}
    >
      <MediaCard
        asset={asset}
        onOpen={() => onOpenAsset(asset)}
        onFilterByTagShortcut={onFilterByTagShortcut}
        onToggleFavorite={() => toggleFavoriteTag(asset)}
        actions={actions}
        contextMenuSelection={contextMenuSelection}
        customWidgets={customWidgets}
        overlayConfig={overlayConfig}
        overlayPresetId={overlayPresetId}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------

interface RemoteGallerySourceProps {
  layout: 'masonry' | 'grid';
  cardSize: number;
  overlayPresetId?: string;
  toolbarExtra?: ReactNode;
}

export function RemoteGallerySource({ layout, cardSize, overlayPresetId, toolbarExtra }: RemoteGallerySourceProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const panelConfig = usePanelConfigStore((s) => s.panelConfigs.gallery);
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);
  const gallerySettings = (panelConfig?.settings || {}) as GalleryPanelSettings;
  const defaultGroupView = (gallerySettings.groupView ?? DEFAULT_GROUP_VIEW) as GalleryGroupView;
  const defaultGroupBy = normalizeGroupBySelection(
    (gallerySettings.groupBy ?? DEFAULT_GROUP_BY_STACK) as GalleryGroupBySelection,
  );
  const groupMode = (gallerySettings.groupMode ?? 'single') as GalleryGroupMode;
  const groupMultiLayout = (gallerySettings.groupMultiLayout ?? 'stack') as GalleryGroupMultiLayout;
  const clusterBy = (gallerySettings.clusterBy ?? 'prompt') as GalleryClusterBy;
  const defaultGroupScope = normalizeGroupScopeSelection(
    (gallerySettings.groupScope ?? DEFAULT_GROUP_SCOPE) as GalleryGroupScope,
  );
  const groupParams = useMemo(
    () =>
      parseGroupParams(location.search, {
        groupView: defaultGroupView,
        groupBy: defaultGroupBy,
        groupScope: defaultGroupScope,
      }),
    [location.search, defaultGroupView, defaultGroupBy, defaultGroupScope],
  );
  const { groupBy: groupByStack, groupView, groupScope, groupPath, groupPage } = groupParams;
  const normalizedGroupScope = useMemo(
    () => normalizeGroupScopeSelection(groupScope),
    [groupScope],
  );
  const groupPathPayload = useMemo(
    () =>
      groupPath.map((entry) => ({
        group_by: entry.groupBy,
        group_key: entry.groupKey,
      })),
    [groupPath],
  );
  const hasGrouping = groupByStack.length > 0;
  const isLeafGroup = hasGrouping && groupPath.length === groupByStack.length;
  const currentGroupBy = hasGrouping && groupPath.length < groupByStack.length
    ? groupByStack[groupPath.length]
    : null;
  const groupFilter = useMemo(() => {
    if (!hasGrouping || normalizedGroupScope.length === 0) return undefined;
    return { upload_method: normalizedGroupScope };
  }, [hasGrouping, normalizedGroupScope]);
  const { providers } = useProviders();
  const { sets: allSets, status: setsStatus } = useAssetSets();
  const manualSets = useMemo(
    () => allSets.filter((set): set is ManualAssetSet => set.kind === 'manual'),
    [allSets],
  );
  const addAssetsToSet = useAssetSetStore((s) => s.addAssetsToSet);
  const createSet = useAssetSetStore((s) => s.createSet);
  const renameSet = useAssetSetStore((s) => s.renameSet);
  const deleteSet = useAssetSetStore((s) => s.deleteSet);
  const updateSet = useAssetSetStore((s) => s.updateSet);
  const activeManualSetIds = useGalleryApplyTargetStore((s) => s.activeManualSetIds);
  const toggleActiveTarget = useGalleryApplyTargetStore((s) => s.toggleActiveTarget);
  const setActiveTargets = useGalleryApplyTargetStore((s) => s.setActiveTargets);
  const filterSetIds = useGalleryApplyTargetStore((s) => s.filterSetIds);
  const toggleFilterSet = useGalleryApplyTargetStore((s) => s.toggleFilterSet);
  const setChipState = useFilterChipState();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const browseSetInMiniGallery = useCallback(
    (set: ManualAssetSet) => {
      if (set.assetIds.length === 0) return;
      openFloatingPanel('mini-gallery', {
        context: {
          initialFilters: { asset_ids: set.assetIds },
          sourceLabel: set.name,
          suppressHoverActions: true,
        },
      });
    },
    [openFloatingPanel],
  );

  const browseFilterInMiniGallery = useCallback(
    (_filterKey: string, currentFilters: AssetFilters) => {
      openFloatingPanel('mini-gallery', {
        context: {
          initialFilters: currentFilters,
          syncInitialFilters: true,
          sourceLabel: 'Filtered assets',
          suppressHoverActions: true,
        },
      });
    },
    [openFloatingPanel],
  );

  const groupSearchOverrides = useMemo(() => {
    // Build union of asset IDs from checked filter sets
    let asset_ids: number[] | undefined;
    if (filterSetIds.length > 0) {
      const ids = new Set<number>();
      for (const setId of filterSetIds) {
        const s = allSets.find((ms): ms is ManualAssetSet => ms.kind === 'manual' && ms.id === setId);
        if (s) for (const id of s.assetIds) ids.add(id);
      }
      // Send even if empty — checking an empty set should show nothing.
      // Use [-1] sentinel so the backend IN clause matches nothing.
      asset_ids = ids.size > 0 ? [...ids] : [-1];
    }

    const groupPart = isLeafGroup ? { group_path: groupPathPayload, group_filter: groupFilter } : {};
    const idsPart = asset_ids ? { asset_ids } : {};
    const merged = { ...groupPart, ...idsPart };
    return Object.keys(merged).length > 0 ? merged : undefined;
  }, [groupFilter, groupPathPayload, isLeafGroup, filterSetIds, allSets]);
  const initialPageRef = useRef(parsePageParam(location.search));
  const controller = useAssetsController({
    initialPage: initialPageRef.current,
    preservePageOnFilterChange: true,
    requestOverrides: groupSearchOverrides,
  });
  const { openGalleryAsset } = useAssetViewer({ source: 'gallery' });
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);

  // Derive viewer assets and scope label for navigation scope sync
  const viewerAssets = useMemo(() => toViewerAssets(controller.assets), [controller.assets]);
  const hasActiveFilters = useMemo(() => {
    const f = controller.filters;
    return !!(
      f.q ||
      f.tag ||
      f.provider_id ||
      f.media_type ||
      f.upload_method
    );
  }, [controller.filters]);
  const scopeLabel = isLeafGroup
    ? `Gallery: ${groupPath[groupPath.length - 1]?.groupKey ?? 'group'} (${controller.assets.length})`
    : hasActiveFilters
      ? `Gallery: filtered (${controller.assets.length})`
      : `Gallery (${controller.assets.length})`;

  useViewerScopeSync('gallery', scopeLabel, viewerAssets, isViewerOpen);

  const [groupData, setGroupData] = useState<AssetGroupListResponse | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [groupSort, setGroupSort] = useState<GroupSortKey>('newest');

  // Layout settings (gaps)
  const [layoutSettings] = useState({ rowGap: 16, columnGap: 16 });
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const activeSets = useMemo(
    () => selectActiveTargetSets(allSets, activeManualSetIds),
    [allSets, activeManualSetIds],
  );

  // Get overlay configuration from preset
  const overlayConfig = useMemo(() => {
    if (!overlayPresetId) return undefined;
    const preset = getMediaCardPreset(overlayPresetId);
    return preset?.configuration;
  }, [overlayPresetId]);

  // Collapse tool when all assets are deselected
  useEffect(() => {
    if (controller.selectedAssetIds.size === 0) {
      setExpandedToolId(null);
    }
  }, [controller.selectedAssetIds.size]);

  useEffect(() => {
    // Drop any active-target ids that no longer resolve to a manual set — but
    // only once sets have actually loaded. Sets hydrate async, so pruning before
    // then would wipe the localStorage-restored targets against an empty list
    // (active targets vanishing on every page refresh).
    if (setsStatus !== 'ready') return;
    const valid = activeManualSetIds.filter((id) =>
      manualSets.some((set) => set.id === id),
    );
    if (valid.length !== activeManualSetIds.length) {
      setActiveTargets(valid);
    }
  }, [setsStatus, manualSets, activeManualSetIds, setActiveTargets]);

  // Subscribe to open-tools-panel events (from context menu)
  useEffect(() => {
    return assetEvents.subscribeToOpenToolsPanel((assetIds) => {
      const idSet = new Set(assetIds);
      const matchedAssets = controller.assets.filter((a) => idSet.has(a.id));
      controller.selectAll(matchedAssets);
      // Auto-expand the first tool registered for this surface
      const tools = galleryToolSelectors.getBySurface('assets-default');
      setExpandedToolId(tools[0]?.id ?? null);
    });
  }, [controller.selectAll, controller.assets]);

  const pageFromUrl = useMemo(() => parsePageParam(location.search), [location.search]);
  const groupRequest = useMemo<AssetGroupRequest | null>(() => {
    if (!hasGrouping || isLeafGroup || !currentGroupBy) return null;
    const groupOffset = (groupPage - 1) * GROUP_PAGE_SIZE;
    const base = buildAssetSearchRequest(controller.filters, {
      limit: GROUP_PAGE_SIZE,
      offset: groupOffset,
    });
    return {
      ...base,
      group_by: currentGroupBy,
      group_path: groupPathPayload,
      group_filter: groupFilter,
      preview_limit: GROUP_PREVIEW_LIMIT,
    };
  }, [
    controller.filters,
    currentGroupBy,
    groupPage,
    groupFilter,
    groupPathPayload,
    hasGrouping,
    isLeafGroup,
  ]);
  const groupRequestKey = useMemo(
    () => (groupRequest ? JSON.stringify(groupRequest) : null),
    [groupRequest],
  );

  useEffect(() => {
    let cancelled = false;

    if (!groupRequest) {
      setGroupData(null);
      setGroupError(null);
      setGroupLoading(false);
      return () => undefined;
    }

    setGroupLoading(true);
    setGroupError(null);

    listAssetGroups(groupRequest)
      .then((result) => {
        if (cancelled) return;
        setGroupData(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setGroupError(extractErrorMessage(err, 'Failed to load asset groups'));
        setGroupData(null);
      })
      .finally(() => {
        if (cancelled) return;
        setGroupLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupRequestKey]);

  // Track programmatic updates to skip the sync effect for one cycle.
  // Without this, setGroupByStack writes to BOTH the store and the URL,
  // then the sync effect fires mid-settle, sees a transient mismatch,
  // and calls updatePanelSettings again — causing extra renders and sluggish clearing.
  const skipSyncRef = useRef(false);
  const pendingPageUrlRef = useRef<number | null>(null);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    const storedGroupBy = normalizeGroupBySelection(
      (gallerySettings.groupBy ?? DEFAULT_GROUP_BY_STACK) as GalleryGroupBySelection,
    );
    const storedScope = normalizeGroupScopeSelection(
      (gallerySettings.groupScope ?? DEFAULT_GROUP_SCOPE) as GalleryGroupScope,
    );
    if (
      areGroupByStacksEqual(storedGroupBy, groupByStack) &&
      gallerySettings.groupView === groupView &&
      areScopesEqual(storedScope, normalizedGroupScope)
    ) {
      return;
    }
    updatePanelSettings('gallery', {
      groupBy: groupByStack,
      groupView,
      groupScope: normalizedGroupScope,
    });
  }, [
    gallerySettings.groupBy,
    gallerySettings.groupView,
    gallerySettings.groupScope,
    groupByStack,
    groupView,
    normalizedGroupScope,
    updatePanelSettings,
  ]);

  const syncGroupInUrl = useCallback(
    (
      next: {
        groupBy?: GalleryGroupBySelection | null;
        groupView?: GalleryGroupView | null;
        groupScope?: GalleryGroupScope | null;
        groupPath?: GroupPathEntry[] | null;
        groupPage?: number | null;
      },
      replace = true,
    ) => {
      const params = new URLSearchParams(window.location.search);

      const nextGroupByStack = normalizeGroupBySelection(next.groupBy);
      params.delete('group_by');
      if (nextGroupByStack.length > 0) {
        nextGroupByStack.forEach((value) => {
          params.append('group_by', value);
        });
      }

      if (
        next.groupView === null ||
        next.groupView === undefined ||
        (nextGroupByStack.length === 0 && next.groupView !== 'cluster')
      ) {
        params.delete('group_view');
      } else {
        params.set('group_view', next.groupView);
      }

      const nextScopeValues = normalizeGroupScopeSelection(next.groupScope);
      if (nextScopeValues.length === 0 || nextGroupByStack.length === 0) {
        params.delete('group_scope');
      } else {
        params.delete('group_scope');
        nextScopeValues.forEach((value) => {
          params.append('group_scope', value);
        });
      }

      params.delete('group_key');
      params.delete('group_path');
      if (nextGroupByStack.length > 0 && next.groupPath && next.groupPath.length > 0) {
        const orderedPath: GroupPathEntry[] = [];
        for (const entryBy of nextGroupByStack) {
          const match = next.groupPath.find((entry) => entry.groupBy === entryBy);
          if (!match) break;
          orderedPath.push(match);
        }
        orderedPath.forEach((entry) => {
          params.append('group_path', `${entry.groupBy}:${entry.groupKey}`);
        });
      }

      if (nextGroupByStack.length === 0) {
        params.delete('group_page');
      } else if (next.groupPage !== undefined) {
        const desired = next.groupPage && next.groupPage > 1 ? String(next.groupPage) : null;
        if (desired === null) {
          params.delete('group_page');
        } else {
          params.set('group_page', desired);
        }
      }

      const nextSearch = params.toString();
      navigate(
        {
          pathname: window.location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace },
      );
    },
    [navigate],
  );

  const setGroupByStack = useCallback(
    (nextGroupBy: GalleryGroupBy[]) => {
      const nextGroupView = groupView ?? DEFAULT_GROUP_VIEW;
      const nextGroupScope = normalizeGroupScopeSelection(groupScope.length ? groupScope : DEFAULT_GROUP_SCOPE);
      skipSyncRef.current = true;
      updatePanelSettings('gallery', {
        groupBy: nextGroupBy,
        groupView: nextGroupView,
        groupScope: nextGroupScope,
      });
      syncGroupInUrl(
        {
          groupBy: nextGroupBy,
          groupView: nextGroupView,
          groupScope: nextGroupScope,
          groupPath: [],
          groupPage: 1,
        },
        true,
      );
    },
    [groupView, groupScope, syncGroupInUrl, updatePanelSettings],
  );

  const handleGroupViewChange = useCallback(
    (nextGroupView: GalleryGroupView) => {
      const nextGroupScope = normalizeGroupScopeSelection(groupScope.length ? groupScope : DEFAULT_GROUP_SCOPE);
      skipSyncRef.current = true;
      updatePanelSettings('gallery', {
        groupBy: groupByStack,
        groupView: nextGroupView,
        groupScope: nextGroupScope,
      });
      syncGroupInUrl(
        {
          groupBy: groupByStack,
          groupView: nextGroupView,
          groupScope: nextGroupScope,
          groupPath,
        },
        true,
      );
    },
    [groupByStack, groupPath, groupScope, syncGroupInUrl, updatePanelSettings],
  );

  const handleGroupModeChange = useCallback(
    (nextMode: GalleryGroupMode) => {
      if (nextMode === groupMode) return;
      let nextGroupBy = groupByStack;
      if (nextMode === 'single' && nextGroupBy.length > 1) {
        nextGroupBy = nextGroupBy.slice(0, 1);
      }
      skipSyncRef.current = true;
      updatePanelSettings('gallery', {
        groupMode: nextMode,
        groupBy: nextGroupBy.length > 0 ? nextGroupBy : 'none',
      });
      syncGroupInUrl(
        {
          groupBy: nextGroupBy,
          groupView,
          groupScope,
          groupPath: [],
          groupPage: 1,
        },
        true,
      );
    },
    [groupByStack, groupMode, groupPath, groupScope, groupView, syncGroupInUrl, updatePanelSettings],
  );

  const toggleGroupBy = useCallback(
    (value: GalleryGroupBy) => {
      if (value === 'none') {
        setGroupByStack([]);
        return;
      }
      if (groupMode === 'single') {
        setGroupByStack([value]);
        return;
      }
      const next = [...groupByStack];
      const index = next.indexOf(value);
      if (index >= 0) {
        next.splice(index, 1);
      } else {
        next.push(value);
      }
      setGroupByStack(next);
    },
    [groupByStack, groupMode, setGroupByStack],
  );

  useEffect(() => {
    if (groupMode === 'single' && groupByStack.length > 1) {
      setGroupByStack(groupByStack.slice(0, 1));
    }
  }, [groupByStack, groupMode, setGroupByStack]);

  const setFilters = useCallback((next: Partial<AssetFilters>) => {
    controller.setFilters(next);
  }, [controller.setFilters]);

  const groups = useMemo<AssetGroup[]>(() => {
    if (!groupData) return [];
    const labelGroupBy = currentGroupBy ?? groupByStack[0] ?? 'source';
    const mapped = groupData.groups.map((group) => ({
      key: group.key,
      label: formatGroupLabel(labelGroupBy, group.key, group.meta),
      count: group.count,
      previewAssets: fromAssetResponses(group.preview_assets || []),
      latestTimestamp: Date.parse(group.latest_created_at) || 0,
      meta: group.meta,
    }));
    return sortGroups(mapped, groupSort);
  }, [groupData, currentGroupBy, groupByStack, groupSort]);
  const groupTotalPages = useMemo(() => {
    if (!groupData) return 1;
    const limit = Math.max(1, groupData.limit || GROUP_PAGE_SIZE);
    return Math.max(1, Math.ceil(groupData.total / limit));
  }, [groupData]);
  const groupHasMore = useMemo(() => {
    if (!groupData) return false;
    return groupData.offset + groupData.groups.length < groupData.total;
  }, [groupData]);
  const isClusterView = groupView === 'cluster';
  const isParallelMode = groupMode === 'multi' && groupMultiLayout === 'parallel' && groupByStack.length > 1;
  const showParallelGroups = hasGrouping && isParallelMode && groupPath.length === 0 && !isClusterView;
  const showGroupOverview = hasGrouping && !showParallelGroups && groupPath.length < groupByStack.length && !isClusterView;
  const showGroupFolders = showGroupOverview && groupView === 'folders';
  const visibleAssets = useMemo(() => {
    if (showGroupOverview) return [];
    return controller.assets;
  }, [controller.assets, showGroupOverview]);
  const clusteredItems = useMemo(() => {
    if (!isClusterView) return null;
    return clusterAssets(controller.assets, clusterBy);
  }, [isClusterView, controller.assets, clusterBy]);
  // ---------------------------------------------------------------------------
  // Parallel mode state & data fetching
  // ---------------------------------------------------------------------------
  const [parallelPages, setParallelPages] = useState<Record<string, number>>({});
  const [parallelData, setParallelData] = useState<Record<string, ParallelAxisData>>({});

  useEffect(() => {
    if (!isParallelMode || groupPath.length > 0) {
      setParallelData({});
      return;
    }

    let cancelled = false;
    const axesToFetch = groupByStack;

    // Mark all as loading
    setParallelData((prev) => {
      const next = { ...prev };
      for (const axis of axesToFetch) {
        next[axis] = { ...(next[axis] ?? { groups: [], total: 0, limit: GROUP_PAGE_SIZE, offset: 0, error: null }), loading: true, error: null };
      }
      return next;
    });

    for (const axis of axesToFetch) {
      const axisPage = parallelPages[axis] ?? 1;
      const axisOffset = (axisPage - 1) * GROUP_PAGE_SIZE;
      const base = buildAssetSearchRequest(controller.filters, {
        limit: GROUP_PAGE_SIZE,
        offset: axisOffset,
      });
      const request: AssetGroupRequest = {
        ...base,
        group_by: axis,
        group_path: [],
        group_filter: groupFilter,
        preview_limit: GROUP_PREVIEW_LIMIT,
      };

      listAssetGroups(request)
        .then((result) => {
          if (cancelled) return;
          const parsedGroups: AssetGroup[] = result.groups.map((g) => ({
            key: g.key,
            label: formatGroupLabel(axis, g.key, g.meta),
            count: g.count,
            previewAssets: fromAssetResponses(g.preview_assets || []),
            latestTimestamp: Date.parse(g.latest_created_at) || 0,
            meta: g.meta,
          }));
          setParallelData((prev) => ({
            ...prev,
            [axis]: {
              groups: parsedGroups,
              total: result.total,
              limit: result.limit,
              offset: result.offset,
              loading: false,
              error: null,
            },
          }));
        })
        .catch((err) => {
          if (cancelled) return;
          setParallelData((prev) => ({
            ...prev,
            [axis]: {
              groups: [],
              total: 0,
              limit: GROUP_PAGE_SIZE,
              offset: 0,
              loading: false,
              error: extractErrorMessage(err, 'Failed to load groups'),
            },
          }));
        });
    }

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParallelMode, groupPath.length, groupByStack.join(','), JSON.stringify(controller.filters), JSON.stringify(groupFilter), JSON.stringify(parallelPages)]);

  const goToAxisPage = useCallback((axis: GalleryGroupBy, page: number) => {
    if (page < 1) return;
    setParallelPages((prev) => ({ ...prev, [axis]: page }));
  }, []);

  const openAxisGroup = useCallback(
    (axis: GalleryGroupBy, key: string) => {
      const nextPath = [{ groupBy: axis, groupKey: key }];
      syncGroupInUrl(
        {
          groupBy: groupByStack,
          groupView,
          groupScope,
          groupPath: nextPath,
          groupPage: 1,
        },
        false,
      );
    },
    [groupByStack, groupView, groupScope, syncGroupInUrl],
  );

  const openGroup = useCallback(
    (key: string) => {
      if (!currentGroupBy) return;
      const nextPath = [...groupPath, { groupBy: currentGroupBy, groupKey: key }];
      syncGroupInUrl(
        {
          groupBy: groupByStack,
          groupView,
          groupScope,
          groupPath: nextPath,
          groupPage: 1,
        },
        false,
      );
    },
    [currentGroupBy, groupByStack, groupPath, groupView, groupScope, syncGroupInUrl],
  );

  const clearGroup = useCallback(() => {
    if (groupPath.length === 0) return;
    const nextPath = groupPath.slice(0, -1);
    syncGroupInUrl(
      {
        groupBy: groupByStack,
        groupView,
        groupScope,
        groupPath: nextPath,
        groupPage: 1,
      },
      true,
    );
  }, [groupByStack, groupPath, groupView, groupScope, syncGroupInUrl]);

  /** Navigate to an exact depth in the group path (0 = group overview). */
  const navigateToGroupDepth = useCallback(
    (depth: number) => {
      syncGroupInUrl(
        {
          groupBy: groupByStack,
          groupView,
          groupScope,
          groupPath: groupPath.slice(0, depth),
          groupPage: 1,
        },
        true,
      );
    },
    [groupByStack, groupPath, groupView, groupScope, syncGroupInUrl],
  );

  const syncPageInUrl = useCallback((page: number, replace = true) => {
    const params = new URLSearchParams(window.location.search);
    const current = params.get('page');
    const desired = page > 1 ? String(page) : null;
    const targetPage = page > 1 ? page : 1;

    if (desired === null) {
      if (current === null) return;
      params.delete('page');
    } else {
      if (current === desired) return;
      params.set('page', desired);
    }

    pendingPageUrlRef.current = targetPage;
    const nextSearch = params.toString();
    navigate(
      {
        pathname: window.location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace },
    );
  }, [navigate]);

  const syncGroupPageInUrl = useCallback(
    (page: number, replace = true) => {
      const params = new URLSearchParams(window.location.search);
      const current = params.get('group_page');
      const desired = page > 1 ? String(page) : null;

      if (desired === null) {
        if (current === null) return;
        params.delete('group_page');
      } else {
        if (current === desired) return;
        params.set('group_page', desired);
      }

      const nextSearch = params.toString();
      navigate(
        {
          pathname: window.location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace },
      );
    },
    [navigate],
  );

  useEffect(() => {
    if (!groupData) return;
    if (groupPage > groupTotalPages && groupTotalPages > 0) {
      syncGroupPageInUrl(groupTotalPages, true);
    }
  }, [groupData, groupPage, groupTotalPages, syncGroupPageInUrl]);

  const rememberPresetPage = useFilterPresetStore((s) => s.rememberPage);

  const goToPage = useCallback((page: number, replace = false) => {
    if (page < 1) return;
    syncPageInUrl(page, replace);
    controller.goToPage(page);
    // Resolve active preset at call-time to avoid stale closure writes during preset switches.
    const currentPresetId = useFilterPresetStore.getState().activePresetId;
    rememberPresetPage(currentPresetId, page);
  }, [controller.goToPage, syncPageInUrl, rememberPresetPage]);

  const filterByQuickTagShortcut = useCallback(
    (tagSlug: string) => {
      const normalized = normalizeTagInput(tagSlug);
      if (!normalized) return;

      const currentTagFilter = controller.filters.tag;
      const alreadyFocused =
        (typeof currentTagFilter === 'string' && currentTagFilter === normalized) ||
        (Array.isArray(currentTagFilter) &&
          currentTagFilter.length === 1 &&
          currentTagFilter[0] === normalized);

      setFilters({
        tag: alreadyFocused ? undefined : normalized,
        tag__mode: undefined,
      });
      goToPage(1, true);
    },
    [controller.filters.tag, setFilters, goToPage],
  );

  const goToGroupPage = useCallback(
    (page: number, replace = false) => {
      if (page < 1) return;
      syncGroupPageInUrl(page, replace);
    },
    [syncGroupPageInUrl],
  );

  const resetAssets = useCallback(() => {
    controller.reset(pageFromUrl);
  }, [controller.reset, pageFromUrl]);

  useEffect(() => {
    if (controller.loading) return;
    const pendingPage = pendingPageUrlRef.current;
    if (pendingPage !== null) {
      if (pageFromUrl !== pendingPage) return;
      pendingPageUrlRef.current = null;
    }
    if (pageFromUrl === controller.currentPage) return;

    // If the controller clamped the page (e.g. page 5 → 3 because only 3 pages exist),
    // sync the URL down to the clamped value instead of fighting the clamp.
    // Only clamp when hasMore=false — totalPages is unreliable after a loadMore-based
    // initial load (it stays 1 until goToPage is called), so clamping while hasMore=true
    // would incorrectly revert forward navigation.
    if (controller.currentPage < pageFromUrl && controller.totalPages < pageFromUrl && !controller.hasMore) {
      syncPageInUrl(controller.currentPage, true);
      return;
    }

    controller.goToPage(pageFromUrl);
  }, [controller.currentPage, controller.goToPage, controller.loading, controller.totalPages, pageFromUrl, syncPageInUrl]);

  // Convert selected IDs to GalleryAsset objects
  const selectedAssets: GalleryAsset[] = useMemo(() => {
    return controller.assets.filter((a) => controller.selectedAssetIds.has(String(a.id)));
  }, [controller.assets, controller.selectedAssetIds]);

  const addAssetToActiveTargets = useCallback(
    (assetId: number) => {
      for (const set of activeSets) void addAssetsToSet(set.id, [assetId]);
    },
    [activeSets, addAssetsToSet],
  );

  const addSelectedToActiveTargets = useCallback(() => {
    if (activeSets.length === 0 || selectedAssets.length === 0) return;
    const ids = selectedAssets.map((asset) => asset.id);
    for (const set of activeSets) {
      const members = new Set(set.assetIds);
      const alreadyIn = ids.reduce((n, id) => (members.has(id) ? n + 1 : n), 0);
      const added = ids.length - alreadyIn;
      void addAssetsToSet(set.id, ids);
      if (added <= 0) {
        useToastStore.getState().addToast({
          type: 'info',
          message: `All ${ids.length} already in "${set.name}".`,
          duration: 4000,
        });
      } else {
        const base = `Added ${added} asset${added === 1 ? '' : 's'} to "${set.name}".`;
        useToastStore.getState().addToast({
          type: 'success',
          message: alreadyIn > 0 ? `${base} (${alreadyIn} already there)` : base,
          duration: 4000,
        });
      }
    }
  }, [activeSets, addAssetsToSet, selectedAssets]);

  const handleCreateSet = useCallback(async () => {
    const created = await createSet({ name: 'New Set', kind: 'manual', assetIds: [] });
    return created.id;
  }, [createSet]);

  // Gallery tool context
  const galleryContext: GalleryToolContext = useMemo(
    () => ({
      assets: controller.assets,
      selectedAssets,
      filters: controller.filters,
      refresh: () => {
        resetAssets();
      },
      updateFilters: setFilters,
      isSelectionMode: controller.isSelectionMode,
    }),
    [
      controller.assets,
      selectedAssets,
      controller.filters,
      setFilters,
      controller.isSelectionMode,
      resetAssets,
    ]
  );

  // Resolve single provider filter for reupload actions
  const filterProviderId = Array.isArray(controller.filters.provider_id)
    ? controller.filters.provider_id.length === 1
      ? controller.filters.provider_id[0]
      : undefined
    : controller.filters.provider_id || undefined;

  // Stable card helpers — keep RemoteGalleryCard's props referentially constant
  // across asset-update bursts so its memo holds (only the updated card's
  // `asset` ref changes). The full asset list and the viewer-open callback are
  // read through refs so they don't re-thread into every card on each update.
  const assetsRef = useRef(controller.assets);
  assetsRef.current = controller.assets;
  const openGalleryAssetRef = useRef(openGalleryAsset);
  openGalleryAssetRef.current = openGalleryAsset;
  const handleOpenAsset = useCallback(
    (a: AssetModel) => openGalleryAssetRef.current(a, assetsRef.current),
    [],
  );
  // Selection handed to cards — recomputed only when the selection *set* changes
  // (not when `controller.assets` churns on updates), so it doesn't defeat the
  // card memo. Distinct from `selectedAssets` (used for bulk-action handlers).
  const cardSelection = useMemo(
    () => assetsRef.current.filter((a) => controller.selectedAssetIds.has(String(a.id))),
    [controller.selectedAssetIds],
  );

  // Render cards
  const cardItems = visibleAssets.map((a) => {
    const isSelected = controller.selectedAssetIds.has(String(a.id));

    if (controller.isSelectionMode) {
      return (
        <div key={a.id} className="relative group rounded-md">
          <div className="opacity-75 group-hover:opacity-100 transition-opacity">
            <MediaCard
              asset={a}
              onOpen={undefined}
              onFilterByTagShortcut={filterByQuickTagShortcut}
              onToggleFavorite={() => toggleFavoriteTag(a)}
              actions={{
                ...controller.getAssetActions(a),
                onAddToActiveSet: activeSets.length > 0 ? addAssetToActiveTargets : undefined,
              }}
              contextMenuSelection={cardSelection}
              overlayConfig={overlayConfig}
              overlayPresetId={overlayPresetId}
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Button
              variant="primary"
              onClick={() => controller.selectAsset(a)}
              className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center gap-1"
            >
              <Icon name="check" size={14} variant="default" />
              Select Asset
            </Button>
          </div>
        </div>
      );
    }

    return (
      <RemoteGalleryCard
        key={a.id}
        asset={a}
        isSelected={isSelected}
        providers={providers}
        filterProviderId={filterProviderId}
        activeSets={activeSets}
        contextMenuSelection={cardSelection}
        overlayConfig={overlayConfig}
        overlayPresetId={overlayPresetId}
        getAssetActions={controller.getAssetActions}
        reuploadAsset={controller.reuploadAsset}
        onOpenAsset={handleOpenAsset}
        onFilterByTagShortcut={filterByQuickTagShortcut}
        onAddToActiveTargets={addAssetToActiveTargets}
        onToggleSelection={controller.toggleAssetSelection}
        onResetAssets={resetAssets}
      />
    );
  });

  // Build a lookup for rendering individual cards inside expanded clusters
  const assetById = useMemo(() => {
    const map = new Map<number, AssetModel>();
    for (const a of controller.assets) map.set(a.id, a);
    return map;
  }, [controller.assets]);

  const renderSingleCard = useCallback(
    (assetId: number) => {
      const a = assetById.get(assetId);
      if (!a) return null;
      const isSelected = controller.selectedAssetIds.has(String(a.id));
      return (
        <RemoteGalleryCard
          key={a.id}
          asset={a}
          isSelected={isSelected}
          providers={providers}
          filterProviderId={filterProviderId}
          activeSets={activeSets}
          contextMenuSelection={cardSelection}
          overlayConfig={overlayConfig}
          overlayPresetId={overlayPresetId}
          getAssetActions={controller.getAssetActions}
          reuploadAsset={controller.reuploadAsset}
          onOpenAsset={handleOpenAsset}
          onFilterByTagShortcut={filterByQuickTagShortcut}
          onAddToActiveTargets={addAssetToActiveTargets}
          onToggleSelection={controller.toggleAssetSelection}
          onResetAssets={resetAssets}
        />
      );
    },
    [
      assetById,
      controller.selectedAssetIds,
      controller.getAssetActions,
      controller.reuploadAsset,
      controller.toggleAssetSelection,
      activeSets,
      addAssetToActiveTargets,
      handleOpenAsset,
      cardSelection,
      providers,
      filterProviderId,
      resetAssets,
      filterByQuickTagShortcut,
      overlayConfig,
      overlayPresetId,
    ],
  );

  // ---------------------------------------------------------------------------
  // Surface routing: non-default surfaces replace the entire content area
  // ---------------------------------------------------------------------------
  const activeSurfaceId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('surface') || 'assets-default';
  }, [location.search]);

  if (activeSurfaceId === 'assets-review') {
    return <ReviewSurfaceContent controller={controller} />;
  }
  if (activeSurfaceId === 'assets-curator') {
    return <CuratorSurfaceContent controller={controller} />;
  }
  if (activeSurfaceId === 'assets-debug') {
    return <DebugSurfaceContent controller={controller} />;
  }
  if (activeSurfaceId === 'assets-signal-triage') {
    return <SignalTriageContent controller={controller} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Fixed filters section */}
      <div className="flex-shrink-0 space-y-4">
        {controller.error && <div className="text-red-600 text-sm">{controller.error}</div>}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Page-based pagination controls */}
            {showParallelGroups ? null : showGroupOverview ? (
              <PaginationStrip
                currentPage={groupPage}
                totalPages={groupTotalPages}
                hasMore={groupHasMore}
                loading={groupLoading}
                onPageChange={goToGroupPage}
                prevTitle="Previous group page"
                nextTitle="Next group page"
              />
            ) : (
              <PaginationStrip
                currentPage={controller.currentPage}
                totalPages={controller.totalPages}
                hasMore={controller.hasMore}
                loading={controller.loading}
                onPageChange={goToPage}
              />
            )}

            {/* Grouping */}
            <GroupingMenuDropdown
              groupMenuAnchorRef={groupMenuAnchorRef}
              groupMenuOpen={groupMenuOpen}
              setGroupMenuOpen={setGroupMenuOpen}
              groupByStack={groupByStack}
              groupMode={groupMode}
              groupMultiLayout={groupMultiLayout}
              groupView={groupView}
              groupSort={groupSort}
              clusterBy={clusterBy}
              toggleGroupBy={toggleGroupBy}
              handleGroupModeChange={handleGroupModeChange}
              handleGroupViewChange={handleGroupViewChange}
              setGroupSort={setGroupSort}
              onMultiLayoutChange={(layout) => updatePanelSettings('gallery', { groupMultiLayout: layout })}
              onClusterByChange={(dim) => updatePanelSettings('gallery', { clusterBy: dim })}
            />

            {/* Divider */}
            <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

            {/* Sort */}
            <select
              className="h-7 px-1.5 text-xs border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 focus:outline-none focus:border-accent transition-colors"
              value={controller.filters.sort}
              onChange={(e) => setFilters({ sort: e.target.value as any })}
            >
              <option value="new">Newest First</option>
              <option value="old">Oldest First</option>
              <option value="alpha">A-Z</option>
            </select>

            {/* Injected toolbar controls from parent shell */}
            {toolbarExtra}
          </div>
          <FilterPresetBar
            currentFilters={controller.filters}
            onLoadPreset={(filters, page) => {
              // Keep URL/controller page aligned while avoiding an immediate fetch
              // against stale filters in the same tick as replaceFilters.
              syncPageInUrl(page, true);
              controller.reset(page);
              controller.replaceFilters(filters);
            }}
          />
          <div>
            <DynamicFilters
              filters={controller.filters}
              onFiltersChange={(f) => setFilters(f)}
              // Count aggregation across all filter dimensions is expensive on
              // large libraries and can time out even with no active filters.
              onBrowseFilter={browseFilterInMiniGallery}
              extraChips={
                <AssetSetChip
                  chipKey="asset-sets"
                  chipState={setChipState}
                  manualSets={manualSets}
                  activeSetIds={activeManualSetIds}
                  filterSetIds={filterSetIds}
                  onToggleFilter={toggleFilterSet}
                  onToggleTarget={toggleActiveTarget}
                  onBrowseSet={browseSetInMiniGallery}
                  onSetIcon={(id, icon) => void updateSet(id, { icon })}
                  selectedCount={controller.selectedAssetIds.size}
                  onAddSelected={addSelectedToActiveTargets}
                  onCreateSet={handleCreateSet}
                  onRenameSet={renameSet}
                  onDeleteSet={deleteSet}
                />
              }
            />
          </div>
        </div>

        {/* Inline gallery tools strip */}
        {controller.selectedAssetIds.size > 0 && !controller.isSelectionMode && (
          <GalleryToolsStrip
            selectedCount={controller.selectedAssetIds.size}
            surfaceId="assets-default"
            galleryContext={galleryContext}
            expandedToolId={expandedToolId}
            onExpandedToolChange={setExpandedToolId}
            onClearSelection={controller.clearSelection}
          />
        )}
      </div>

      {/* Scrollable gallery. overflow-x-hidden (not overflow-auto): a vertical
          gallery must never scroll sideways. With overflow-x:auto, a single wide
          child (pagination row, nowrap breadcrumb) grows the scroller's content
          width, and the auto-width MasonryGrid stretches past the viewport with
          it — clipping the right edge of every card on mobile. min-w-0 keeps the
          flex child from being forced wider than its parent. */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 mt-4">
        {hasGrouping && groupPath.length > 0 && (
          <GroupBreadcrumb
            groupPath={groupPath}
            isLeafGroup={isLeafGroup}
            itemCount={controller.assets.length}
            onNavigateToDepth={navigateToGroupDepth}
            onBack={clearGroup}
          />
        )}

        {showParallelGroups ? (
          <div className="space-y-4">
            {groupByStack.map((axis) => (
              <ParallelGroupSection
                key={axis}
                axis={axis}
                axisData={parallelData[axis] ?? { groups: [], total: 0, limit: GROUP_PAGE_SIZE, offset: 0, loading: true, error: null }}
                axisPage={parallelPages[axis] ?? 1}
                groupView={groupView}
                groupSort={groupSort}
                cardSize={cardSize}
                onOpenGroup={(key) => openAxisGroup(axis, key)}
                onPageChange={(page) => goToAxisPage(axis, page)}
              />
            ))}
          </div>
        ) : showGroupOverview ? (
          groupLoading ? (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Loading groups...
            </div>
          ) : groupError ? (
            <div className="text-sm text-red-500">{groupError}</div>
          ) : groups.length > 0 ? (
            <>
            {groupData && groupData.total > 0 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                {groupData.total} {groupData.total === 1 ? 'group' : 'groups'}
                {currentGroupBy && <> by {GROUP_BY_LABELS[currentGroupBy]}</>}
              </div>
            )}
            {showGroupFolders ? (
              <div
                className="grid"
                style={{
                  // min(cardSize, 100%) caps the track at the container width so a
                  // single column on a narrow phone shrinks to fit instead of
                  // forcing the grid wider than the viewport (right-edge crop).
                  gridTemplateColumns: `repeat(auto-fill, minmax(min(${cardSize}px, 100%), 1fr))`,
                  rowGap: `${layoutSettings.rowGap}px`,
                  columnGap: `${layoutSettings.columnGap}px`,
                }}
              >
                {groups.map((group) => (
                  <GroupFolderTile
                    key={group.key}
                    group={group}
                    cardSize={cardSize}
                    onOpen={() => openGroup(group.key)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((group) => (
                  <GroupListRow
                    key={group.key}
                    group={group}
                    cardSize={cardSize}
                    onOpen={() => openGroup(group.key)}
                  />
                ))}
              </div>
            )}
            </>
          ) : (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              No groups available for this mode.
            </div>
          )
        ) : isClusterView && clusteredItems ? (
          <div
            className="grid"
            style={{
              // min(cardSize, 100%) caps the track at the container width so a
              // single column on a narrow phone shrinks to fit instead of
              // forcing the grid wider than the viewport (right-edge crop).
              gridTemplateColumns: `repeat(auto-fill, minmax(min(${cardSize}px, 100%), 1fr))`,
              rowGap: `${layoutSettings.rowGap}px`,
              columnGap: `${layoutSettings.columnGap}px`,
            }}
          >
            {clusteredItems.map((item) =>
              isCluster(item) ? (
                <ClusterCard
                  key={`cluster-${item.key}`}
                  cluster={item}
                  cardSize={cardSize}
                  renderAssetCard={renderSingleCard}
                />
              ) : (
                renderSingleCard(item.id)
              ),
            )}
          </div>
        ) : (
          // Both layouts share MasonryGrid's viewport virtualization (mounting
          // every card unbounded was the prime driver of the tab's native-memory
          // climb while scrolling). 'masonry' = staggered columns; 'grid' =
          // aligned rows matching the old CSS-grid look.
          <MasonryGrid
            mode={layout === 'masonry' ? 'masonry' : 'grid'}
            items={cardItems}
            rowGap={layoutSettings.rowGap}
            columnGap={layoutSettings.columnGap}
            minColumnWidth={cardSize}
            scrollParentRef={scrollContainerRef}
          />
        )}
        {/* Bottom pagination controls (duplicate of top for convenience) */}
        {showParallelGroups ? null : showGroupOverview ? (
          <BottomPagination
            currentPage={groupPage}
            totalPages={groupTotalPages}
            hasMore={groupHasMore}
            loading={groupLoading}
            onPageChange={goToGroupPage}
            label="Group page"
          />
        ) : (
          <BottomPagination
            currentPage={controller.currentPage}
            totalPages={controller.totalPages}
            hasMore={controller.hasMore}
            loading={controller.loading}
            onPageChange={goToPage}
          />
        )}
      </div>
    </div>
  );
}
