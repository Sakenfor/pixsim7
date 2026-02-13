import { Button, Dropdown } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { enrichAsset, extractFrame, listAssetGroups, uploadAssetToProvider } from '@lib/api/assets';
import type { AssetGroupListResponse, AssetGroupRequest } from '@lib/api/assets';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { Icon, ThemedIcon } from '@lib/icons';
import { getMediaCardPreset } from '@lib/ui/overlay';

import { GalleryToolsPanel } from '@features/gallery';
import type { GalleryToolContext, GalleryAsset } from '@features/gallery/lib/core/types';
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

import type { AssetFilters } from '../hooks/useAssets';
import { useAssetsController } from '../hooks/useAssetsController';
import { useAssetViewer } from '../hooks/useAssetViewer';
import { toggleFavoriteTag } from '../lib/favoriteTag';
import { GROUP_BY_LABELS, GROUP_BY_UI_VALUES, normalizeGroupBySelection } from '../lib/groupBy';
import { normalizeGroupScopeSelection } from '../lib/groupScope';
import { buildAssetSearchRequest } from '../lib/searchParams';
import { fromAssetResponses } from '../models/asset';

import { DynamicFilters } from './DynamicFilters';
import { GroupFolderTile, GroupListRow } from './GroupCards';
import {
  parsePageParam,
  parseGroupParams,
  formatGroupLabel,
  areScopesEqual,
  areGroupByStacksEqual,
  GROUP_PREVIEW_LIMIT,
  GROUP_PAGE_SIZE,
  DEFAULT_GROUP_BY_STACK,
  DEFAULT_GROUP_VIEW,
  DEFAULT_GROUP_SCOPE,
  type AssetGroup,
  type GroupPathEntry,
} from './groupHelpers';
import { PageJumpPopover } from './PageJumpPopover';
import { mediaCardPropsFromAsset } from './shared';


