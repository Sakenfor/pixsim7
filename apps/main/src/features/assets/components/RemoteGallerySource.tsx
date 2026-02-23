import { Button, Dropdown } from '@pixsim7/shared.ui';
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';


import { listAssetGroups } from '@lib/api/assets';
import type { AssetGroupListResponse, AssetGroupRequest } from '@lib/api/assets';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { Icon } from '@lib/icons';
import { createBadgeWidget, getMediaCardPreset } from '@lib/ui/overlay';

import type { GalleryToolContext, GalleryAsset } from '@features/gallery/lib/core/types';
import { galleryToolSelectors } from '@features/gallery/lib/registry';
import {
  usePanelConfigStore,
  type GalleryGroupBy,
  type GalleryGroupMode,
  type GalleryGroupMultiLayout,
  type GalleryGroupView,
  type GalleryGroupScope,
  type GalleryPanelSettings,
  type GalleryGroupBySelection,
} from '@features/panels';
import { useProviders } from '@features/providers';

import { MasonryGrid } from '@/components/layout/MasonryGrid';
import { MediaCard } from '@/components/media/MediaCard';

import type { AssetFilters, AssetModel } from '../hooks/useAssets';
import { useAssetsController } from '../hooks/useAssetsController';
import { useAssetViewer, useViewerScopeSync } from '../hooks/useAssetViewer';
import { assetEvents } from '../lib/assetEvents';
import { buildRemoteAssetActions } from '../lib/buildRemoteAssetActions';
import { toggleFavoriteTag } from '../lib/favoriteTag';
import { GROUP_BY_LABELS, normalizeGroupBySelection } from '../lib/groupBy';
import { normalizeGroupScopeSelection } from '../lib/groupScope';
import { buildAssetSearchRequest } from '../lib/searchParams';
import { fromAssetResponses, toViewerAssets } from '../models/asset';
import { useAssetSetStore, type ManualAssetSet } from '../stores/assetSetStore';
import { useAssetViewerStore, selectIsViewerOpen } from '../stores/assetViewerStore';
import { useGalleryApplyTargetStore } from '../stores/galleryApplyTargetStore';

import { CuratorSurfaceContent } from './CuratorGallerySurface';
import { DebugSurfaceContent } from './DebugGallerySurface';
import { DynamicFilters } from './DynamicFilters';
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


// ---------------------------------------------------------------------------
// ActiveSetChip — compact chip for the DynamicFilters extra-chips slot
// ---------------------------------------------------------------------------

