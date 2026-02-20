import { Icon } from '@lib/icons';

import type { GalleryToolContext } from '@features/gallery/lib/core/types';
import { galleryToolSelectors } from '@features/gallery/lib/registry';

export interface GalleryToolsStripProps {
  selectedCount: number;
  surfaceId: string;
  galleryContext: GalleryToolContext;
  expandedToolId: string | null;
  onExpandedToolChange: (toolId: string | null) => void;
  onClearSelection: () => void;
}

export function GalleryToolsStrip({
  selectedCount,
  surfaceId,
  galleryContext,
  expandedToolId,
  onExpandedToolChange,
  onClearSelection,
}: GalleryToolsStripProps) {
  const visibleTools = galleryToolSelectors.getVisibleForSurface(surfaceId, galleryContext);
  const expandedTool = expandedToolId ? visibleTools.find((t) => t.id === expandedToolId) : null;

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Selection count badge */}
        <span className="inline-flex items-center h-7 px-2.5 rounded border border-accent/50 bg-accent/10 text-xs font-medium text-accent tabular-nums">
          {selectedCount} selected
        </span>
        {/* Tool chips */}
        {visibleTools.map((tool) => {
          const isActive = expandedToolId === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onExpandedToolChange(isActive ? null : tool.id)}
              className={`inline-flex items-center gap-1.5 h-7 px-2 rounded border text-xs transition-[background-color,border-color] duration-200 ${
                isActive
                  ? 'border-accent/50 bg-accent/10 text-neutral-800 dark:text-neutral-100'
                  : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
            >
              {tool.icon && <Icon name={tool.icon as any} size={13} />}
              <span>{tool.name}</span>
              <Icon name={isActive ? 'chevronUp' : 'chevronDown'} size={11} className="opacity-50" />
            </button>
          );
        })}
        {/* Clear selection */}
        <button
          type="button"
          onClick={onClearSelection}
          className="inline-flex items-center justify-center h-7 w-7 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          title="Clear selection"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
      {/* Expanded tool content */}
      {expandedTool && (
        <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-900/60">
          {expandedTool.render(galleryContext)}
        </div>
      )}
    </>
  );
}
