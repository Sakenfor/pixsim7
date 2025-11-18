/**
 * Plugin Catalog Panel
 *
 * Displays a unified view of all plugin types in PixSim7.
 * Uses the plugin catalog metadata layer for discovery and filtering.
 *
 * Features:
 * - Browse all plugins across all systems
 * - Filter by kind, category, enabled state
 * - Search by name, description, tags
 * - View plugin metadata and capabilities
 * - Link to configuration (for helpers/interactions)
 *
 * Design: Read-only catalog view. Configuration editing is handled by
 * existing UIs (PluginConfigPanel for helpers/interactions, PluginManager for UI plugins).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  listAllPlugins,
  searchPlugins,
  filterByKind,
  filterByCategory,
  filterByEnabled,
  getUniqueCategories,
  getPluginCounts,
  groupByKind,
  type PluginMeta,
  type PluginKind,
} from '../lib/plugins/catalog';

// Icon mapping for plugin kinds
const PLUGIN_KIND_ICONS: Record<PluginKind, string> = {
  'session-helper': '🎮',
  'interaction': '💬',
  'node-type': '🔷',
  'gallery-tool': '🖼️',
  'ui-plugin': '🎨',
  'generation-ui': '✨',
};

const PLUGIN_KIND_LABELS: Record<PluginKind, string> = {
  'session-helper': 'Session Helper',
  'interaction': 'Interaction',
  'node-type': 'Node Type',
  'gallery-tool': 'Gallery Tool',
  'ui-plugin': 'UI Plugin',
  'generation-ui': 'Generation UI',
};

export function PluginCatalogPanel() {
  const [plugins, setPlugins] = useState<PluginMeta[]>([]);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<PluginKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'grouped'>('list');

  // Load plugins on mount
  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = () => {
    const allPlugins = listAllPlugins();
    setPlugins(allPlugins);
  };

  // Get unique categories for filter dropdown
  const categories = useMemo(() => getUniqueCategories(plugins), [plugins]);

  // Get plugin counts by kind
  const counts = useMemo(() => getPluginCounts(), []);

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

    // Enabled filter
    if (enabledFilter !== 'all') {
      filtered = filterByEnabled(enabledFilter === 'enabled', filtered);
    }

    return filtered;
  }, [plugins, searchQuery, kindFilter, categoryFilter, enabledFilter]);

  // Group plugins by kind for grouped view
  const groupedPlugins = useMemo(() => {
    if (viewMode !== 'grouped') return null;
    return groupByKind(filteredPlugins);
  }, [filteredPlugins, viewMode]);

  const selectedPlugin = plugins.find((p) => p.id === selectedPluginId);

  return (
    <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              Plugin Catalog
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Browse all installed plugins across all systems
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search plugins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Kind filter */}
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as PluginKind | 'all')}
            className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Kinds ({Object.values(counts).reduce((a, b) => a + b, 0)})</option>
            {Object.entries(PLUGIN_KIND_LABELS).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label} ({counts[kind as PluginKind]})
              </option>
            ))}
          </select>

          {/* Category filter */}
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

          {/* Enabled filter */}
          <select
            value={enabledFilter}
            onChange={(e) => setEnabledFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
            className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All States</option>
            <option value="enabled">Enabled Only</option>
            <option value="disabled">Disabled Only</option>
          </select>

          {/* View mode */}
          <div className="ml-auto flex gap-1 border border-neutral-300 dark:border-neutral-600 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-sm ${
                viewMode === 'list'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 text-sm ${
                viewMode === 'grid'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-2 text-sm ${
                viewMode === 'grouped'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600'
              }`}
            >
              Grouped
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Plugin list */}
        <div className="flex-1 overflow-y-auto p-6">
          {viewMode === 'grouped' ? (
            <GroupedPluginView
              groupedPlugins={groupedPlugins!}
              selectedPluginId={selectedPluginId}
              onSelectPlugin={setSelectedPluginId}
            />
          ) : viewMode === 'grid' ? (
            <GridPluginView
              plugins={filteredPlugins}
              selectedPluginId={selectedPluginId}
              onSelectPlugin={setSelectedPluginId}
            />
          ) : (
            <ListPluginView
              plugins={filteredPlugins}
              selectedPluginId={selectedPluginId}
              onSelectPlugin={setSelectedPluginId}
            />
          )}
        </div>

        {/* Detail panel */}
        {selectedPlugin && (
          <div className="w-96 border-l border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-y-auto">
            <PluginDetailView plugin={selectedPlugin} onClose={() => setSelectedPluginId(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

// List view component
function ListPluginView({
  plugins,
  selectedPluginId,
  onSelectPlugin,
}: {
  plugins: PluginMeta[];
  selectedPluginId: string | null;
  onSelectPlugin: (id: string) => void;
}) {
  if (plugins.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
        No plugins found matching your filters
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {plugins.map((plugin) => (
        <PluginListItem
          key={plugin.id}
          plugin={plugin}
          selected={selectedPluginId === plugin.id}
          onClick={() => onSelectPlugin(plugin.id)}
        />
      ))}
    </div>
  );
}

// Grid view component
function GridPluginView({
  plugins,
  selectedPluginId,
  onSelectPlugin,
}: {
  plugins: PluginMeta[];
  selectedPluginId: string | null;
  onSelectPlugin: (id: string) => void;
}) {
  if (plugins.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
        No plugins found matching your filters
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {plugins.map((plugin) => (
        <PluginGridCard
          key={plugin.id}
          plugin={plugin}
          selected={selectedPluginId === plugin.id}
          onClick={() => onSelectPlugin(plugin.id)}
        />
      ))}
    </div>
  );
}

// Grouped view component
function GroupedPluginView({
  groupedPlugins,
  selectedPluginId,
  onSelectPlugin,
}: {
  groupedPlugins: Record<PluginKind, PluginMeta[]>;
  selectedPluginId: string | null;
  onSelectPlugin: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {Object.entries(groupedPlugins).map(([kind, plugins]) => {
        if (plugins.length === 0) return null;

        return (
          <div key={kind}>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 flex items-center gap-2">
              <span>{PLUGIN_KIND_ICONS[kind as PluginKind]}</span>
              <span>{PLUGIN_KIND_LABELS[kind as PluginKind]}</span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">({plugins.length})</span>
            </h2>
            <div className="space-y-2">
              {plugins.map((plugin) => (
                <PluginListItem
                  key={plugin.id}
                  plugin={plugin}
                  selected={selectedPluginId === plugin.id}
                  onClick={() => onSelectPlugin(plugin.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
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
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {plugin.icon && <span className="text-xl">{plugin.icon}</span>}
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {plugin.label}
            </h3>
            {plugin.experimental && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                Experimental
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
              {PLUGIN_KIND_LABELS[plugin.kind]}
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
  );
}

// Plugin grid card
function PluginGridCard({
  plugin,
  selected,
  onClick,
}: {
  plugin: PluginMeta;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {plugin.icon && <span className="text-2xl">{plugin.icon}</span>}
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate flex-1">
          {plugin.label}
        </h3>
      </div>
      {plugin.description && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-3 mb-3">
          {plugin.description}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
          {PLUGIN_KIND_LABELS[plugin.kind]}
        </span>
        {plugin.enabled !== undefined && (
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${
              plugin.enabled
                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
            }`}
          >
            {plugin.enabled ? 'Enabled' : 'Disabled'}
          </span>
        )}
      </div>
    </button>
  );
}

