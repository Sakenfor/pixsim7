/**
 * PromptAnalysisLayout
 *
 * Shared layout primitive that arranges a prompt editor (caller-provided),
 * the ShadowSidePanel, and the interactive PromptRoleLegend with emphasis
 * state baked in. Used by both the inspector (PromptBoxPanel) and the
 * QuickGen composer's text-mode rendering — the seam between
 * "rendering+analysis layout" (shared) and "editing chrome" (composer-only).
 *
 * The caller passes the editor via `renderEditor` so they keep ownership of
 * which engine to use, what extensions to install, what callbacks to wire,
 * and how to style it. The layout owns:
 *   - hover/pin emphasis state (legend → editor dim factor)
 *   - side panel visibility + placement
 *   - legend visibility + placement
 *
 * Editing chrome (ghost diff, reference picker, tag pills, history popover,
 * AI tools, blocks-mode editor, operator popover) intentionally stays in
 * PromptComposer — it doesn't belong in a read-only inspector and would
 * couple the layout primitive to too much.
 */
import clsx from 'clsx';
import { useCallback, useState, type ReactNode } from 'react';

import type { ShadowAnalysisState } from '../hooks/useShadowAnalysis';
import { usePromptAnalysisEmphasisStore } from '../stores/promptAnalysisEmphasisStore';

import { PromptRoleLegend } from './PromptRoleLegend';
import { ShadowSidePanel } from './ShadowSidePanel';

export interface PromptAnalysisLayoutProps {
  /** Render-prop for the editor surface. Receives the current emphasized
   *  role so the editor can dim non-matching candidate spans. */
  renderEditor: (state: { emphasizedRole: string | null }) => ReactNode;
  /** Analysis state from useShadowAnalysis (or compatible). */
  analysis: ShadowAnalysisState;
  /** `side-by-side` (default) puts ShadowSidePanel to the right; `stacked`
   *  puts it below the editor. Stacked is friendlier to narrow panels. */
  layout?: 'side-by-side' | 'stacked';
  /** Show the per-role grouped side panel. Default: true. */
  showSidePanel?: boolean;
  /** Show the interactive legend chip-row. Default: true. */
  showLegend?: boolean;
  /** Optional class on the outer container. */
  className?: string;
  /**
   * Stable surface id for ShadowSidePanel collapsed-state persistence.
   * Threaded through to ShadowSidePanel and used as the prefix for all
   * `useUiCollapsed` keys it owns.
   */
  surfaceId: string;
}

export function PromptAnalysisLayout({
  renderEditor,
  analysis,
  layout = 'side-by-side',
  showSidePanel = true,
  showLegend = true,
  className,
  surfaceId,
}: PromptAnalysisLayoutProps) {
  // Emphasis state — hover previews (ephemeral), click pins (persisted per
  // surface so it survives tab switches / reloads).
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);
  const pinnedRole = usePromptAnalysisEmphasisStore(
    (s) => s.pinnedRoleBySurface[surfaceId] ?? null,
  );
  const setPinnedRole = usePromptAnalysisEmphasisStore((s) => s.setPinnedRole);

  const candidates = analysis.result?.candidates ?? [];

  // Guard a restored pin: if the pinned role isn't present in the current
  // candidates, don't apply it as emphasis (it would dim every span). The
  // legend still receives the raw pin, but its chip simply won't render.
  const pinnedRolePresent = pinnedRole != null && candidates.some((c) => c.role === pinnedRole);
  const emphasizedRole = hoveredRole ?? (pinnedRolePresent ? pinnedRole : null);

  const handleRoleHover = useCallback((role: string | null) => {
    setHoveredRole(role);
  }, []);
  const handleRoleClick = useCallback(
    (role: string) => {
      setPinnedRole(surfaceId, pinnedRole === role ? null : role);
    },
    [pinnedRole, setPinnedRole, surfaceId],
  );

  // ── side-by-side: editor + side panel as siblings, legend below editor only
  // ── stacked: editor → side panel → legend, all in one column
  if (layout === 'stacked') {
    return (
      <div className={clsx('flex h-full flex-col min-h-0', className)}>
        <div className="flex-1 min-h-0 flex flex-col">
          {renderEditor({ emphasizedRole })}
        </div>
        {showSidePanel && (
          <div className="flex-shrink-0 max-h-[40%] overflow-auto border-t border-neutral-200 dark:border-neutral-800">
            <ShadowSidePanel analysis={analysis} surfaceId={surfaceId} />
          </div>
        )}
        {showLegend && (
          <PromptRoleLegend
            candidates={candidates}
            pinnedRole={pinnedRole}
            onRoleHover={handleRoleHover}
            onRoleClick={handleRoleClick}
            className="flex-shrink-0 px-3 py-2 border-t border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur"
          />
        )}
      </div>
    );
  }

  // side-by-side
  return (
    <div className={clsx('flex h-full flex-col min-h-0', className)}>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0">{renderEditor({ emphasizedRole })}</div>
          {showLegend && (
            <PromptRoleLegend
              candidates={candidates}
              pinnedRole={pinnedRole}
              onRoleHover={handleRoleHover}
              onRoleClick={handleRoleClick}
              className="flex-shrink-0 px-3 py-2 border-t border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur"
            />
          )}
        </div>
        {showSidePanel && <ShadowSidePanel analysis={analysis} surfaceId={surfaceId} />}
      </div>
    </div>
  );
}
