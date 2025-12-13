/**
 * Gallery Tools Panel
 *
 * Renders gallery tool plugins in a side panel.
 * Automatically discovers and displays tools based on their visibility predicates.
 */

import { useEffect, useState } from 'react';
import { galleryToolRegistry, type GalleryToolContext, type GalleryToolPlugin } from '@features/gallery/lib/core/types';

interface GalleryToolsPanelProps {
  context: GalleryToolContext;

  /** Optional surface ID to filter tools by */
  surfaceId?: string;
}

/**
 * Gallery tools panel component
 */
export function GalleryToolsPanel({ context, surfaceId }: GalleryToolsPanelProps) {
  const [visibleTools, setVisibleTools] = useState<GalleryToolPlugin[]>([]);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Update visible tools when context or surface changes
  useEffect(() => {
    const tools = surfaceId
      ? galleryToolRegistry.getVisibleForSurface(surfaceId, context)
      : galleryToolRegistry.getVisible(context);
    setVisibleTools(tools);
  }, [context, surfaceId]);

  const toggleTool = (toolId: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(toolId)) {
      newExpanded.delete(toolId);
    } else {
      newExpanded.add(toolId);
    }
    setExpandedTools(newExpanded);
  };

  if (visibleTools.length === 0) {
    return (
      <div className="p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          No tools available for current selection
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
        Gallery Tools
      </h2>

      <div className="space-y-2">
        {visibleTools.map(tool => {
          const isExpanded = expandedTools.has(tool.id);

          return (
            <div key={tool.id} className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
              {/* Tool Header */}
              <button
                onClick={() => toggleTool(tool.id)}
                className="w-full px-4 py-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  {tool.icon && <span className="text-xl">{tool.icon}</span>}
                  <div className="text-left">
                    <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
                      {tool.name}
                    </div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      {tool.description}
                    </div>
                  </div>
                </div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {isExpanded ? '▼' : '▶'}
                </span>
              </button>

              {/* Tool Content */}
              {isExpanded && (
                <div className="p-3 bg-white dark:bg-neutral-900">
                  {tool.render(context)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Compact gallery tools panel (for floating panels)
 */
export function CompactGalleryToolsPanel({ context, surfaceId }: GalleryToolsPanelProps) {
  const [visibleTools, setVisibleTools] = useState<GalleryToolPlugin[]>([]);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  useEffect(() => {
    const tools = surfaceId
      ? galleryToolRegistry.getVisibleForSurface(surfaceId, context)
      : galleryToolRegistry.getVisible(context);
    setVisibleTools(tools);

    // Auto-select first tool if none selected
    if (tools.length > 0 && !selectedTool) {
      setSelectedTool(tools[0].id);
    }
  }, [context, surfaceId]);

  const activeTool = visibleTools.find(t => t.id === selectedTool);

  if (visibleTools.length === 0) {
    return (
      <div className="p-3 text-sm text-neutral-500 dark:text-neutral-400">
        No tools available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tool Tabs */}
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-700 p-2">
        {visibleTools.map(tool => (
          <button
            key={tool.id}
            onClick={() => setSelectedTool(tool.id)}
            className={`px-3 py-2 text-xs rounded transition-colors ${
              selectedTool === tool.id
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
            title={tool.description}
          >
            {tool.icon} {tool.name}
          </button>
        ))}
      </div>

      {/* Tool Content */}
      <div className="flex-1 overflow-auto p-3">
        {activeTool && activeTool.render(context)}
      </div>
    </div>
  );
}
