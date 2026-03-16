/**
 * Content Map Panel
 *
 * Birds-eye view of all content sources in the project — packs, primitives,
 * vocabularies, plugins, template types. Uses the content source registry
 * to discover what's available and fetch live summaries.
 */

import { SidebarContentLayout, type SidebarContentLayoutSection, useSidebarNav, useTheme } from '@pixsim7/shared.ui';
import { useState, useEffect, useMemo, useCallback } from 'react';

import {
  getContentSources,
  getContentSourcesByCategory,
  CONTENT_SOURCE_CATEGORIES,
  CONTENT_SOURCE_CATEGORY_ORDER,
  type ContentSourceCategory,
  type ContentSourceDescriptor,
  type ContentSourceSummary,
} from '@lib/content';
import { Icon, IconBadge, type IconName } from '@lib/icons';

import { useWorkspaceStore } from '@features/workspace';


type SummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: ContentSourceSummary }
  | { status: 'error'; message: string };

const STATUS_COLORS: Record<ContentSourceSummary['status'], string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  error: 'bg-red-500',
  unknown: 'bg-gray-500',
};

export function ContentMapPanel() {
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const { theme: variant } = useTheme();
  const allSources = useMemo(() => getContentSources(), []);

  // Build sidebar sections from categories that have sources
  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    const result: SidebarContentLayoutSection[] = [];
    for (const cat of CONTENT_SOURCE_CATEGORY_ORDER) {
      const sources = getContentSourcesByCategory(cat);
      if (sources.length === 0) continue;
      const meta = CONTENT_SOURCE_CATEGORIES[cat];
      result.push({
        id: cat,
        label: `${meta.label} (${sources.length})`,
        icon: <Icon name={meta.icon} size={13} />,
      });
    }
    return result;
  }, [allSources]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstCategory = sections[0]?.id as ContentSourceCategory | undefined;

  const nav = useSidebarNav<ContentSourceCategory, never>({
    sections,
    initial: firstCategory ?? 'content-pack',
    storageKey: 'content-map:nav',
  });

  // Track summaries per source
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});

  const fetchSummary = useCallback(async (source: ContentSourceDescriptor) => {
    setSummaries((prev) => ({ ...prev, [source.id]: { status: 'loading' } }));
    try {
      const data = await source.fetchSummary();
      setSummaries((prev) => ({ ...prev, [source.id]: { status: 'loaded', data } }));
    } catch (err) {
      setSummaries((prev) => ({
        ...prev,
        [source.id]: { status: 'error', message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, []);

  // Fetch all summaries on mount
  useEffect(() => {
    for (const source of allSources) {
      fetchSummary(source);
    }
  }, [allSources, fetchSummary]);

  const activeSources = useMemo(
    () => getContentSourcesByCategory(nav.activeId as ContentSourceCategory),
    [nav.activeId, allSources], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleDrillDown = (source: ContentSourceDescriptor) => {
    if (!source.drillDownPanelId) return;
    openFloatingPanel(source.drillDownPanelId as any, {
      width: 900,
      height: 650,
    });
  };

  const activeCategory = nav.activeId as ContentSourceCategory;
  const activeMeta = CONTENT_SOURCE_CATEGORIES[activeCategory];

  return (
    <SidebarContentLayout
      sections={sections}
      activeSectionId={nav.activeSectionId}
      onSelectSection={nav.selectSection}
      sidebarWidth="w-44"
      variant={variant}
      collapsible
      expandedWidth={176}
      persistKey="content-map-sidebar"
      className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      contentClassName="overflow-y-auto"
    >
      {/* Content header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {activeMeta && <Icon name={activeMeta.icon} size={14} />}
          {activeMeta?.label ?? activeCategory}
        </h3>
      </div>

      {/* Source cards */}
      <div className="p-3 space-y-3">
        {activeSources.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            summaryState={summaries[source.id] ?? { status: 'idle' }}
            onDrillDown={handleDrillDown}
            onRefresh={fetchSummary}
          />
        ))}

        {activeSources.length === 0 && (
          <div className="text-center py-6 text-gray-500 text-sm">
            No content sources in this category.
          </div>
        )}
      </div>
    </SidebarContentLayout>
  );
}

// ---------------------------------------------------------------------------
// SourceCard
// ---------------------------------------------------------------------------

interface SourceCardProps {
  source: ContentSourceDescriptor;
  summaryState: SummaryState;
  onDrillDown: (source: ContentSourceDescriptor) => void;
  onRefresh: (source: ContentSourceDescriptor) => void;
}

function SourceCard({ source, summaryState, onDrillDown, onRefresh }: SourceCardProps) {
  const summary = summaryState.status === 'loaded' ? summaryState.data : null;
  const isLoading = summaryState.status === 'loading';
  const isError = summaryState.status === 'error';

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start gap-3">
        <IconBadge name={source.icon as IconName} size={18} variant="primary" className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{source.label}</span>
            {summary && (
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[summary.status]}`}
                title={summary.statusDetail ?? summary.status}
              />
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{source.description}</div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onRefresh(source)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            title="Refresh"
          >
            <Icon name="refresh" size={12} />
          </button>
          {source.drillDownPanelId && (
            <button
              onClick={() => onDrillDown(source)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
              title="Open in dedicated panel"
            >
              <Icon name="externalLink" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Disk path */}
      {source.diskPath && (
        <div className="text-[11px] text-gray-500 font-mono truncate" title={source.diskPath}>
          {source.diskPath}
        </div>
      )}

      {/* Summary */}
      {isLoading && (
        <div className="text-xs text-gray-500 animate-pulse">Loading...</div>
      )}

      {isError && (
        <div className="text-xs text-red-400">
          Failed: {summaryState.status === 'error' ? summaryState.message : 'Unknown error'}
        </div>
      )}

      {summary && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(summary.breakdown).map(([key, count]) => (
            <span
              key={key}
              className="px-1.5 py-0.5 bg-gray-200/60 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 rounded text-[11px]"
            >
              {count} {key}
            </span>
          ))}
          {summary.statusDetail && (
            <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-300 rounded text-[11px]">
              {summary.statusDetail}
            </span>
          )}
        </div>
      )}

      {/* Entity types + tags */}
      {(source.entityTypes.length > 0 || (source.tags && source.tags.length > 0)) && (
        <div className="flex flex-wrap gap-1">
          {source.entityTypes.map((et) => (
            <span key={et} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-300 rounded text-[10px]">
              {et}
            </span>
          ))}
          {source.tags?.slice(0, 4).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-700/40 text-gray-500 rounded text-[10px]">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
