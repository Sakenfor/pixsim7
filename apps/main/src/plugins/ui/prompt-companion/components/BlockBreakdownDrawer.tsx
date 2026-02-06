/**
 * Block Breakdown Drawer
 *
 * Displays analyzed prompt candidates in a slide-out drawer.
 * Now includes inline prompt highlighting for visual candidate mapping.
 *
 * Naming:
 * - PromptBlockCandidate = transient parsed output from API (used here)
 * - PromptBlock = stored entity in database (NOT used here)
 */

import { Icon } from '@lib/icons';
import { Button } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useMemo, useState } from 'react';

import {
  PromptInlineViewer,
  type PromptCandidateDisplay,
} from '@features/prompts';
import { PROMPT_ROLE_PRIORITY } from '@pixsim7/shared.types';
import type { PromptBlockCandidate, PromptTag } from '@pixsim7/shared.types/prompt';
import { getPromptRoleBadgeClass, getPromptRoleLabel, getPromptRolePanelClass } from '@/lib/promptRoleUi';
import { usePromptSettingsStore } from '@features/prompts/stores/promptSettingsStore';

// ============================================================================
// Types
// ============================================================================

interface PromptAnalysis {
  prompt: string;
  candidates: PromptBlockCandidate[];
  tags: PromptTag[];
}

interface BlockBreakdownDrawerProps {
  open: boolean;
  onClose: () => void;
  analysis: PromptAnalysis | null;
  onInsertBlock: (block: string) => void;
}

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
  const promptRoleColors = usePromptSettingsStore((state) => state.promptRoleColors);

  // Group candidates by role
  const groupedCandidates = useMemo(() => {
    if (!analysis?.candidates) return {};

    return analysis.candidates.reduce((acc, candidate) => {
      const role = candidate.role || 'other';
      if (!acc[role]) {
        acc[role] = [];
      }
      acc[role].push(candidate);
      return acc;
    }, {} as Record<string, PromptBlockCandidate[]>);
  }, [analysis?.candidates]);

  // Prepare candidates for inline viewer
  const viewerCandidates: PromptCandidateDisplay[] = useMemo(() => {
    if (!analysis?.candidates) return [];
    return analysis.candidates as PromptCandidateDisplay[];
  }, [analysis?.candidates]);

  // Check if we have valid position data for inline view
  const hasPositionData = viewerCandidates.some(
    (s) => typeof s.start_pos === 'number' && typeof s.end_pos === 'number'
  );

  const roleOrder = PROMPT_ROLE_PRIORITY;
  const sortedRoles = Object.keys(groupedCandidates).sort((a, b) => {
    const aIdx = roleOrder.indexOf(a as (typeof roleOrder)[number]);
    const bIdx = roleOrder.indexOf(b as (typeof roleOrder)[number]);
    const normalizedA = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
    const normalizedB = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
    return normalizedA - normalizedB;
  });

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
                        key={tag.tag}
                        className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 rounded text-xs"
                      >
                        {tag.tag}
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
                      candidates={viewerCandidates}
                      showLegend
                      onCandidateClick={(candidate) => onInsertBlock(candidate.text)}
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
                    const roleCandidates = groupedCandidates[role];
                    if (!roleCandidates || roleCandidates.length === 0) return null;

                    return (
                      <div key={role} className="space-y-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2 capitalize">
                          <span
                            className={clsx(
                              'w-2.5 h-2.5 rounded-full',
                              getPromptRoleBadgeClass(role, promptRoleColors)
                            )}
                          />
                          {getPromptRoleLabel(role)} ({roleCandidates.length})
                        </h3>

                        <div className="space-y-2 ml-4">
                          {roleCandidates.map((candidate, idx) => (
                            <div
                              key={idx}
                              className={clsx(
                                'p-3 rounded-lg border',
                                getPromptRolePanelClass(role, promptRoleColors)
                              )}
                            >
                              <div className="text-sm font-medium">{candidate.text}</div>

                              {/* Insert as block button */}
                              <button
                                onClick={() => onInsertBlock(candidate.text)}
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
                  {analysis.candidates.length} candidates across{' '}
                  {Object.keys(groupedCandidates).length} categories
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
