/**
 * DocBrowserPanel - Standalone documentation browser
 *
 * Provides a searchable index + page viewer for project documentation.
 * Reuses the DocViewer component from appMap for page rendering.
 * Shows related test suites matched via code path overlap.
 */

import type { DocIndexEntry } from '@pixsim7/shared.types';
import {
  Badge,
  Button,
  EmptyState,
  SearchInput,
  SectionHeader,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';

import {
  ensureBuiltInTestCatalogRegistered,
  testSuiteRegistry,
  type TestSuiteDefinition,
} from '@features/devtools/services/testCatalogRegistry';
import { openWorkspacePanel } from '@features/workspace';

import { DocViewer } from './appMap/DocViewer';

// =============================================================================
// Types
// =============================================================================

interface DocsIndexResponse {
  version: string;
  generated_at: string;
  entries: DocIndexEntry[];
}

// =============================================================================
// Helpers
// =============================================================================

function groupByFolder(entries: DocIndexEntry[]): Record<string, DocIndexEntry[]> {
  const grouped: Record<string, DocIndexEntry[]> = {};
  for (const entry of entries) {
    const parts = entry.path.split('/');
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
    if (!grouped[folder]) grouped[folder] = [];
    grouped[folder].push(entry);
  }
  return grouped;
}

/**
 * Match test suites whose `covers` paths overlap with the given code paths.
 */
function findRelatedSuites(
  codePaths: string[],
  allSuites: TestSuiteDefinition[],
): TestSuiteDefinition[] {
  if (codePaths.length === 0) return [];

  const matched = new Set<string>();
  const results: TestSuiteDefinition[] = [];

  for (const suite of allSuites) {
    if (!suite.covers || suite.covers.length === 0) continue;
    if (matched.has(suite.id)) continue;

    const isRelated = suite.covers.some((coverPath) =>
      codePaths.some(
        (docCodePath) =>
          docCodePath.startsWith(coverPath) || coverPath.startsWith(docCodePath),
      ),
    );

    if (isRelated) {
      matched.add(suite.id);
      results.push(suite);
    }
  }

  return results;
}

/**
 * Extract code-like paths from a doc index entry's links array.
 */
function extractCodePaths(entry: DocIndexEntry | undefined): string[] {
  if (!entry?.links) return [];
  return entry.links
    .filter((link) => link.kind === 'code' && link.resolvedPath)
    .map((link) => link.resolvedPath!);
}

// =============================================================================
// RelatedTests sub-component
// =============================================================================

function RelatedTests({ docEntry }: { docEntry: DocIndexEntry | undefined }) {
  const relatedSuites = useMemo(() => {
    ensureBuiltInTestCatalogRegistered();
    const allSuites = testSuiteRegistry.getAll();
    const codePaths = extractCodePaths(docEntry);
    return findRelatedSuites(codePaths, allSuites);
  }, [docEntry]);

  if (relatedSuites.length === 0) return null;

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 mt-4 pt-3">
      <SectionHeader
        trailing={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openWorkspacePanel('dev-tool:test-overview')}
          >
            Open Test Overview
          </Button>
        }
      >
        Related Tests ({relatedSuites.length})
      </SectionHeader>
      <div className="space-y-1 mt-2">
        {relatedSuites.map((suite) => (
          <div
            key={suite.id}
            className="flex items-start gap-2 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-800 text-xs"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
                {suite.label}
              </div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                {suite.path}
              </div>
            </div>
            {suite.kind && (
              <Badge color="gray" className="text-[10px] shrink-0">{suite.kind}</Badge>
            )}
            <Badge color="gray" className="text-[10px] shrink-0">{suite.layer}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function DocBrowserPanel() {
  const [entries, setEntries] = useState<DocIndexEntry[]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { theme: variant } = useTheme();

  // Load doc index on mount
  useEffect(() => {
    let cancelled = false;

    const loadIndex = async () => {
      setLoadingIndex(true);
      setIndexError(null);
      try {
        const response = await pixsimClient.get<DocsIndexResponse>('/dev/docs/index');
        if (!cancelled) {
          setEntries(response.entries ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setIndexError(err instanceof Error ? err.message : 'Failed to load docs index');
        }
      } finally {
        if (!cancelled) {
          setLoadingIndex(false);
        }
      }
    };

    loadIndex();
    return () => { cancelled = true; };
  }, []);

  // Filter entries by search query
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q) ||
        (e.summary?.toLowerCase().includes(q) ?? false) ||
        (e.tags?.some((t) => t.toLowerCase().includes(q)) ?? false),
    );
  }, [entries, searchQuery]);

  const grouped = useMemo(() => groupByFolder(filteredEntries), [filteredEntries]);

  // Build sidebar sections: folders as sections, docs as children
  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    const folders = Object.keys(grouped).sort();
    return folders.map((folder) => ({
      id: folder,
      label: folder.split('/').pop() || folder,
      icon: <Icon name="folder" size={12} />,
      children: grouped[folder].map((entry) => ({
        id: `doc:${entry.path}`,
        label: entry.title,
      })),
    }));
  }, [grouped]);

  const nav = useSidebarNav({
    sections,
    storageKey: 'doc-browser:nav',
  });

  // Resolve selected doc path from nav
  const selectedDocPath = nav.activeChildId?.startsWith('doc:')
    ? nav.activeChildId.slice(4)
    : null;

  const selectedEntry = useMemo(
    () => (selectedDocPath ? entries.find((e) => e.path === selectedDocPath) : undefined),
    [entries, selectedDocPath],
  );

  const handleNavigateDoc = useCallback(
    (path: string) => {
      nav.navigate(`doc:${path}`);
    },
    [nav],
  );

  if (loadingIndex) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading docs index..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  if (indexError) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Failed to load docs" description={indexError} icon={<Icon name="alertCircle" size={20} />} />
      </div>
    );
  }

  return (
    <SidebarContentLayout
      sections={sections}
      activeSectionId={nav.activeSectionId}
      activeChildId={nav.activeChildId}
      onSelectSection={nav.selectSection}
      onSelectChild={nav.selectChild}
      expandedSectionIds={nav.expandedSectionIds}
      onToggleExpand={nav.toggleExpand}
      sidebarTitle={
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search docs..."
          size="sm"
        />
      }
      sidebarWidth="w-52"
      variant={variant}
      collapsible
      expandedWidth={208}
      persistKey="doc-browser-sidebar"
      contentClassName="overflow-y-auto"
    >
      {selectedDocPath ? (
        <div className="p-4">
          <DocViewer
            docPath={selectedDocPath}
            onNavigateDoc={handleNavigateDoc}
          />
          <RelatedTests docEntry={selectedEntry} />
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <EmptyState
            message={filteredEntries.length === 0 ? 'No docs match your search' : 'Select a doc to view'}
            icon={<Icon name="fileText" size={20} />}
          />
        </div>
      )}
    </SidebarContentLayout>
  );
}