function ActiveSetChip({
  manualSets,
  activeManualSet,
  activeManualSetId,
  setActiveManualSetId,
  clearActiveManualSetId,
  selectedCount,
  onAddSelected,
}: {
  manualSets: ManualAssetSet[];
  activeManualSet: ManualAssetSet | undefined;
  activeManualSetId: string | undefined;
  setActiveManualSetId: (id?: string) => void;
  clearActiveManualSetId: () => void;
  selectedCount: number;
  onAddSelected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const hoverTimeout = useRef<number | null>(null);

  const isActive = !!activeManualSet;
  const isVisible = open || hovered;
  const isInFlow = isActive;

  useLayoutEffect(() => {
    if (!isVisible || !anchorRef.current) {
      setRect(null);
      return;
    }
    const update = () => setRect(anchorRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isVisible]);

  const openHover = useCallback(() => {
    if (hoverTimeout.current !== null) {
      window.clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    setHovered(true);
  }, []);

  const closeHover = useCallback(() => {
    if (hoverTimeout.current !== null) {
      window.clearTimeout(hoverTimeout.current);
    }
    hoverTimeout.current = window.setTimeout(() => {
      setHovered(false);
    }, 120);
  }, []);

  if (manualSets.length === 0) return null;

  return (
    <div
      className={`relative group flex-none ${isInFlow ? '' : 'w-7 h-7'}`}
      style={!isInFlow && isVisible ? { zIndex: 30 } : undefined}
      onMouseEnter={openHover}
      onMouseLeave={closeHover}
    >
      <button
        type="button"
        ref={anchorRef}
        title="Active Set"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`${isInFlow ? 'relative' : 'absolute left-0 top-0 w-7 justify-center'} z-20 inline-flex items-center gap-1.5 h-7 px-1.5 rounded border text-xs transition-[background-color,border-color] duration-200 ${
          isActive
            ? 'border-emerald-500/50 bg-emerald-500/10 text-neutral-800 dark:text-neutral-100'
            : open
              ? 'border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
              : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        }`}
      >
        <span className="relative flex-shrink-0">
          <Icon name="target" size={14} className="w-3.5 h-3.5" />
        </span>
        {isInFlow && (
          <span className="font-medium whitespace-nowrap">
            {activeManualSet!.name}
          </span>
        )}
        {isInFlow && (
          <span className="text-[9px] leading-none px-1 min-w-[14px] text-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
            {activeManualSet!.assetIds.length}
          </span>
        )}
      </button>
      {/* Floating label for idle state */}
      {!isInFlow && (
        <span
          className={`absolute left-[27px] top-0 z-20 h-7 inline-flex items-center gap-1 pl-1 pr-1.5 rounded-r border border-l-0 text-xs font-medium whitespace-nowrap pointer-events-none transition-opacity duration-150 text-neutral-700 dark:text-neutral-200 ${
            isVisible
              ? 'opacity-100 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900'
              : 'opacity-0 border-transparent'
          }`}
        >
          Active Set
        </span>
      )}
      {/* Dropdown */}
      {isVisible && rect && createPortal(
        <div
          className="z-popover"
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 240 - 8)),
            top: rect.bottom + 6,
          }}
          onMouseEnter={openHover}
          onMouseLeave={closeHover}
        >
          <Dropdown
            isOpen={isVisible}
            onClose={() => { setOpen(false); setHovered(false); }}
            positionMode="static"
            minWidth="200px"
            className="max-w-[280px]"
          >
            <div className="flex flex-col gap-0.5">
              {/* "None" option */}
              <label
                className="flex items-center gap-2 px-1.5 py-1 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <input
                  type="radio"
                  name="active-set-chip"
                  checked={!activeManualSetId}
                  onChange={() => { clearActiveManualSetId(); setOpen(false); }}
                  className="accent-emerald-500"
                />
                <span className={!activeManualSetId ? 'text-neutral-400 dark:text-neutral-500' : ''}>
                  None
                </span>
              </label>
              {/* Manual sets */}
              {manualSets.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 px-1.5 py-1 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <input
                    type="radio"
                    name="active-set-chip"
                    checked={activeManualSetId === s.id}
                    onChange={() => { setActiveManualSetId(s.id); setOpen(false); }}
                    className="accent-emerald-500"
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                    {s.assetIds.length}
                  </span>
                </label>
              ))}
              {/* Add selected action */}
              {selectedCount > 0 && activeManualSet && (
                <>
                  <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
                  <button
                    type="button"
                    onClick={() => { onAddSelected(); setOpen(false); }}
                    className="flex items-center gap-1.5 px-1.5 py-1 text-sm text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-500/10 transition-colors"
                  >
                    <Icon name="plus" size={12} />
                    <span>Add {selectedCount} selected</span>
                  </button>
                </>
              )}
            </div>
          </Dropdown>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface RemoteGallerySourceProps {
  layout: 'masonry' | 'grid';
  cardSize: number;
  overlayPresetId?: string;
  toolbarExtra?: ReactNode;
}

