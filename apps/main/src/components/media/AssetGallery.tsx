/**
 * AssetGallery Component
 *
 * A reusable gallery component for displaying assets with lazy-loaded previews.
 * Supports both local and remote assets, various layouts, and consistent
 * loading/status behavior across the application.
 *
 * Features:
 * - Lazy preview loading via IntersectionObserver
 * - Masonry and grid layout options
 * - Pagination with "Load More" button
 * - Upload status badges and progress
 * - Consistent spinner/placeholder behavior
 * - Grouping support (optional)
 *
 * @example
 * ```tsx
 * <AssetGallery
 *   assets={myAssets}
 *   getAssetKey={(asset) => asset.id}
 *   getPreviewUrl={(asset) => previews[asset.id]}
 *   loadPreview={(asset) => loadPreviewForAsset(asset)}
 *   onOpen={(asset) => openViewer(asset)}
 *   layout="masonry"
 *   cardSize={260}
 * />
 * ```
 */

import type { ReactNode } from 'react';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';

import { Icons } from '@lib/icons';
import type { AssetModel } from '@features/assets';

import { useLazyPreview } from '@/hooks/useLazyPreview';

import { MasonryGrid } from '../layout/MasonryGrid';

import { MediaCard } from './MediaCard';
import type { MediaCardActions, MediaCardBadgeConfig } from './MediaCard';


/**
 * Upload state for an asset.
 */
export type AssetUploadState = 'idle' | 'uploading' | 'success' | 'error';

/**
 * Size presets for gallery cards.
 */
export type GalleryCardSizePreset = 'small' | 'medium' | 'large' | 'custom';

const CARD_SIZE_PRESETS: Record<Exclude<GalleryCardSizePreset, 'custom'>, number> = {
  small: 180,
  medium: 260,
  large: 360,
};

const DEFAULT_RESOLVE_PREVIEW_URL = (_asset: unknown, url: string | undefined) => url;

/**
 * Descriptor for a single group section produced by `groupBy`.
 */
export interface GroupSection {
  key: string;
  label: string;
  count: number;
}

/**
 * Props for the AssetGallery component.
 *
 * @typeParam T - The type of asset objects in the gallery
 */
export interface AssetGalleryProps<T> {
  /**
   * Array of assets to display in the gallery.
   */
  assets: T[];

  /**
   * Function to get a unique key for each asset.
   * Used for React keys and preview caching.
   */
  getAssetKey: (asset: T) => string;

  /**
   * Function to get the preview URL for an asset.
   * Return undefined if the preview hasn't been loaded yet.
   */
  getPreviewUrl: (asset: T) => string | undefined;

  /**
   * Optional resolver to post-process preview URLs (e.g., auth-aware local previews).
   * Called inside GalleryItem so it may use hooks.
   */
  resolvePreviewUrl?: (asset: T, previewUrl: string | undefined) => string | undefined;

  /**
   * Async function to load the preview for an asset.
   * Called when the asset enters the viewport.
   */
  loadPreview: (asset: T) => Promise<void>;

  /**
   * Function to get the media type for an asset.
   * Defaults to 'image' if not provided.
   */
  getMediaType?: (asset: T) => 'video' | 'image' | 'audio' | '3d_model';

  /**
   * Function to get a numeric ID for the MediaCard.
   * If not provided, a hash of the asset key is used.
   */
  getNumericId?: (asset: T) => number;

  /**
   * Function to get asset description/name.
   */
  getDescription?: (asset: T) => string | undefined;

  /**
   * Function to get asset tags.
   */
  getTags?: (asset: T) => string[];

  /**
   * Function to get the creation date.
   */
  getCreatedAt?: (asset: T) => string;

  /**
   * Function to get asset width in pixels.
   */
  getWidth?: (asset: T) => number | undefined;

  /**
   * Function to get asset height in pixels.
   */
  getHeight?: (asset: T) => number | undefined;

