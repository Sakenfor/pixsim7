/**
 * MetadataPanel
 *
 * Asset metadata display panel for the asset viewer.
 * Shows description, tags, size, dates, path, duration.
 */

import type { ViewerPanelContext } from '../types';

interface MetadataPanelProps {
  context: ViewerPanelContext;
  panelId: string;
}

export function MetadataPanel({ context }: MetadataPanelProps) {
  const { asset } = context;

  if (!asset) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
        No asset selected
      </div>
    );
  }

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
                {tag}
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
