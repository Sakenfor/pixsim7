/**
 * Plugin Browser
 *
 * Read-only browser for all installed plugins across all systems.
 * Uses the unified plugin catalog for discovery.
 *
 * This is a simplified version focused on browsing within the Plugin Workspace.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  listAllPlugins,
  searchPlugins,
  filterByKind,
  filterByCategory,
  filterByFeature,
  getUniqueCategories,
  getUniqueFeatures,
  type PluginMeta,
  type PluginKind,
} from '../../lib/plugins/catalog';
import { PluginDependencies } from '../capabilities/PluginDependencies';

// Plugin kind labels
const PLUGIN_KIND_LABELS: Record<PluginKind, string> = {
  'session-helper': 'Session Helper',
  'interaction': 'Interaction',
  'node-type': 'Node Type',
  'gallery-tool': 'Gallery Tool',
  'ui-plugin': 'UI Plugin',
  'generation-ui': 'Generation UI',
};

// Plugin kind icons
const PLUGIN_KIND_ICONS: Record<PluginKind, string> = {
  'session-helper': '🎮',
  'interaction': '💬',
  'node-type': '🔷',
  'gallery-tool': '🖼️',
  'ui-plugin': '🎨',
  'generation-ui': '✨',
};

interface PluginBrowserProps {
  onSelectPlugin?: (plugin: PluginMeta) => void;
  selectedPluginId?: string;
}

export function PluginBrowser({ onSelectPlugin, selectedPluginId }: PluginBrowserProps) {
  const [plugins, setPlugins] = useState<PluginMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<PluginKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [featureFilter, setFeatureFilter] = useState<string>('all');

  // Load plugins
  useEffect(() => {
    const allPlugins = listAllPlugins();
    setPlugins(allPlugins);
  }, []);

  // Get unique categories and features
  const categories = useMemo(() => getUniqueCategories(plugins), [plugins]);
  const features = useMemo(() => getUniqueFeatures(plugins), [plugins]);

  // Apply filters
  const filteredPlugins = useMemo(() => {
    let filtered = plugins;

    // Search
    if (searchQuery.trim()) {
      filtered = searchPlugins(searchQuery, filtered);
    }

    // Kind filter
    if (kindFilter !== 'all') {
      filtered = filterByKind(kindFilter, filtered);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filterByCategory(categoryFilter, filtered);
    }

    // Feature filter
    if (featureFilter !== 'all') {
      filtered = filterByFeature(featureFilter, filtered);
    }

    return filtered;
  }, [plugins, searchQuery, kindFilter, categoryFilter, featureFilter]);

  // Check if there are any control center plugins
  const hasControlCenterPlugins = useMemo(
    () => filteredPlugins.some(p => p.providesFeatures?.includes('control-center')),
    [filteredPlugins]
  );

  return (
    <div className="space-y-4">
      {/* Control Center Quick Link */}
      {hasControlCenterPlugins && (
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium text-purple-900 dark:text-purple-100 flex items-center gap-2">
                🎛️ Control Center Plugins
              </div>
              <div className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                These plugins provide different control center interfaces
              </div>
            </div>
            <button
              onClick={() => {
                // Trigger the Control Center selector
                const event = new KeyboardEvent('keydown', {
                  key: 'X',
                  ctrlKey: true,
                  shiftKey: true,
                  bubbles: true,
                });
                window.dispatchEvent(event);
              }}
              className="px-3 py-1.5 text-sm font-medium rounded bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            >
              Switch Control Center
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <input
          type="text"
          placeholder="Search plugins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Kind filter */}
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as PluginKind | 'all')}
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Kinds</option>
          {Object.entries(PLUGIN_KIND_LABELS).map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>

        {/* Category filter */}
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        )}

        {/* Feature filter */}
        {features.length > 0 && (
          <select
            value={featureFilter}
            onChange={(e) => setFeatureFilter(e.target.value)}
            className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Filter by feature (consumed or provided)"
          >
            <option value="all">All Features</option>
            {features.map((feature) => (
              <option key={feature} value={feature}>
                {feature}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto text-sm text-neutral-600 dark:text-neutral-400">
          {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Plugin list */}
      <div className="space-y-2">
        {filteredPlugins.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            No plugins found matching your filters
          </div>
        ) : (
          filteredPlugins.map((plugin) => (
            <PluginListItem
              key={`${plugin.kind}-${plugin.id}`}
              plugin={plugin}
              selected={selectedPluginId === plugin.id}
              onClick={() => onSelectPlugin?.(plugin)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Plugin list item
function PluginListItem({
  plugin,
  selected,
  onClick,
}: {
  plugin: PluginMeta;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`rounded-lg border transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'
      }`}
    >
      <button
        onClick={onClick}
        className="w-full text-left p-4 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {plugin.icon && <span className="text-lg">{plugin.icon}</span>}
              <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                {plugin.label}
              </h3>
              {plugin.experimental && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                  Experimental
                </span>
              )}
              {plugin.providesFeatures?.includes('control-center') && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 flex items-center gap-1">
                  🎛️ Control Center
                </span>
              )}
            </div>
            {plugin.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                {plugin.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="px-2 py-0.5 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                {PLUGIN_KIND_ICONS[plugin.kind]} {PLUGIN_KIND_LABELS[plugin.kind]}
              </span>
              {plugin.category && (
                <span className="px-2 py-0.5 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                  {plugin.category}
                </span>
              )}
              {plugin.version && (
                <span className="px-2 py-0.5 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                  v{plugin.version}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {plugin.enabled !== undefined && (
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  plugin.enabled
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {plugin.enabled ? 'Enabled' : 'Disabled'}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Dependencies panel - shown when selected */}
      {selected && (
        <div className="px-4 pb-4 border-t border-neutral-200 dark:border-neutral-700 pt-4 mt-2">
          <PluginDependencies plugin={plugin} />
        </div>
      )}
    </div>
  );
}