// ---------------------------------------------------------------------------
// ParallelGroupSection — renders one axis in parallel mode
// ---------------------------------------------------------------------------
function ParallelGroupSection({
  axis,
  axisData,
  axisPage,
  groupView,
  cardSize,
  onOpenGroup,
  onPageChange,
}: {
  axis: GalleryGroupBy;
  axisData: {
    groups: AssetGroup[];
    total: number;
    limit: number;
    offset: number;
    loading: boolean;
    error: string | null;
  };
  axisPage: number;
  groupView: GalleryGroupView;
  cardSize: number;
  onOpenGroup: (key: string) => void;
  onPageChange: (page: number) => void;
}) {
  const totalPages = useMemo(() => {
    const limit = Math.max(1, axisData.limit || GROUP_PAGE_SIZE);
    return Math.max(1, Math.ceil(axisData.total / limit));
  }, [axisData.total, axisData.limit]);
  const hasMore = axisData.offset + axisData.groups.length < axisData.total;
  const showFolders = groupView === 'folders';
  const layoutSettings = { rowGap: 12, columnGap: 12 };

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-100 dark:bg-neutral-800/80">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          By {GROUP_BY_LABELS[axis]}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(axisPage - 1)}
            disabled={axisData.loading || axisPage <= 1}
            className="px-2 py-0.5 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            &lsaquo;
          </button>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 px-1">
            {axisPage}/{totalPages}
          </span>
          <button
            onClick={() => onPageChange(axisPage + 1)}
            disabled={axisData.loading || !hasMore}
            className="px-2 py-0.5 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            &rsaquo;
          </button>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 ml-1">
            {axisData.total} groups
          </span>
        </div>
      </div>
      <div className="p-3">
        {axisData.loading ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</div>
        ) : axisData.error ? (
          <div className="text-sm text-red-500">{axisData.error}</div>
        ) : axisData.groups.length > 0 ? (
          showFolders ? (
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
                rowGap: `${layoutSettings.rowGap}px`,
                columnGap: `${layoutSettings.columnGap}px`,
              }}
            >
              {axisData.groups.map((group) => (
                <GroupFolderTile
                  key={group.key}
                  group={group}
                  cardSize={cardSize}
                  onOpen={() => onOpenGroup(group.key)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {axisData.groups.map((group) => (
                <GroupListRow
                  key={group.key}
                  group={group}
                  cardSize={cardSize}
                  onOpen={() => onOpenGroup(group.key)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            No groups for this axis.
          </div>
        )}
      </div>
    </div>
  );
}

interface RemoteGallerySourceProps {
  layout: 'masonry' | 'grid';
  cardSize: number;
  overlayPresetId?: string;
}

export function RemoteGallerySource({ layout, cardSize, overlayPresetId }: RemoteGallerySourceProps) {
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
  const { openGalleryAsset } = useAssetViewer({ source: 'gallery' });
  const [groupData, setGroupData] = useState<AssetGroupListResponse | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [groupMenuRect, setGroupMenuRect] = useState<DOMRect | null>(null);

  // Layout settings (gaps)
  const [layoutSettings] = useState({ rowGap: 16, columnGap: 16 });
  const [showToolsPanel, setShowToolsPanel] = useState(false);

  // Get overlay configuration from preset
  const overlayConfig = useMemo(() => {
    if (!overlayPresetId) return undefined;
    const preset = getMediaCardPreset(overlayPresetId);
    return preset?.configuration;
  }, [overlayPresetId]);

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
    return groupData.groups
      .map((group) => ({
        key: group.key,
        label: formatGroupLabel(labelGroupBy, group.key, group.meta),
        count: group.count,
        previewAssets: fromAssetResponses(group.preview_assets || []),
        latestTimestamp: Date.parse(group.latest_created_at) || 0,
        meta: group.meta,
      }))
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  }, [groupData, currentGroupBy, groupByStack]);
  const groupTotalPages = useMemo(() => {
    if (!groupData) return 1;
    const limit = Math.max(1, groupData.limit || GROUP_PAGE_SIZE);
    return Math.max(1, Math.ceil(groupData.total / limit));
  }, [groupData]);
  const groupHasMore = useMemo(() => {
    if (!groupData) return false;
    return groupData.offset + groupData.groups.length < groupData.total;
  }, [groupData]);
  const activeGroupEntry = useMemo<GroupPathEntry | null>(
    () => (groupPath.length > 0 ? groupPath[groupPath.length - 1] : null),
    [groupPath],
  );
  const activeGroupLabel = useMemo(() => {
    if (!activeGroupEntry) return null;
    return formatGroupLabel(activeGroupEntry.groupBy, activeGroupEntry.groupKey);
  }, [activeGroupEntry]);
  const groupBreadcrumb = useMemo(() => {
    if (groupPath.length === 0) return null;
    return groupPath
      .map((entry) => formatGroupLabel(entry.groupBy, entry.groupKey))
      .join(' / ');
  }, [groupPath]);
  const isParallelMode = groupMode === 'multi' && groupMultiLayout === 'parallel' && groupByStack.length > 1;
  const showParallelGroups = hasGrouping && isParallelMode && groupPath.length === 0;
  const showGroupOverview = hasGrouping && !showParallelGroups && groupPath.length < groupByStack.length;
  const showGroupFolders = showGroupOverview && groupView === 'folders';
  const visibleAssets = useMemo(() => {
    if (showGroupOverview) return [];
    return controller.assets;
  }, [controller.assets, showGroupOverview]);
  const groupSummary = useMemo(() => {
    if (groupByStack.length === 0) return 'Grouping: None';
    return `Grouping: ${groupByStack.map((value) => GROUP_BY_LABELS[value]).join(' > ')}`;
  }, [groupByStack]);

  // ---------------------------------------------------------------------------
  // Parallel mode state & data fetching
  // ---------------------------------------------------------------------------
  type ParallelAxisData = {
    groups: AssetGroup[];
    total: number;
    limit: number;
    offset: number;
    loading: boolean;
    error: string | null;
  };
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
          const parsedGroups: AssetGroup[] = result.groups
            .map((g) => ({
              key: g.key,
              label: formatGroupLabel(axis, g.key, g.meta),
              count: g.count,
              previewAssets: fromAssetResponses(g.preview_assets || []),
              latestTimestamp: Date.parse(g.latest_created_at) || 0,
              meta: g.meta,
            }))
            .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
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
  const toggleAssetSelection = (assetId: number | string) => {
    const idStr = String(assetId);
    controller.toggleAssetSelection(idStr);

    const newSelection = new Set(controller.selectedAssetIds);
    if (newSelection.has(idStr)) {
      newSelection.add(idStr);
    } else {
      newSelection.delete(idStr);
    }
    if (newSelection.size > 0 && !showToolsPanel) {
      setShowToolsPanel(true);
    }
  };

  // Render cards
  const cardItems = visibleAssets.map((a) => {
    const isSelected = controller.selectedAssetIds.has(String(a.id));

    if (controller.isSelectionMode) {
      return (
        <div key={a.id} className="relative group rounded-md">
          <div className="opacity-75 group-hover:opacity-100 transition-opacity">
            <MediaCard
              {...mediaCardPropsFromAsset(a)}
              onOpen={undefined}
              onToggleFavorite={() => toggleFavoriteTag(a)}
              actions={controller.getAssetActions(a)}
              contextMenuAsset={a}
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
              <ThemedIcon name="check" size={14} variant="default" />
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
            toggleAssetSelection(a.id);
          }
        }}
      >
        {(() => {
          const baseActions = controller.getAssetActions(a);
          const filterProviderId = Array.isArray(controller.filters.provider_id)
            ? controller.filters.provider_id.length === 1
              ? controller.filters.provider_id[0]
              : undefined
            : controller.filters.provider_id || undefined;

          const actions = {
            ...baseActions,
            onReupload: async () => {
              let targetProviderId = filterProviderId;

              if (!targetProviderId) {
                if (!providers.length) {
                  alert('No providers configured.');
                  return;
                }
                const options = providers
                  .map((p) => `${p.id} (${p.name})`)
                  .join('\n');
                const defaultId = a.providerId || providers[0].id;
                const input = window.prompt(
                  `Upload to which provider?\n${options}`,
                  defaultId,
                );
                if (!input) return;
                targetProviderId = input.trim();
              }

              await controller.reuploadAsset(a, targetProviderId);
            },
            onExtractLastFrameAndUpload: async () => {
              if (a.mediaType !== 'video') return;
              const duration = a.durationSec || 0;
              const timestamp = Math.max(0, duration - (1 / 30));
              try {
                const frameAsset = await extractFrame({
                  video_asset_id: a.id,
                  timestamp,
                });
                const targetProvider = a.providerId || 'pixverse';
                await uploadAssetToProvider(frameAsset.id, targetProvider);
                resetAssets();
              } catch (err: any) {
                const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
                alert(`Failed to extract/upload last frame: ${detail}`);
              }
            },
            onExtractFrame: async (_id: number, timestamp: number) => {
              if (a.mediaType !== 'video') return;
              try {
                // Don't pass provider_id - let backend decide based on settings
                await extractFrame({
                  video_asset_id: a.id,
                  timestamp,
                });
                resetAssets();
              } catch (err: any) {
                const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
                alert(`Failed to extract frame: ${detail}`);
              }
            },
            onExtractLastFrame: async () => {
              if (a.mediaType !== 'video') return;
              try {
                // Don't pass provider_id - let backend decide based on settings
                await extractFrame({
                  video_asset_id: a.id,
                  last_frame: true,
                });
                resetAssets();
              } catch (err: any) {
                const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
                alert(`Failed to extract last frame: ${detail}`);
              }
            },
            onEnrichMetadata: async () => {
              try {
                const result = await enrichAsset(a.id);
                if (result.enriched) {
                  resetAssets();
                } else {
                  alert(result.message || 'No metadata to refresh');
                }
              } catch (err: any) {
                const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
                alert(`Failed to refresh metadata: ${detail}`);
              }
            },
          };

          return (
            <MediaCard
              {...mediaCardPropsFromAsset(a)}
              onOpen={() => openGalleryAsset(a, controller.assets)}
              onToggleFavorite={() => toggleFavoriteTag(a)}
              actions={actions}
              contextMenuAsset={a}
              contextMenuSelection={selectedAssets}
              overlayConfig={overlayConfig}
              overlayPresetId={overlayPresetId}
            />
          );
        })()}
      </div>
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Fixed filters section */}
      <div className="flex-shrink-0 space-y-4">
        {controller.error && <div className="text-red-600 text-sm">{controller.error}</div>}

        <div className="bg-neutral-50 dark:bg-neutral-800 p-3 rounded border border-neutral-200 dark:border-neutral-700">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px] max-w-[300px]">
              <input
                placeholder="Search tags, description..."
                className="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent"
                value={controller.filters.q}
                onChange={(e) => setFilters({ q: e.target.value })}
              />
            </div>

            {/* Page-based pagination controls */}



            {showParallelGroups ? (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {groupByStack.length} group axes
              </span>
            ) : showGroupOverview ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToGroupPage(groupPage - 1)}
                  disabled={groupLoading || groupPage <= 1}
                  className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Previous group page"
                >
                  &lsaquo;
                </button>
                <PageJumpPopover
                  currentPage={groupPage}
                  totalPages={groupTotalPages}
                  loading={groupLoading}
                  onGoToPage={goToGroupPage}
                />
                <button
                  onClick={() => goToGroupPage(groupPage + 1)}
                  disabled={groupLoading || !groupHasMore}
                  className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Next group page"
                >
                  &rsaquo;
                </button>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-1">
                  {groupData ? `${groupData.groups.length} groups` : '0 groups'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(controller.currentPage - 1)}
                  disabled={controller.loading || controller.currentPage <= 1}
                  className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Previous page"
                >
                  &lsaquo;
                </button>
                <PageJumpPopover
                  currentPage={controller.currentPage}
                  totalPages={controller.totalPages}
                  hasMore={controller.hasMore}
                  loading={controller.loading}
                  onGoToPage={goToPage}
                />
                <button
                  onClick={() => goToPage(controller.currentPage + 1)}
                  disabled={controller.loading || !controller.hasMore}
                  className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Next page"
                >
                  &rsaquo;
                </button>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-1">
                  {controller.assets.length} items
                </span>
              </div>
            )}

            {/* Grouping */}
            <div className="flex items-center gap-2">
              <button
                ref={groupMenuAnchorRef}
                type="button"
                onClick={() => setGroupMenuOpen((prev) => !prev)}
                title={groupSummary}
                aria-label={groupSummary}
                className={`relative inline-flex h-9 w-9 items-center justify-center rounded border transition-colors ${
                  hasGrouping
                    ? 'bg-accent/10 border-accent-muted text-accent'
                    : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-accent-muted'
                }`}
              >
                <Icon
                  name="layers"
                  size={16}
                  className={hasGrouping ? 'text-accent' : 'text-neutral-600 dark:text-neutral-300'}
                />
                {groupByStack.length > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] px-1 rounded-full bg-accent text-accent-text">
                    {groupByStack.length}
                  </span>
                )}
              </button>
              {groupMenuOpen && groupMenuRect && (
                <Dropdown
                  isOpen={groupMenuOpen}
                  onClose={() => setGroupMenuOpen(false)}
                  positionMode="fixed"
                  anchorPosition={{
                    x: Math.max(
                      8,
                      Math.min(
                        groupMenuRect.left,
                        window.innerWidth - 320 - 8
                      )
                    ),
                    y: groupMenuRect.bottom + 8,
                  }}
                  minWidth="280px"
                  className="max-w-[360px]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        Grouping
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleGroupBy('none')}
                        className="text-[11px] text-accent hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          Mode
                        </span>
                        <div className="flex items-center gap-1">
                          {(['single', 'multi'] as GalleryGroupMode[]).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => handleGroupModeChange(mode)}
                              className={`px-2 py-1 text-xs rounded border transition-colors ${
                                groupMode === mode
                                  ? 'bg-neutral-900 border-neutral-900 text-white dark:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-900'
                                  : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-accent-muted'
                              }`}
                            >
                              {mode === 'single' ? 'Single' : 'Multi'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {groupMode === 'multi' && groupByStack.length > 1 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            Layout
                          </span>
                          <div className="flex items-center gap-1">
                            {(['stack', 'parallel'] as GalleryGroupMultiLayout[]).map((layout) => (
                              <button
                                key={layout}
                                type="button"
                                onClick={() => updatePanelSettings('gallery', { groupMultiLayout: layout })}
                                className={`px-2 py-1 text-xs rounded border transition-colors ${
                                  groupMultiLayout === layout
                                    ? 'bg-neutral-900 border-neutral-900 text-white dark:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-900'
                                    : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-accent-muted'
                                }`}
                              >
                                {layout === 'stack' ? 'Stack' : 'Parallel'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleGroupBy('none')}
                          className={`px-2 py-1 text-xs rounded border transition-colors ${
                            groupByStack.length === 0
                              ? 'bg-accent border-accent text-accent-text'
                              : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:border-accent-muted'
                          }`}
                        >
                          None
                        </button>
                        {GROUP_BY_UI_VALUES.map((value) => {
                          const index = groupByStack.indexOf(value);
                          const selected = index >= 0;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => toggleGroupBy(value)}
                              className={`px-2 py-1 text-xs rounded border transition-colors inline-flex items-center gap-1 ${
                                selected
                                  ? 'bg-accent border-accent text-accent-text'
                                  : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:border-accent-muted'
                              }`}
                            >
                              <span>{GROUP_BY_LABELS[value]}</span>
                              {groupMode === 'multi' && selected && (
                                <span className="text-[10px] px-1 rounded-full bg-white/20">
                                  {index + 1}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        View
                      </span>
                      <select
                        className="flex-1 px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent"
                        value={groupView}
                        onChange={(e) => handleGroupViewChange(e.target.value as GalleryGroupView)}
                        disabled={!hasGrouping}
                      >
                        <option value="inline">List</option>
                        <option value="folders">Folders</option>
                        <option value="panel" disabled>
                          Panel (soon)
                        </option>
                      </select>
                    </div>
                  </div>
                </Dropdown>
              )}
            </div>

            {/* Divider */}
            <div className="h-6 w-px bg-neutral-300 dark:bg-neutral-600" />

            {/* Sort */}
            <select
              className="px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent"
              value={controller.filters.sort}
              onChange={(e) => setFilters({ sort: e.target.value as any })}
            >
              <option value="new">Newest First</option>
              <option value="old">Oldest First</option>
              <option value="alpha">A-Z</option>
            </select>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Filters</span>
            <div className="flex-1 min-w-0">
              <DynamicFilters
                filters={controller.filters}
                onFiltersChange={(f) => setFilters(f)}
                exclude={['q']}
                showCounts
              />
            </div>
          </div>
        </div>

        {/* Gallery Tools Panel */}
        {showToolsPanel && !controller.isSelectionMode && (
          <div className="mb-4">
            <GalleryToolsPanel context={galleryContext} surfaceId="assets-default" />
          </div>
        )}
      </div>

      {/* Scrollable gallery */}
      <div className="flex-1 overflow-auto mt-4">
        {hasGrouping && groupPath.length > 0 && (
          <div className="mb-4 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{groupBreadcrumb ?? activeGroupLabel}</span>
              <span className="text-neutral-500 dark:text-neutral-400">
                {controller.assets.length} items
              </span>
            </div>
            <button
              type="button"
              onClick={clearGroup}
              className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors"
            >
              Back
            </button>
          </div>
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
            showGroupFolders ? (
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
            )
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
          <div className="pt-4 pb-8 flex justify-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToGroupPage(groupPage - 1)}
                disabled={groupLoading || groupPage <= 1}
                className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-sm text-neutral-600 dark:text-neutral-400 px-2">
                Group page {groupPage} of {groupTotalPages}
              </span>
              <button
                onClick={() => goToGroupPage(groupPage + 1)}
                disabled={groupLoading || !groupHasMore}
                className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="pt-4 pb-8 flex justify-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(controller.currentPage - 1)}
                disabled={controller.loading || controller.currentPage <= 1}
                className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-sm text-neutral-600 dark:text-neutral-400 px-2">
                Page {controller.currentPage} of {controller.hasMore ? `${controller.totalPages}+` : controller.totalPages}
              </span>
              <button
                onClick={() => goToPage(controller.currentPage + 1)}
                disabled={controller.loading || !controller.hasMore}
                className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