  /**
   * Function to get the upload state for an asset.
   */
  getUploadState?: (asset: T) => AssetUploadState;

  /**
   * Function to get upload progress (0-100).
   */
  getUploadProgress?: (asset: T) => number;

  /**
   * Callback when an asset is opened/clicked.
   */
  onOpen?: (asset: T, resolvedPreviewUrl?: string) => void;

  /**
   * Optional adapter for rendering MediaCard in asset-first mode.
   * Use this when the source item is not already an AssetModel but can be
   * converted to one (e.g. local-folder assets with upload metadata).
   */
  getMediaCardAsset?: (asset: T) => AssetModel;

  /**
   * Callback when upload is requested for an asset.
   */
  onUpload?: (asset: T) => Promise<void>;

  /**
   * Function to get favorite state for an asset.
   */
  getIsFavorite?: (asset: T) => boolean;

  /**
   * Callback when favorite toggle is requested.
   */
  onToggleFavorite?: (asset: T) => Promise<void> | void;

  /**
   * Upload to a specific provider (used by right-click menu in upload widget).
   * providerId === 'library' means library-only upload.
   */
  onUploadToProvider?: (asset: T, providerId: string) => Promise<void>;

  /**
   * Callback when an asset is selected (for multi-select mode).
   */
  onSelect?: (asset: T, selected: boolean) => void;

  /**
   * Set of selected asset keys (for multi-select mode).
   */
  selectedKeys?: Set<string>;

  /**
   * Layout mode: 'masonry' for variable heights, 'grid' for uniform cells.
   * Default: 'masonry'
   */
  layout?: 'masonry' | 'grid';

  /**
   * Card size preset or custom size in pixels.
   * Default: 'medium' (260px)
   */
  cardSize?: GalleryCardSizePreset | number;

  /**
   * Gap between rows in pixels.
   * Default: 16
   */
  rowGap?: number;

  /**
   * Gap between columns in pixels.
   * Default: 16
   */
  columnGap?: number;

  /**
   * Initial number of items to display.
   * Default: 50
   */
  initialDisplayLimit?: number;

  /**
   * Number of items to add when "Load More" is clicked.
   * Default: 50
   */
  loadMoreIncrement?: number;

  /**
   * Root margin for lazy loading IntersectionObserver.
   * Default: '400px'
   */
  lazyLoadRootMargin?: string;

  /**
   * Optional grouping function. If provided, assets will be grouped
   * and displayed with group headers.
   */
  groupBy?: (asset: T) => string;

  /**
   * Resolve display label for a group key. Used when `groupBy` is set.
   */
  getGroupLabel?: (groupKey: string) => string;

  /**
   * Custom renderer for group headers. Receives the group key, label, and item count.
   * Falls back to a default header when not provided.
   */
  renderGroupHeader?: (key: string, label: string, count: number) => ReactNode;

  /**
   * Optional sort for group sections before rendering.
   */
  sortGroupSections?: (groups: GroupSection[]) => GroupSection[];

  /**
   * When true, grouped sections are collapsible (click header to toggle).
   * All groups start expanded by default.
   */
  collapsibleGroups?: boolean;

  /**
   * Function to get the hash status for an asset.
   * Used for the primary icon ring to indicate duplicate/unique/hashing state.
   */
  getHashStatus?: (asset: T) => 'unique' | 'duplicate' | 'hashing' | undefined;

  /**
   * Badge configuration passed to MediaCard.
   */
  badgeConfig?: MediaCardBadgeConfig;

  /**
   * Actions configuration passed to MediaCard.
   */
  actions?: MediaCardActions;

  /**
   * Optional per-asset actions override.
   * When provided, this takes precedence over the static `actions` prop.
   */
  getActions?: (asset: T) => MediaCardActions | undefined;

  /**
   * Overlay preset ID for MediaCard.
   */
  overlayPresetId?: string;

  /**
   * Custom empty state component.
   */
  emptyState?: React.ReactNode;