export function RemoteGallerySource({ layout, cardSize, overlayPresetId, toolbarExtra }: RemoteGallerySourceProps) {
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
  const groupSearchOverrides = useMemo(() => {
    if (!isLeafGroup) return undefined;
    return {
      group_path: groupPathPayload,
      group_filter: groupFilter,
    };
  }, [groupFilter, groupPathPayload, isLeafGroup]);
  const initialPageRef = useRef(parsePageParam(location.search));
  const controller = useAssetsController({
    initialPage: initialPageRef.current,
    preservePageOnFilterChange: true,
    requestOverrides: groupSearchOverrides,
  });
  const { providers } = useProviders();
  const allSets = useAssetSetStore((state) => state.sets);
  const manualSets = useMemo(
    () => allSets.filter((set): set is ManualAssetSet => set.kind === 'manual'),
    [allSets],
  );
  const addAssetsToSet = useAssetSetStore((s) => s.addAssetsToSet);
  const activeManualSetId = useGalleryApplyTargetStore((s) => s.activeManualSetId);
  const setActiveManualSetId = useGalleryApplyTargetStore((s) => s.setActiveManualSetId);
  const clearActiveManualSetId = useGalleryApplyTargetStore((s) => s.clearActiveManualSetId);
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
  const scopeLabel = hasActiveFilters
    ? `Gallery: filtered (${controller.assets.length})`
    : `Gallery (${controller.assets.length})`;

  useViewerScopeSync('gallery', scopeLabel, viewerAssets, isViewerOpen);

  const [groupData, setGroupData] = useState<AssetGroupListResponse | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [groupMenuRect, setGroupMenuRect] = useState<DOMRect | null>(null);
  const [groupSort, setGroupSort] = useState<GroupSortKey>('newest');

  // Layout settings (gaps)
  const [layoutSettings] = useState({ rowGap: 16, columnGap: 16 });
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const activeManualSet = useMemo(
    () => manualSets.find((set) => set.id === activeManualSetId),
    [manualSets, activeManualSetId],
  );
  const activeManualSetAssetIds = useMemo(
    () => new Set(activeManualSet?.assetIds ?? []),
    [activeManualSet],
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
    if (activeManualSetId && !activeManualSet) {
      clearActiveManualSetId();
    }
  }, [activeManualSet, activeManualSetId, clearActiveManualSetId]);

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

  useLayoutEffect(() => {
    if (!groupMenuOpen || !groupMenuAnchorRef.current) {
      setGroupMenuRect(null);
      return;
    }

    const update = () => {
      setGroupMenuRect(groupMenuAnchorRef.current?.getBoundingClientRect() ?? null);
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [groupMenuOpen]);

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

  useEffect(() => {
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
        nextGroupByStack.length === 0
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
  const isParallelMode = groupMode === 'multi' && groupMultiLayout === 'parallel' && groupByStack.length > 1;
  const showParallelGroups = hasGrouping && isParallelMode && groupPath.length === 0;
  const showGroupOverview = hasGrouping && !showParallelGroups && groupPath.length < groupByStack.length;
  const showGroupFolders = showGroupOverview && groupView === 'folders';
  const visibleAssets = useMemo(() => {
    if (showGroupOverview) return [];
    return controller.assets;
  }, [controller.assets, showGroupOverview]);
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

    if (desired === null) {
      if (current === null) return;
      params.delete('page');
    } else {
      if (current === desired) return;
      params.set('page', desired);
    }

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

  const goToPage = useCallback((page: number, replace = false) => {
    if (page < 1) return;
    syncPageInUrl(page, replace);
    controller.goToPage(page);
  }, [controller.goToPage, syncPageInUrl]);

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
    if (pageFromUrl !== controller.currentPage) {
      controller.goToPage(pageFromUrl);
    }
  }, [controller.currentPage, controller.goToPage, controller.loading, pageFromUrl]);

  // Convert selected IDs to GalleryAsset objects
  const selectedAssets: GalleryAsset[] = useMemo(() => {
    return controller.assets.filter((a) => controller.selectedAssetIds.has(String(a.id)));
  }, [controller.assets, controller.selectedAssetIds]);

  const addAssetToActiveManualSet = useCallback(
    (assetId: number) => {
      if (!activeManualSet) return;
      addAssetsToSet(activeManualSet.id, [assetId]);
    },
    [activeManualSet, addAssetsToSet],
  );

  const addSelectedToActiveManualSet = useCallback(() => {
    if (!activeManualSet || selectedAssets.length === 0) return;
    addAssetsToSet(activeManualSet.id, selectedAssets.map((asset) => asset.id));
  }, [activeManualSet, addAssetsToSet, selectedAssets]);

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

  // Handle asset selection for gallery tools
  const toggleAssetSelection = (asset: AssetModel) => {
    controller.toggleAssetSelection(asset);
  };

  // Resolve single provider filter for reupload actions
  const filterProviderId = Array.isArray(controller.filters.provider_id)
    ? controller.filters.provider_id.length === 1
      ? controller.filters.provider_id[0]
      : undefined
    : controller.filters.provider_id || undefined;

  // Render cards
  const cardItems = visibleAssets.map((a) => {
    const isSelected = controller.selectedAssetIds.has(String(a.id));
    const isInActiveManualSet = activeManualSetAssetIds.has(a.id);

    if (controller.isSelectionMode) {
      return (
        <div key={a.id} className="relative group rounded-md">
          <div className="opacity-75 group-hover:opacity-100 transition-opacity">
            <MediaCard
              asset={a}
              onOpen={undefined}
              onToggleFavorite={() => toggleFavoriteTag(a)}
              actions={{
                ...controller.getAssetActions(a),
                onAddToActiveSet: activeManualSet ? addAssetToActiveManualSet : undefined,
              }}
              contextMenuSelection={selectedAssets}
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
      <div
        key={a.id}
        className={`relative cursor-pointer group rounded-md ${
          isSelected ? 'ring-4 ring-purple-500' : ''
        }`}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            toggleAssetSelection(a);
          }
        }}
      >
        {activeManualSet && !isInActiveManualSet && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addAssetToActiveManualSet(a.id);
            }}
            className="absolute top-1.5 left-1.5 z-20 inline-flex items-center gap-1 px-1.5 h-6 rounded-md border text-[10px] font-medium shadow-sm transition-opacity opacity-0 group-hover:opacity-100 border-neutral-200 dark:border-neutral-700 bg-white/95 dark:bg-neutral-900/95 text-neutral-700 dark:text-neutral-200 hover:bg-accent/10 hover:border-accent/40"
            title={`Add to active set: ${activeManualSet.name}`}
          >
            <Icon name="plus" size={10} />
            <span>Add</span>
          </button>
        )}
        <MediaCard
          asset={a}
          onOpen={() => openGalleryAsset(a, controller.assets)}
          onToggleFavorite={() => toggleFavoriteTag(a)}
          actions={buildRemoteAssetActions(a, {
            baseActions: {
              ...controller.getAssetActions(a),
              onAddToActiveSet: activeManualSet ? addAssetToActiveManualSet : undefined,
            },
            providers,
            filterProviderId,
            reuploadAsset: controller.reuploadAsset,
            refresh: resetAssets,
          })}
          contextMenuSelection={selectedAssets}
          customWidgets={isInActiveManualSet ? [
            createBadgeWidget({
              id: 'active-set-indicator',
              position: { anchor: 'top-left', offset: { x: 9, y: 36 } },
              visibility: { trigger: 'always' },
              variant: 'icon',
              color: 'green',
              shape: 'circle',
              tooltip: `In active set: ${activeManualSet?.name ?? 'Active Set'}`,
              className: '!w-2.5 !h-2.5 !min-w-0 !min-h-0 !p-0 !bg-emerald-500 ring-2 ring-white/90 dark:ring-neutral-900/90 shadow-sm',
              priority: 11,
            }),
          ] : undefined}
          overlayConfig={overlayConfig}
          overlayPresetId={overlayPresetId}
        />
      </div>
    );
  });

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

  return (
    <div className="flex flex-col h-full">
      {/* Fixed filters section */}
      <div className="flex-shrink-0 space-y-4">
        {controller.error && <div className="text-red-600 text-sm">{controller.error}</div>}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="flex-1 min-w-[200px] max-w-[300px]">
              <input
                placeholder="Search tags, description..."
                className="w-full h-7 px-2 text-xs border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900/60 text-neutral-700 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-accent transition-colors"
                value={controller.filters.q}
                onChange={(e) => setFilters({ q: e.target.value })}
              />
            </div>

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
              groupMenuRect={groupMenuRect}
              groupByStack={groupByStack}
              groupMode={groupMode}
              groupMultiLayout={groupMultiLayout}
              groupView={groupView}
              groupSort={groupSort}
              toggleGroupBy={toggleGroupBy}
              handleGroupModeChange={handleGroupModeChange}
              handleGroupViewChange={handleGroupViewChange}
              setGroupSort={setGroupSort}
              onMultiLayoutChange={(layout) => updatePanelSettings('gallery', { groupMultiLayout: layout })}
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
            onLoadPreset={(filters) => controller.replaceFilters(filters)}
          />
          <div>
            <DynamicFilters
              filters={controller.filters}
              onFiltersChange={(f) => setFilters(f)}
              exclude={['q']}
              showCounts
              extraChips={
                <ActiveSetChip
                  manualSets={manualSets}
                  activeManualSet={activeManualSet}
                  activeManualSetId={activeManualSetId}
                  setActiveManualSetId={setActiveManualSetId}
                  clearActiveManualSetId={clearActiveManualSetId}
                  selectedCount={controller.selectedAssetIds.size}
                  onAddSelected={addSelectedToActiveManualSet}
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

      {/* Scrollable gallery */}
      <div className="flex-1 overflow-auto mt-4">
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
                  gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
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
        ) : layout === 'masonry' ? (
          <MasonryGrid
            items={cardItems}
            rowGap={layoutSettings.rowGap}
            columnGap={layoutSettings.columnGap}
            minColumnWidth={cardSize}
          />
        ) : (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
              rowGap: `${layoutSettings.rowGap}px`,
              columnGap: `${layoutSettings.columnGap}px`,
            }}
          >
            {cardItems}
          </div>
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
