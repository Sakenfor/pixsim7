/**
 * PluginsView - Plugin Ecosystem tab for App Map
 *
 * Shows all registered plugins with filtering by family and origin.
 */

import { useMemo, useState } from 'react';
import type {
  UnifiedPluginDescriptor,
  UnifiedPluginFamily,
  UnifiedPluginOrigin,
} from '@lib/plugins/types';

interface PluginsViewProps {
  allPlugins: UnifiedPluginDescriptor[];
  filteredPlugins: UnifiedPluginDescriptor[];
  familyFilter: UnifiedPluginFamily | 'all';
  originFilter: UnifiedPluginOrigin | 'all';
  searchQuery: string;
  onFamilyFilterChange: (family: UnifiedPluginFamily | 'all') => void;
  onOriginFilterChange: (origin: UnifiedPluginOrigin | 'all') => void;
  onSearchQueryChange: (query: string) => void;
}

const PLUGIN_ORIGINS: Array<UnifiedPluginOrigin | 'all'> = [
  'all',
  'builtin',
  'plugin-dir',
  'ui-bundle',
  'dev-project',
];

export function PluginsView({
  allPlugins,
  filteredPlugins,
  familyFilter,
  originFilter,
  searchQuery,
  onFamilyFilterChange,
  onOriginFilterChange,
  onSearchQueryChange,
}: PluginsViewProps) {
  const familyOptions = useMemo(() => {
    const families = Array.from(new Set(allPlugins.map((plugin) => plugin.family))).sort();
    return ['all', ...families] as Array<UnifiedPluginFamily | 'all'>;
  }, [allPlugins]);

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search plugins..."
          className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Family Filter */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 self-center">
            Family:
          </span>
          {familyOptions.map((family) => (
            <button
              key={family}
              onClick={() => onFamilyFilterChange(family)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                familyFilter === family
                  ? 'bg-blue-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {family}
            </button>
          ))}
        </div>

        {/* Origin Filter */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 self-center">
            Origin:
          </span>
          {PLUGIN_ORIGINS.map((origin) => (
            <button
              key={origin}
              onClick={() => onOriginFilterChange(origin)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                originFilter === origin
                  ? 'bg-blue-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {origin}
            </button>
          ))}
        </div>

        {/* Results count */}
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Showing {filteredPlugins.length} of {allPlugins.length} plugins
        </div>
      </div>

      {/* Plugin List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {filteredPlugins.map((plugin) => (
            <PluginCard key={`${plugin.family}-${plugin.id}`} plugin={plugin} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PluginCard({ plugin }: { plugin: UnifiedPluginDescriptor }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors text-left"
      >
        <div className="flex items-start gap-3">
          {plugin.icon && <span className="text-xl">{plugin.icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {plugin.name}
              </span>
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">
                {plugin.family}
              </span>
              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded">
                {plugin.origin}
              </span>
              {plugin.experimental && (
                <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded">
                  experimental
                </span>
              )}
              {plugin.deprecated && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded">
                  deprecated
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-neutral-600 dark:text-neutral-400 mb-1">
              {plugin.id}
            </div>
            {plugin.description && (
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                {plugin.description}
              </p>
            )}
          </div>
          <span className="text-neutral-400">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 space-y-3">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {plugin.category && (
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  Category:
                </span>
                <span className="ml-2 text-neutral-900 dark:text-neutral-100">
                  {plugin.category}
                </span>
              </div>
            )}
            {plugin.version && (
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  Version:
                </span>
                <span className="ml-2 text-neutral-900 dark:text-neutral-100">
                  {plugin.version}
                </span>
              </div>
            )}
            {plugin.author && (
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  Author:
                </span>
                <span className="ml-2 text-neutral-900 dark:text-neutral-100">
                  {plugin.author}
                </span>
              </div>
            )}
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">
                Enabled:
              </span>
              <span className="ml-2 text-neutral-900 dark:text-neutral-100">
                {plugin.isActive ? 'Yes' : 'No'}
              </span>
            </div>
            {plugin.pluginType && (
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  Plugin Type:
                </span>
                <span className="ml-2 text-neutral-900 dark:text-neutral-100">
                  {plugin.pluginType}
                </span>
              </div>
            )}
            {plugin.bundleFamily && (
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  Bundle Family:
                </span>
                <span className="ml-2 text-neutral-900 dark:text-neutral-100">
                  {plugin.bundleFamily}
                </span>
              </div>
            )}
          </div>

          {/* Tags */}
          {plugin.tags && plugin.tags.length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                Tags:
              </div>
              <div className="flex gap-1 flex-wrap">
                {plugin.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Feature Dependencies */}
          {(plugin.providesFeatures?.length ||
            plugin.consumesFeatures?.length) && (
            <div className="space-y-2">
              {plugin.providesFeatures && plugin.providesFeatures.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                    Provides Features:
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {plugin.providesFeatures.map((f) => (
                      <code
                        key={f}
                        className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded font-mono"
                      >
                        {f}
                      </code>
                    ))}
                  </div>
                </div>
              )}
              {plugin.consumesFeatures && plugin.consumesFeatures.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                    Consumes Features:
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {plugin.consumesFeatures.map((f) => (
                      <code
                        key={f}
                        className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded font-mono"
                      >
                        {f}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Permissions */}
          {plugin.permissions && plugin.permissions.length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                Permissions:
              </div>
              <div className="flex gap-1 flex-wrap">
                {plugin.permissions.map((permission) => (
                  <code
                    key={permission}
                    className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs rounded font-mono"
                  >
                    {permission}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
