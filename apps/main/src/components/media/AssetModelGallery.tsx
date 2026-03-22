/**
 * AssetModelGallery — thin wrapper around AssetGallery<AssetModel>
 * that pre-wires all data-extraction callbacks.
 *
 * Consumers pass `AssetModel[]` + action callbacks + layout config.
 * No need to provide getDescription, getTags, getMediaType, etc. —
 * they're read directly from the AssetModel.
 *
 * For local folder assets, convert via `localAssetToAssetModel()` first,
 * then pass the result here alongside preview/upload overrides.
 */
import type { ReactNode } from 'react';

import type { AssetModel } from '@features/assets';
import { getAssetDisplayUrls } from '@features/assets';

import {
  AssetGallery,
  type AssetUploadState,
  type GalleryCardSizePreset,
  type GroupSection,
} from './AssetGallery';
import type { MediaCardActions, MediaCardBadgeConfig } from './MediaCard';

export interface AssetModelGalleryProps {
  assets: AssetModel[];

  // --- Preview management (required — local files need custom loaders) ---
  /** Return cached preview URL or undefined */
  getPreviewUrl: (asset: AssetModel) => string | undefined;
  /** Trigger async preview load for an asset */
  loadPreview: (asset: AssetModel) => Promise<void>;
  /** Optional hook-based preview resolver (e.g., blob URL auth) */
  resolvePreviewUrl?: (asset: AssetModel, previewUrl: string | undefined) => string | undefined;

  // --- Action callbacks ---
  onOpen?: (asset: AssetModel, resolvedPreviewUrl?: string) => void;
  onUpload?: (asset: AssetModel) => Promise<void>;
  onUploadToProvider?: (asset: AssetModel, providerId: string) => Promise<void>;
  onToggleFavorite?: (asset: AssetModel) => Promise<void> | void;
  onSelect?: (asset: AssetModel, selected: boolean) => void;
  selectedKeys?: Set<string>;
  getActions?: (asset: AssetModel) => MediaCardActions | undefined;

  // --- Optional per-asset state overrides (local folders) ---
  /** Client-side upload state (not on AssetModel) */
  getUploadState?: (asset: AssetModel) => AssetUploadState;
  /** Hash duplicate status (local folders only) */
  getHashStatus?: (asset: AssetModel) => 'unique' | 'duplicate' | 'hashing' | undefined;
  /** Favorite state override (when not derivable from tags) */
  getIsFavorite?: (asset: AssetModel) => boolean;
  /** Optional adapter for enriched card rendering (linked backend asset) */
  getMediaCardAsset?: (asset: AssetModel) => AssetModel;

  // --- Grouping ---
  groupBy?: (asset: AssetModel) => string;
  getGroupLabel?: (groupKey: string) => string;
  renderGroupHeader?: (key: string, label: string, count: number) => ReactNode;
  sortGroupSections?: (groups: GroupSection[]) => GroupSection[];
  collapsibleGroups?: boolean;

  // --- Layout ---
  layout?: 'masonry' | 'grid';
  cardSize?: GalleryCardSizePreset | number;
  rowGap?: number;
  columnGap?: number;
  initialDisplayLimit?: number;
  loadMoreIncrement?: number;
  showAssetCount?: boolean;
  overlayPresetId?: string;
  badgeConfig?: MediaCardBadgeConfig;
  emptyState?: ReactNode;
  className?: string;
}

// --- Pre-wired data extractors (read directly from AssetModel) ---

const getAssetKey = (asset: AssetModel) => String(asset.id);

const getMediaType = (asset: AssetModel) => asset.mediaType;

const getNumericId = (asset: AssetModel) => asset.id;

const getDescription = (asset: AssetModel) => asset.description ?? undefined;

const getTags = (asset: AssetModel) =>
  asset.tags?.map((t) => t.slug) ?? [];

const getCreatedAt = (asset: AssetModel) => asset.createdAt;

const getWidth = (asset: AssetModel) => asset.width ?? undefined;

const getHeight = (asset: AssetModel) => asset.height ?? undefined;

const defaultGetPreviewUrl = (asset: AssetModel) => {
  const { previewUrl } = getAssetDisplayUrls(asset);
  return previewUrl;
};

export function AssetModelGallery(props: AssetModelGalleryProps) {
  const {
    assets,
    getPreviewUrl: customGetPreviewUrl,
    loadPreview,
    resolvePreviewUrl,
    onOpen,
    onUpload,
    onUploadToProvider,
    onToggleFavorite,
    onSelect,
    selectedKeys,
    getActions,
    getUploadState,
    getHashStatus,
    getIsFavorite,
    getMediaCardAsset,
    groupBy,
    getGroupLabel,
    renderGroupHeader,
    sortGroupSections,
    collapsibleGroups,
    ...layoutProps
  } = props;

  // Use custom preview URL getter or fall back to AssetModel URL resolution
  const effectiveGetPreviewUrl = customGetPreviewUrl ?? defaultGetPreviewUrl;

  return (
    <AssetGallery<AssetModel>
      assets={assets}
      getAssetKey={getAssetKey}
      getPreviewUrl={effectiveGetPreviewUrl}
      resolvePreviewUrl={resolvePreviewUrl}
      loadPreview={loadPreview}
      getMediaType={getMediaType}
      getNumericId={getNumericId}
      getDescription={getDescription}
      getTags={getTags}
      getCreatedAt={getCreatedAt}
      getWidth={getWidth}
      getHeight={getHeight}
      getUploadState={getUploadState}
      getHashStatus={getHashStatus}
      getIsFavorite={getIsFavorite}
      getMediaCardAsset={getMediaCardAsset}
      onOpen={onOpen}
      onUpload={onUpload}
      onUploadToProvider={onUploadToProvider}
      onToggleFavorite={onToggleFavorite}
      onSelect={onSelect}
      selectedKeys={selectedKeys}
      getActions={getActions}
      groupBy={groupBy}
      getGroupLabel={getGroupLabel}
      renderGroupHeader={renderGroupHeader}
      sortGroupSections={sortGroupSections}
      collapsibleGroups={collapsibleGroups}
      {...layoutProps}
    />
  );
}