  /**
   * Show asset count indicator above the gallery.
   * Default: true
   */
  showAssetCount?: boolean;

  /**
   * Custom class name for the container.
   */
  className?: string;
}

/**
 * Generate a numeric hash from a string key.
 * Used as a fallback for MediaCard's numeric ID requirement.
 */
function hashStringToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

/**
 * Convert upload state to provider status for MediaCard.
 */
function uploadStateToProviderStatus(
  state: AssetUploadState | undefined
): 'ok' | 'local_only' | undefined {
  if (state === 'success') return 'ok';
  if (state === 'error') return 'local_only';
  return undefined;
}

/**
 * Internal component for a single gallery item with lazy loading.
 */
function GalleryItem({
  asset,
  previewUrl,
  resolvePreviewUrl,
  loadPreview,
  mediaType,
  numericId,
  description,
  tags,
  createdAt,
  width,
  height,
  uploadState,
  uploadProgress,
  onOpen,
  onUpload,
  onUploadToProvider,
  isFavorite,
  onToggleFavorite,
  hashStatus,
  lazyLoadRootMargin,
  badgeConfig,
  actions,
  overlayPresetId,
  mediaCardAsset,
}: {
  asset: unknown;
  previewUrl: string | undefined;
  resolvePreviewUrl: (asset: unknown, previewUrl: string | undefined) => string | undefined;
  loadPreview: () => Promise<void>;
  mediaType: 'video' | 'image' | 'audio' | '3d_model';
  numericId: number;
  description?: string;
  tags: string[];
  createdAt: string;
  width?: number;
  height?: number;
  uploadState?: AssetUploadState;
  uploadProgress?: number;
  onOpen?: (resolvedPreviewUrl?: string) => void;
  onUpload?: () => Promise<void>;
  onUploadToProvider?: (id: number, providerId: string) => Promise<void>;
  isFavorite?: boolean;
  onToggleFavorite?: () => Promise<void> | void;
  hashStatus?: 'unique' | 'duplicate' | 'hashing';
  lazyLoadRootMargin: string;
  badgeConfig?: MediaCardBadgeConfig;
  actions?: MediaCardActions;
  overlayPresetId?: string;
  mediaCardAsset?: AssetModel;
}) {
  const resolvedPreviewUrl = resolvePreviewUrl(asset, previewUrl);
  const ref = useLazyPreview(!!previewUrl, loadPreview, {
    rootMargin: lazyLoadRootMargin,
  });

  const providerStatus = uploadStateToProviderStatus(uploadState);

  // Convert string tags to MediaCard's expected format
  const tagObjects = tags.map(tag => ({ slug: tag, display_name: tag }));

  if (mediaCardAsset) {
    return (
      <div ref={ref}>
        <MediaCard
          asset={mediaCardAsset}
          onOpen={onOpen ? () => onOpen(resolvedPreviewUrl) : undefined}
          hashStatus={hashStatus}
          uploadState={uploadState}
          uploadProgress={uploadProgress}
          onUploadClick={onUpload ? async () => { await onUpload(); } : undefined}
          onUploadToProvider={onUploadToProvider}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          badgeConfig={badgeConfig}
          actions={actions}
          overlayPresetId={overlayPresetId}
        />
      </div>
    );
  }

  return (
    <div ref={ref}>
      <MediaCard
        id={numericId}
        mediaType={mediaType}
        providerId="local"
        providerAssetId={String(numericId)}
        thumbUrl={resolvedPreviewUrl || ''}
        remoteUrl={mediaType !== 'video' ? (resolvedPreviewUrl || '') : ''}
        width={width}
        height={height}
        tags={tagObjects}
        description={description}
        createdAt={createdAt}
        onOpen={onOpen ? () => onOpen(resolvedPreviewUrl) : undefined}
        providerStatus={providerStatus}
        hashStatus={hashStatus}
        uploadState={uploadState}
        uploadProgress={uploadProgress}
        onUploadClick={onUpload ? async () => { await onUpload(); } : undefined}
        onUploadToProvider={onUploadToProvider}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        badgeConfig={badgeConfig}
        actions={actions}
        overlayPresetId={overlayPresetId}
      />
    </div>
  );
}

