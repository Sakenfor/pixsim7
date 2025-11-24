/**
 * Gallery Grid Widget
 *
 * Display a grid of assets using MediaCard with masonry or grid layout.
 * Part of Task 62 Phase 62.2 - Gallery Grid Widget for Panel Builder
 */

import { useNavigate } from 'react-router-dom';
import { useAssets } from '../../hooks/useAssets';
import { MediaCard, type MediaCardBadgeConfig } from '../media/MediaCard';
import { MasonryGrid } from '../layout/MasonryGrid';
import type { WidgetProps, WidgetDefinition } from '../../lib/widgets/widgetRegistry';
import { useMediaGenerationActions } from '../../hooks/useMediaGenerationActions';

export interface GalleryGridWidgetConfig {
  title?: string;
  limit?: number;
  filters?: {
    q?: string;
    tag?: string;
    provider_id?: string;
    media_type?: 'image' | 'video' | 'audio' | '3d_model';
    provider_status?: 'ok' | 'local_only' | 'flagged' | 'unknown';
  };
  badgeConfig?: MediaCardBadgeConfig;
  layout?: 'grid' | 'masonry';
  columns?: number;
  columnGap?: number;
  rowGap?: number;
}

export interface GalleryGridWidgetProps extends WidgetProps {
  config: GalleryGridWidgetConfig;
}

/**
 * Gallery Grid Widget Component
 */
export function GalleryGridWidget({ config }: GalleryGridWidgetProps) {
  const {
    title = 'Gallery',
    limit = 12,
    filters = {},
    badgeConfig,
    layout = 'masonry',
    columns = 3,
    columnGap = 16,
    rowGap = 16,
  } = config;

  const navigate = useNavigate();
  const { items, loading, error } = useAssets({ filters });

  // Apply limit
  const displayItems = items.slice(0, limit);

  const {
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
  } = useMediaGenerationActions();

  // Render media cards
  const renderCards = () => {
    return displayItems.map((asset) => (
      <MediaCard
        key={asset.id}
        id={asset.id}
        mediaType={asset.media_type}
        providerId={asset.provider_id}
        providerAssetId={asset.provider_asset_id}
        thumbUrl={asset.thumbnail_url}
        remoteUrl={asset.remote_url}
        width={asset.width}
        height={asset.height}
        durationSec={asset.duration_sec}
        tags={asset.tags}
        description={asset.description}
        createdAt={asset.created_at}
        providerStatus={asset.provider_status}
        onOpen={() => navigate(`/assets/${asset.id}`)}
        actions={{
          onOpenDetails: () => navigate(`/assets/${asset.id}`),
          onShowMetadata: () => navigate(`/assets/${asset.id}`),
          onImageToVideo: () => queueImageToVideo(asset),
          onVideoExtend: () => queueVideoExtend(asset),
          onAddToTransition: () => queueAddToTransition(asset),
          onAddToGenerate: () => queueAutoGenerate(asset),
        }}
        badgeConfig={badgeConfig}
      />
    ));
  };

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {displayItems.length} {displayItems.length === 1 ? 'asset' : 'assets'}
              {limit < items.length && ` (showing first ${limit})`}
            </p>
          </div>
          <span className="text-[10px] px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-300 dark:border-neutral-600">
            {layout}
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex items-center justify-center h-full text-sm text-neutral-500">
            Loading assets...
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-sm text-red-500">
            Error: {error}
          </div>
        )}

        {!loading && !error && displayItems.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-neutral-500">
            No assets found
          </div>
        )}

        {!loading && !error && displayItems.length > 0 && (
          layout === 'masonry' ? (
            <MasonryGrid
              items={renderCards()}
              columnGap={columnGap}
              rowGap={rowGap}
            />
          ) : (
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `${rowGap}px ${columnGap}px`,
              }}
            >
              {renderCards()}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/**
 * Widget Definition for Registration
 */
export const galleryGridWidgetDefinition: WidgetDefinition = {
  id: 'gallery-grid',
  type: 'grid',
  title: 'Gallery Grid',
  component: GalleryGridWidget,
  category: 'display',

  configSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Title',
        description: 'Widget title',
        default: 'Gallery',
      },
      limit: {
        type: 'number',
        title: 'Max Items',
        description: 'Maximum number of assets to display',
        default: 12,
      },
      layout: {
        type: 'string',
        title: 'Layout',
        description: 'Grid layout type',
        enum: ['grid', 'masonry'],
        default: 'masonry',
      },
      columns: {
        type: 'number',
        title: 'Columns',
        description: 'Number of grid columns (grid layout only)',
        default: 3,
      },
      columnGap: {
        type: 'number',
        title: 'Column Gap',
        description: 'Gap between columns in pixels',
        default: 16,
      },
      rowGap: {
        type: 'number',
        title: 'Row Gap',
        description: 'Gap between rows in pixels',
        default: 16,
      },
      filters: {
        type: 'object',
        title: 'Filters',
        description: 'Asset filters (query, tag, provider, media type, status)',
      },
      badgeConfig: {
        type: 'object',
        title: 'Badge Configuration',
        description: 'Control badge visibility on media cards',
      },
    },
  },

  defaultConfig: {
    title: 'Gallery',
    limit: 12,
    layout: 'masonry',
    columns: 3,
    columnGap: 16,
    rowGap: 16,
    filters: {},
    badgeConfig: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: true,
      showTagsInOverlay: true,
      showFooterProvider: true,
      showFooterDate: true,
    },
  },

  requiresData: false,

  minWidth: 2,
  minHeight: 2,
  defaultWidth: 4,
  defaultHeight: 4,
  resizable: true,

  icon: '🖼️',
  description: 'Display a grid of assets from the gallery with masonry or grid layout',
  tags: ['gallery', 'assets', 'media', 'grid', 'masonry'],
};
