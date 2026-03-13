/**
 * DocBrowserPanel - Standalone documentation browser
 *
 * Provides a searchable index + page viewer for project documentation.
 * Reuses the DocViewer component from appMap for page rendering.
 */

import type { DocIndexEntry } from '@pixsim7/shared.types';
import { SidebarContentLayout } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api/client';

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

// =============================================================================
// Component
// =============================================================================

export function DocBrowserPanel() {
  const [entries, setEntries] = useState<DocIndexEntry[]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
  const folders = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  // Build sidebar sections from folders
  const sections = useMemo(
    () => folders.map((folder) => ({ id: folder, label: folder.split('/').pop() || folder })),
    [folders],
  );

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const initialFolderRef = useRef(false);

  // Auto-select first folder once entries load
  useEffect(() => {
    if (!initialFolderRef.current && folders.length > 0) {
      initialFolderRef.current = true;
      setActiveFolder(folders[0]);
    }
  }, [folders]);

  const handleSelectDoc = useCallback((path: string) => {
    setSelectedDocPath(path);
  }, []);

  const activeFolderEntries = activeFolder ? (grouped[activeFolder] ?? []) : [];

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950">
      {/* Search bar */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search docs..."
          className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
        />
      </div>

      {loadingIndex && (
        <div className="p-3 text-xs text-neutral-500 dark:text-neutral-400">
          Loading docs index...
        </div>
      )}

      {indexError && (
        <div className="p-3 text-xs text-red-600 dark:text-red-400">
          {indexError}
        </div>
      )}

      {!loadingIndex && !indexError && (
        <SidebarContentLayout
          sections={sections}
          activeSectionId={activeFolder ?? ''}
          onSelectSection={setActiveFolder}
          sidebarWidth="w-36"
          variant="light"
        >
          <div className="flex h-full">
            {/* Doc list for active folder */}
            <div className="w-56 shrink-0 border-r border-neutral-200 dark:border-neutral-800 overflow-y-auto">
              <div className="p-2 space-y-0.5">
                {activeFolderEntries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => handleSelectDoc(entry.path)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedDocPath === entry.path
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="font-medium truncate">{entry.title}</div>
                    {entry.summary && (
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                        {entry.summary}
                      </div>
                    )}
                  </button>
                ))}
                {activeFolderEntries.length === 0 && (
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 px-2 py-1">
                    No docs in this folder
                  </div>
                )}
              </div>
            </div>

            {/* Doc viewer */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedDocPath ? (
                <DocViewer
                  docPath={selectedDocPath}
                  onNavigateDoc={handleSelectDoc}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-neutral-500 dark:text-neutral-400">
                  Select a doc to view
                </div>
              )}
            </div>
          </div>
        </SidebarContentLayout>
      )}
    </div>
  );
}