/**
 * Default group header matching LocalFoldersContent's styling.
 * Supports an optional collapsible toggle.
 */
function DefaultGroupHeader({
  label,
  count,
  collapsible,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const Tag = collapsible ? 'button' : 'header';
  return (
    <Tag
      type={collapsible ? 'button' : undefined}
      onClick={collapsible ? onToggle : undefined}
      className={`flex items-center justify-between pb-1 border-b border-neutral-200 dark:border-neutral-700 w-full text-left ${
        collapsible ? 'cursor-pointer select-none hover:bg-neutral-50 dark:hover:bg-neutral-800/40 -mx-1 px-1 rounded transition-colors' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {collapsible && (
          <Icons.chevronRight
            size={14}
            className={`flex-shrink-0 text-neutral-400 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
          />
        )}
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 truncate pr-3">
          {label}
        </h3>
      </div>
      <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
        {count.toLocaleString()} items
      </span>
    </Tag>
  );
}

/**
 * AssetGallery - A reusable gallery component for displaying assets.
 *
 * Provides consistent lazy-loading, status badges, and layout behavior
 * for any asset type (local files, remote media, etc.).
 */
export function AssetGallery<T>(props: AssetGalleryProps<T>) {
  const {
    assets,
    getAssetKey,
    getPreviewUrl,
    resolvePreviewUrl = DEFAULT_RESOLVE_PREVIEW_URL,
    loadPreview,
    getMediaType = () => 'image' as const,
    getNumericId,
    getDescription,
    getTags = () => [],
    getCreatedAt = () => new Date().toISOString(),
    getWidth,
    getHeight,
    getUploadState,
    getUploadProgress,
    getIsFavorite,
    getHashStatus,
    onOpen,
    getMediaCardAsset,
    onUpload,
    onUploadToProvider,
    onToggleFavorite,
    layout = 'masonry',
    cardSize = 'medium',
    rowGap = 16,
    columnGap = 16,
    initialDisplayLimit = 50,
    loadMoreIncrement = 50,
    lazyLoadRootMargin = '400px',
    groupBy,
    getGroupLabel,
    renderGroupHeader,
    sortGroupSections,
    collapsibleGroups,
    badgeConfig,
    actions,
    getActions,
    overlayPresetId,
    emptyState,
    showAssetCount = true,
    className,
  } = props;

  // Resolve card size
  const resolvedCardSize = typeof cardSize === 'number'
    ? cardSize
    : CARD_SIZE_PRESETS[cardSize];

  // Pagination state
  const [displayLimit, setDisplayLimit] = useState(initialDisplayLimit);
  const prevAssetsLengthRef = useRef(assets.length);

  // Reset pagination when assets array changes significantly
  useEffect(() => {
    // Only reset if the assets array shrank (e.g., folder changed)
    if (assets.length < prevAssetsLengthRef.current) {
      setDisplayLimit(initialDisplayLimit);
    }
    prevAssetsLengthRef.current = assets.length;
  }, [assets.length, initialDisplayLimit]);

  // Apply pagination
  const displayAssets = useMemo(
    () => assets.slice(0, displayLimit),
    [assets, displayLimit]
  );

  const hasMore = assets.length > displayLimit;
  const remainingCount = assets.length - displayLimit;

  const loadMore = useCallback(() => {
    setDisplayLimit((prev) => prev + loadMoreIncrement);
  }, [loadMoreIncrement]);

  // Build a single GalleryItem element for an asset (shared by flat + grouped paths)
  const buildCardElement = useCallback((asset: T) => {
    const key = getAssetKey(asset);
    const previewUrl = getPreviewUrl(asset);
    const mediaType = getMediaType(asset);
    const numericId = getNumericId
      ? getNumericId(asset)
      : hashStringToNumber(key);
    const description = getDescription?.(asset);
    const tags = getTags(asset);
    const createdAt = getCreatedAt(asset);
    const width = getWidth?.(asset);
    const height = getHeight?.(asset);
    const uploadState = getUploadState?.(asset);
    const uploadProgress = getUploadProgress?.(asset);
    const isFavorite = getIsFavorite?.(asset);
    const hashStatus = getHashStatus?.(asset);
    const assetActions = getActions?.(asset) ?? actions;
    const mediaCardAsset = getMediaCardAsset?.(asset);

    return (
      <GalleryItem
        key={key}
        asset={asset}
        previewUrl={previewUrl}
        resolvePreviewUrl={resolvePreviewUrl}
        loadPreview={() => loadPreview(asset)}
        mediaType={mediaType}
        numericId={numericId}
        description={description}
        tags={tags}
        createdAt={createdAt}
        width={width}
        height={height}
        uploadState={uploadState}
        uploadProgress={uploadProgress}
        isFavorite={isFavorite}
        hashStatus={hashStatus}
        mediaCardAsset={mediaCardAsset}
        onOpen={onOpen ? (resolvedUrl) => onOpen(asset, resolvedUrl) : undefined}
        onUpload={onUpload ? () => onUpload(asset) : undefined}
        onUploadToProvider={onUploadToProvider
          ? (_id, pid) => onUploadToProvider(asset, pid)
          : undefined}
        onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(asset) : undefined}
        lazyLoadRootMargin={lazyLoadRootMargin}
        badgeConfig={badgeConfig}
        actions={assetActions}
        overlayPresetId={overlayPresetId}
      />
    );
  }, [
    getAssetKey,
    getPreviewUrl,
    resolvePreviewUrl,
    getMediaType,
    getNumericId,
    getDescription,
    getTags,
    getCreatedAt,
    getWidth,
    getHeight,
    getUploadState,
    getUploadProgress,
    getIsFavorite,
    getHashStatus,
    loadPreview,
    onOpen,
    getMediaCardAsset,
    onUpload,
    onUploadToProvider,
    onToggleFavorite,
    lazyLoadRootMargin,
    badgeConfig,
    actions,
    getActions,
    overlayPresetId,
  ]);

  // Render a grid/masonry block from pre-built card elements
  const renderGrid = useCallback((cards: React.ReactElement[]) => {
    if (layout === 'masonry') {
      return (
        <MasonryGrid
          items={cards}
          rowGap={rowGap}
          columnGap={columnGap}
          minColumnWidth={resolvedCardSize}
        />
      );
    }
    return (
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${resolvedCardSize}px, 1fr))`,
          rowGap: `${rowGap}px`,
          columnGap: `${columnGap}px`,
        }}
      >
        {cards}
      </div>
    );
  }, [layout, rowGap, columnGap, resolvedCardSize]);

  // ---------- Grouped rendering ----------

  const groupedSections = useMemo(() => {
    if (!groupBy) return null;

    // Group displayAssets into Map (preserves insertion order)
    const groupMap = new Map<string, T[]>();
    for (const asset of displayAssets) {
      const key = groupBy(asset);
      const existing = groupMap.get(key);
      if (existing) {
        existing.push(asset);
      } else {
        groupMap.set(key, [asset]);
      }
    }

    let sections: GroupSection[] = Array.from(groupMap.entries()).map(([key, items]) => ({
      key,
      label: getGroupLabel ? getGroupLabel(key) : key,
      count: items.length,
    }));

    if (sortGroupSections) {
      sections = sortGroupSections(sections);
    }

    return { groupMap, sections };
  }, [groupBy, displayAssets, getGroupLabel, sortGroupSections]);

  // ---------- Build card items (flat path only) ----------

  const flatCardItems = useMemo(() => {
    if (groupBy) return null; // skip work when grouped
    return displayAssets.map(buildCardElement);
  }, [groupBy, displayAssets, buildCardElement]);

  // Empty state
  if (assets.length === 0) {
    if (emptyState) {
      return <>{emptyState}</>;
    }
    return (
      <div className="text-center py-16 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
        <div className="mb-4 flex justify-center">
          <Icons.image size={64} className="text-neutral-400" />
        </div>
        <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-2">
          No assets to display
        </p>
      </div>
    );
  }

  // Asset count indicator
  const assetCountIndicator = showAssetCount && (
    <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
      Showing {displayAssets.length.toLocaleString()} of {assets.length.toLocaleString()} items
    </div>
  );

  // Load more button
  const loadMoreButton = hasMore && (
    <div className="flex justify-center py-6">
      <button
        onClick={loadMore}
        className="px-6 py-2 bg-accent hover:bg-accent-hover text-accent-text rounded-lg font-medium transition-colors flex items-center gap-2"
      >
        <Icons.chevronDown size={16} />
        Load More ({remainingCount.toLocaleString()} remaining)
      </button>
    </div>
  );

  // ---------- Collapse state for groups ----------
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ---------- Grouped layout ----------

  if (groupedSections) {
    const { groupMap, sections } = groupedSections;
    return (
      <div className={className}>
        {assetCountIndicator}
        <div className="space-y-5">
          {sections.map(({ key, label, count }) => {
            const groupAssets = groupMap.get(key);
            if (!groupAssets || groupAssets.length === 0) return null;
            const isCollapsed = collapsibleGroups && collapsedGroups.has(key);
            const cards = isCollapsed ? null : groupAssets.map(buildCardElement);
            return (
              <section key={key} className="space-y-2">
                {renderGroupHeader
                  ? renderGroupHeader(key, label, count)
                  : (
                    <DefaultGroupHeader
                      label={label}
                      count={count}
                      collapsible={collapsibleGroups}
                      collapsed={isCollapsed}
                      onToggle={() => toggleGroupCollapse(key)}
                    />
                  )}
                {cards && renderGrid(cards)}
              </section>
            );
          })}
        </div>
        {loadMoreButton}
      </div>
    );
  }

  // ---------- Flat layouts ----------

  const cardItems = flatCardItems!;

  if (layout === 'masonry') {
    return (
      <div className={className}>
        {assetCountIndicator}
        <MasonryGrid
          items={cardItems}
          rowGap={rowGap}
          columnGap={columnGap}
          minColumnWidth={resolvedCardSize}
        />
        {loadMoreButton}
      </div>
    );
  }

  // Grid layout
  return (
    <div className={className}>
      {assetCountIndicator}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${resolvedCardSize}px, 1fr))`,
          rowGap: `${rowGap}px`,
          columnGap: `${columnGap}px`,
        }}
      >
        {cardItems}
      </div>
      {loadMoreButton}
    </div>
  );
}

/**
 * Default empty state component for galleries.
 * Can be used as a reference or passed directly to AssetGallery.
 */
export function GalleryEmptyState({
  icon = 'folder',
  title = 'No files found',
  description,
  iconClassName,
}: {
  icon?: 'folder' | 'image' | 'video' | 'search' | 'cloud' | 'loader';
  title?: string;
  description?: string;
  iconClassName?: string;
}) {
  const IconComponent = {
    folder: Icons.folder,
    image: Icons.image,
    video: Icons.video,
    search: Icons.search,
    cloud: Icons.cloud,
    loader: Icons.loader,
  }[icon];

  return (
    <div className="flex items-center justify-center h-[60vh] text-neutral-500">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <IconComponent size={48} className={iconClassName ?? 'text-neutral-400'} />
        </div>
        <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-2">
          {title}
        </p>
        {description && (
          <p className="text-sm text-neutral-500">{description}</p>
        )}
      </div>
    </div>
  );
}
