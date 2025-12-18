/**
 * InfoPanel - Global Helper Panel
 *
 * Context-aware information panel that adapts to current context:
 * - Asset context: Show asset metadata
 * - Scene context: Show scene info
 * - Generic: Show workspace info
 */

import { useMemo } from 'react';
import type { ViewerAsset } from '@features/assets';

export interface InfoPanelContext {
  /** Current asset being viewed */
  currentAsset?: ViewerAsset | null;
  /** Current scene ID */
  currentSceneId?: string | null;
  /** Any other context data */
  [key: string]: unknown;
}

export interface InfoPanelProps {
  /** Workspace context */
  context?: InfoPanelContext;
  /** Panel-specific params from dockview */
  params?: Record<string, any>;
}

function AssetInfo({ asset }: { asset: ViewerAsset }) {
  const { metadata } = asset;

  if (!metadata) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
        No metadata available
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 text-sm">
      {/* Description */}
      {metadata.description && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Description
          </span>
          <p className="mt-1 text-neutral-700 dark:text-neutral-300">
            {metadata.description}
          </p>
        </div>
      )}

      {/* Tags */}
      {metadata.tags && metadata.tags.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Tags
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {metadata.tags.map((tag, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-xs"
              >
                {typeof tag === 'object' ? tag.display_name || tag.slug : tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Provider */}
      {metadata.providerId && (
        <div className="flex justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">Provider</span>
          <span className="text-neutral-700 dark:text-neutral-300">{metadata.providerId}</span>
        </div>
      )}

      {/* Size */}
      {metadata.size && (
        <div className="flex justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">Size</span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {(metadata.size / 1024 / 1024).toFixed(2)} MB
          </span>
        </div>
      )}

      {/* Duration */}
      {metadata.duration && (
        <div className="flex justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">Duration</span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {metadata.duration.toFixed(1)}s
          </span>
        </div>
      )}

      {/* Created */}
      {metadata.createdAt && (
        <div className="flex justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">Created</span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {new Date(metadata.createdAt).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Path */}
      {metadata.path && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Path
          </span>
          <p className="mt-1 text-xs font-mono text-neutral-600 dark:text-neutral-400 break-all">
            {metadata.path}
          </p>
        </div>
      )}
    </div>
  );
}

function SceneInfo({ sceneId }: { sceneId: string }) {
  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 text-sm">
      <div>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Scene ID
        </span>
        <p className="mt-1 text-neutral-700 dark:text-neutral-300 font-mono text-xs">
          {sceneId}
        </p>
      </div>
      <div className="text-xs text-neutral-400 dark:text-neutral-500">
        Scene information panel coming soon. This will show scene properties, node count, and other metadata.
      </div>
    </div>
  );
}

export function InfoPanel({ context, params }: InfoPanelProps) {
  const asset = useMemo(() => {
    return context?.currentAsset || params?.asset;
  }, [context?.currentAsset, params?.asset]);

  // Asset context - Show asset metadata
  if (asset) {
    return <AssetInfo asset={asset} />;
  }

  // Scene context - Show scene info
  if (context?.currentSceneId) {
    return <SceneInfo sceneId={context.currentSceneId} />;
  }

  // Generic context - Show workspace info
  return (
    <div className="h-full flex items-center justify-center p-4 text-center">
      <div className="max-w-sm">
        <div className="text-neutral-500 dark:text-neutral-400 text-sm mb-2">
          No Context Available
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          This panel shows information about the current context. Select an asset or open a scene to view details.
        </p>
      </div>
    </div>
  );
}
