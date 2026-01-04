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

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { MediaCard } from './MediaCard';
import type { MediaCardActions, MediaCardBadgeConfig } from './MediaCard';
import { MasonryGrid } from '../layout/MasonryGrid';
import { useLazyPreview } from '@/hooks/useLazyPreview';
import { Icons } from '@lib/icons';

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
  onOpen?: (asset: T) => void;

  /**
   * Callback when upload is requested for an asset.
   */
  onUpload?: (asset: T) => Promise<void>;

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
   * Badge configuration passed to MediaCard.
   */
  badgeConfig?: MediaCardBadgeConfig;

  /**
   * Actions configuration passed to MediaCard.
   */
  actions?: MediaCardActions;

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
  previewUrl,
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
  lazyLoadRootMargin,
  badgeConfig,
  actions,
  overlayPresetId,
}: {
  previewUrl: string | undefined;
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
  onOpen?: () => void;
  onUpload?: () => Promise<void>;
  lazyLoadRootMargin: string;
  badgeConfig?: MediaCardBadgeConfig;
  actions?: MediaCardActions;
  overlayPresetId?: string;
}) {
  const ref = useLazyPreview(!!previewUrl, loadPreview, {
    rootMargin: lazyLoadRootMargin,
  });

  const providerStatus = uploadStateToProviderStatus(uploadState);

  // Convert string tags to MediaCard's expected format
  const tagObjects = tags.map(tag => ({ slug: tag, display_name: tag }));

  return (
    <div ref={ref}>
      <MediaCard
        id={numericId}
        mediaType={mediaType}
        providerId="local"
        providerAssetId={String(numericId)}
        thumbUrl={previewUrl || ''}
        remoteUrl={previewUrl || ''}
        width={width}
        height={height}
        tags={tagObjects}
        description={description}
        createdAt={createdAt}
        onOpen={onOpen ? () => onOpen() : undefined}
        providerStatus={providerStatus}
        uploadState={uploadState}
        uploadProgress={uploadProgress}
        onUploadClick={onUpload ? async () => { await onUpload(); } : undefined}
        badgeConfig={badgeConfig}
        actions={actions}
        overlayPresetId={overlayPresetId}
      />
    </div>
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
    onOpen,
    onUpload,
    layout = 'masonry',
    cardSize = 'medium',
    rowGap = 16,
    columnGap = 16,
    initialDisplayLimit = 50,
    loadMoreIncrement = 50,
    lazyLoadRootMargin = '400px',
    // groupBy - reserved for future use
    badgeConfig,
    actions,
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

  // Build card items
  const cardItems = useMemo(() => {
    return displayAssets.map((asset) => {
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

      return (
        <GalleryItem
          key={key}
          previewUrl={previewUrl}
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
          onOpen={onOpen ? () => onOpen(asset) : undefined}
          onUpload={onUpload ? () => onUpload(asset) : undefined}
          lazyLoadRootMargin={lazyLoadRootMargin}
          badgeConfig={badgeConfig}
          actions={actions}
          overlayPresetId={overlayPresetId}
        />
      );
    });
  }, [
    displayAssets,
    getAssetKey,
    getPreviewUrl,
    getMediaType,
    getNumericId,
    getDescription,
    getTags,
    getCreatedAt,
    getWidth,
    getHeight,
    getUploadState,
    getUploadProgress,
    loadPreview,
    onOpen,
    onUpload,
    lazyLoadRootMargin,
    badgeConfig,
    actions,
    overlayPresetId,
  ]);

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
        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
      >
        <Icons.chevronDown size={16} />
        Load More ({remainingCount.toLocaleString()} remaining)
      </button>
    </div>
  );

  // Masonry layout
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
}: {
  icon?: 'folder' | 'image' | 'video' | 'search';
  title?: string;
  description?: string;
}) {
  const IconComponent = {
    folder: Icons.folder,
    image: Icons.image,
    video: Icons.video,
    search: Icons.search,
  }[icon];

  return (
    <div className="flex items-center justify-center h-[60vh] text-neutral-500">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <IconComponent size={48} className="text-neutral-400" />
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