// Plugin detail view
function PluginDetailView({ plugin, onClose }: { plugin: PluginMeta; onClose: () => void }) {
  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {plugin.icon && <span className="text-3xl">{plugin.icon}</span>}
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {plugin.label}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {PLUGIN_KIND_LABELS[plugin.kind]}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ✕
        </button>
      </div>

      {plugin.description && (
        <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">
          {plugin.description}
        </p>
      )}

      {/* Metadata */}
      <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-700 pt-4">
        <MetadataRow label="ID" value={plugin.id} />
        {plugin.version && <MetadataRow label="Version" value={plugin.version} />}
        {plugin.author && <MetadataRow label="Author" value={plugin.author} />}
        {plugin.category && <MetadataRow label="Category" value={plugin.category} />}
        {plugin.scope && <MetadataRow label="Scope" value={plugin.scope} />}
        {plugin.uiMode && <MetadataRow label="UI Mode" value={plugin.uiMode} />}
        <MetadataRow label="Source" value={plugin.source.registry} />
        {plugin.enabled !== undefined && (
          <MetadataRow
            label="Enabled"
            value={plugin.enabled ? 'Yes' : 'No'}
            badge={plugin.enabled ? 'green' : 'neutral'}
          />
        )}
        {plugin.configurable !== undefined && (
          <MetadataRow
            label="Configurable"
            value={plugin.configurable ? 'Yes' : 'No'}
          />
        )}
        {plugin.experimental && (
          <MetadataRow label="Status" value="Experimental" badge="yellow" />
        )}
      </div>

      {/* Tags */}
      {plugin.tags && plugin.tags.length > 0 && (
        <div className="mt-4 border-t border-neutral-200 dark:border-neutral-700 pt-4">
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Tags
          </h3>
          <div className="flex flex-wrap gap-2">
            {plugin.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities */}
      {plugin.capabilities && Object.keys(plugin.capabilities).length > 0 && (
        <div className="mt-4 border-t border-neutral-200 dark:border-neutral-700 pt-4">
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Capabilities
          </h3>
          <div className="space-y-1">
            {Object.entries(plugin.capabilities).map(([key, value]) => {
              if (!value) return null;
              return (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <span className="text-green-500">✓</span>
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {formatCapabilityName(key)}
                    {typeof value === 'string' && `: ${value}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 border-t border-neutral-200 dark:border-neutral-700 pt-4">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Actions
        </h3>
        <div className="space-y-2">
          {plugin.configurable && (plugin.kind === 'session-helper' || plugin.kind === 'interaction') && (
            <button className="w-full px-4 py-2 text-sm font-medium rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors">
              Configure Plugin
            </button>
          )}
          {plugin.kind === 'ui-plugin' && (
            <button className="w-full px-4 py-2 text-sm font-medium rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors">
              Manage in Plugin Manager
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Metadata row component
function MetadataRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: 'green' | 'yellow' | 'neutral';
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
      {badge ? (
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded ${
            badge === 'green'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
              : badge === 'yellow'
              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
              : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
          }`}
        >
          {value}
        </span>
      ) : (
        <span className="text-neutral-900 dark:text-neutral-100 font-mono text-xs">
          {value}
        </span>
      )}
    </div>
  );
}

// Format capability name from camelCase to Title Case
function formatCapabilityName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
