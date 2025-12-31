/**
 * Block Breakdown Drawer
 *
 * Displays analyzed prompt segments in a slide-out drawer.
 * Now includes inline prompt highlighting for visual block mapping.
 */

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@pixsim7/shared.ui';
import { Icon } from '@lib/icons';
import {
  PromptInlineViewer,
  type PromptBlock,
} from '@features/prompts/components/PromptInlineViewer';

// ============================================================================
// Types
// ============================================================================

interface PromptSegmentData {
  role: string;
  text: string;
  start_pos?: number;
  end_pos?: number;
  category?: string;
  metadata?: Record<string, unknown>;
}

interface PromptAnalysis {
  prompt: string;
  segments: PromptSegmentData[];
  tags: string[];
}

interface BlockBreakdownDrawerProps {
  open: boolean;
  onClose: () => void;
  analysis: PromptAnalysis | null;
  onInsertBlock: (block: string) => void;
}

// ============================================================================
// Role Colors
// ============================================================================

const roleColors: Record<string, string> = {
  character: 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200',
  action: 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200',
  setting: 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-200',
  mood: 'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200',
  romance: 'bg-pink-100 dark:bg-pink-900/40 border-pink-300 dark:border-pink-700 text-pink-800 dark:text-pink-200',
  other: 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300',
};

const roleBadgeColors: Record<string, string> = {
  character: 'bg-blue-500',
  action: 'bg-green-500',
  setting: 'bg-purple-500',
  mood: 'bg-yellow-500',
  romance: 'bg-pink-500',
  other: 'bg-neutral-500',
};

// ============================================================================
// Component
// ============================================================================

type ViewMode = 'inline' | 'grouped';

export function BlockBreakdownDrawer({
  open,
  onClose,
  analysis,
  onInsertBlock,
}: BlockBreakdownDrawerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('inline');

  // Group segments by role
  const groupedSegments = useMemo(() => {
    if (!analysis?.segments) return {};

    return analysis.segments.reduce((acc, seg) => {
      const role = seg.role || 'other';
      if (!acc[role]) {
        acc[role] = [];
      }
      acc[role].push(seg);
      return acc;
    }, {} as Record<string, PromptSegmentData[]>);
  }, [analysis?.segments]);

  // Convert to PromptBlock format for inline viewer
  const viewerBlocks: PromptBlock[] = useMemo(() => {
    if (!analysis?.segments) return [];
    return analysis.segments.map((seg) => ({
      role: seg.role as PromptBlock['role'],
      text: seg.text,
      start_pos: seg.start_pos,
      end_pos: seg.end_pos,
      category: seg.category,
      metadata: seg.metadata,
    }));
  }, [analysis?.segments]);

  // Check if we have valid position data for inline view
  const hasPositionData = viewerBlocks.some(
    (b) => typeof b.start_pos === 'number' && typeof b.end_pos === 'number'
  );

  const roleOrder = ['character', 'action', 'setting', 'mood', 'romance', 'other'];
  const sortedRoles = Object.keys(groupedSegments).sort(
    (a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b)
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={clsx(
          'fixed right-0 top-0 h-full w-96 max-w-[90vw]',
          'bg-white dark:bg-neutral-900',
          'border-l border-neutral-200 dark:border-neutral-700',
          'shadow-xl z-50',
          'flex flex-col',
          'transform transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="search" className="h-5 w-5" />
            Block Breakdown
          </h2>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            {hasPositionData && (
              <div className="flex rounded-md border border-neutral-300 dark:border-neutral-600 overflow-hidden">
                <button
                  onClick={() => setViewMode('inline')}
                  className={clsx(
                    'px-2 py-1 text-xs font-medium transition-colors',
                    viewMode === 'inline'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  )}
                >
                  Inline
                </button>
                <button
                  onClick={() => setViewMode('grouped')}
                  className={clsx(
                    'px-2 py-1 text-xs font-medium transition-colors border-l border-neutral-300 dark:border-neutral-600',
                    viewMode === 'grouped'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  )}
                >
                  Grouped
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Close"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!analysis ? (
            <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
              No analysis available
            </div>
          ) : (
            <>
              {/* Tags */}
              {analysis.tags && analysis.tags.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
                    Auto-Generated Tags
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 rounded text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Inline View */}
              {viewMode === 'inline' && hasPositionData && (
                <div className="space-y-4">
                  <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                    <PromptInlineViewer
                      prompt={analysis.prompt}
                      blocks={viewerBlocks}
                      showLegend
                      onBlockClick={(block) => onInsertBlock(block.text)}
                    />
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                    Hover over highlighted text to see block details. Click to insert.
                  </p>
                </div>
              )}

              {/* Grouped View (or fallback when no position data) */}
              {(viewMode === 'grouped' || !hasPositionData) && (
                <>
                  {sortedRoles.map((role) => {
                    const roleSegments = groupedSegments[role];
                    if (!roleSegments || roleSegments.length === 0) return null;

                    return (
                      <div key={role} className="space-y-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2 capitalize">
                          <span
                            className={clsx(
                              'w-2.5 h-2.5 rounded-full',
                              roleBadgeColors[role] || roleBadgeColors.other
                            )}
                          />
                          {role} ({roleSegments.length})
                        </h3>

                        <div className="space-y-2 ml-4">
                          {roleSegments.map((segment, idx) => (
                            <div
                              key={idx}
                              className={clsx(
                                'p-3 rounded-lg border',
                                roleColors[role] || roleColors.other
                              )}
                            >
                              <div className="text-sm font-medium">{segment.text}</div>

                              {/* Insert as block button */}
                              <button
                                onClick={() => onInsertBlock(segment.text)}
                                className="mt-2 text-xs opacity-60 hover:opacity-100 flex items-center gap-1"
                              >
                                <Icon name="add" className="h-3 w-3" />
                                Insert as block
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Summary */}
              <div className="mt-6 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-sm">
                <div className="font-medium mb-1">Summary</div>
                <div className="text-neutral-600 dark:text-neutral-400">
                  {analysis.segments.length} segments across{' '}
                  {Object.keys(groupedSegments).length} categories
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700">
          <Button onClick={onClose} variant="outline" className="w-full">
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
