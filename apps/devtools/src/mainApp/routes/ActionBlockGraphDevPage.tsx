/**
 * Action Block Graph Dev Page
 *
 * Dev-only route for visualizing ActionBlocks and their relationships.
 * Shows compatibility chains, composition structures, and package grouping.
 *
 * Part of Task 81 - Prompt & Action Block Graph Surfaces
 */

import { useState } from 'react';
import { Panel, Button, Input } from '@pixsim7/shared.ui';
import { Icon } from '../lib/icons';
import { ActionBlockGraphSurface } from '@features/graph';
import { useApi } from '../hooks/useApi';
import type { ActionBlock } from '../types/promptGraphs';

export function ActionBlockGraphDev() {
  const api = useApi();

  // State
  const [blocks, setBlocks] = useState<ActionBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [packageFilter, setPackageFilter] = useState<string>('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('');

  // Graph options
  const [includePackages, setIncludePackages] = useState(true);
  const [includePromptVersions, setIncludePromptVersions] = useState(false);

  // Load ActionBlocks
  const loadBlocks = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (packageFilter) params.append('package_name', packageFilter);
      if (sourceTypeFilter) params.append('source_type', sourceTypeFilter);
      if (tagFilter) params.append('tag', tagFilter);

      const result = await api.get<ActionBlock[]>(
        `/action-blocks?${params.toString()}`
      );
      setBlocks(result);
    } catch (err: any) {
      console.error('Failed to load ActionBlocks:', err);
      setError(err.message || 'Failed to load ActionBlocks');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6 content-with-dock min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Icon name="git-branch" className="h-6 w-6" />
              Action Block Graph
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Visualize ActionBlocks and their compatibility, composition, and extraction relationships
            </p>
          </div>
        </div>
      </header>

      {/* Filters and Controls */}
      <Panel className="p-6">
        <h2 className="text-lg font-semibold mb-4">Filters & Options</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Package Name
            </label>
            <Input
              type="text"
              placeholder="Filter by package..."
              value={packageFilter}
              onChange={(e) => setPackageFilter(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Source Type
            </label>
            <select
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
              value={sourceTypeFilter}
              onChange={(e) => setSourceTypeFilter(e.target.value)}
              disabled={loading}
            >
              <option value="">All</option>
              <option value="manual">Manual</option>
              <option value="extracted">Extracted</option>
              <option value="composed">Composed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Tag
            </label>
            <Input
              type="text"
              placeholder="Filter by tag..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        {/* Graph Options */}
        <div className="flex items-center gap-6 mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePackages}
              onChange={(e) => setIncludePackages(e.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-700"
            />
            <span>Show Package Nodes</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePromptVersions}
              onChange={(e) => setIncludePromptVersions(e.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-700"
            />
            <span>Show Prompt Version Nodes</span>
          </label>
        </div>

        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200 mb-4">
            {error}
          </div>
        )}

        <Button onClick={loadBlocks} disabled={loading} className="w-full md:w-auto">
          {loading ? 'Loading...' : 'Load Action Block Graph'}
        </Button>
      </Panel>

      {/* Graph Display */}
      {blocks.length > 0 ? (
        <Panel className="p-0 h-[700px]">
          <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Showing {blocks.length} ActionBlock{blocks.length !== 1 ? 's' : ''}
            </span>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              <span className="inline-flex items-center gap-1 mr-3">
                <span className="w-3 h-3 bg-blue-500 rounded"></span>
                Can Follow
              </span>
              <span className="inline-flex items-center gap-1 mr-3">
                <span className="w-3 h-3 bg-violet-500 rounded border-2 border-dashed"></span>
                Composed Of
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 bg-cyan-500 rounded border-2 border-dashed"></span>
                Extracted From
              </span>
            </div>
          </div>
          <div className="h-[calc(100%-3rem)]">
            <ActionBlockGraphSurface
              blocks={blocks}
              includePackages={includePackages}
              includePromptVersions={includePromptVersions}
            />
          </div>
        </Panel>
      ) : (
        <Panel className="p-12 text-center">
          <Icon name="git-branch" className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
          <h3 className="text-lg font-semibold mb-2">No ActionBlocks Loaded</h3>
          <p className="text-neutral-600 dark:text-neutral-400">
            Configure filters and click "Load Action Block Graph" to visualize ActionBlocks
          </p>
        </Panel>
      )}
    </div>
  );
}
