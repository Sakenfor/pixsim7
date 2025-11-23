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
import { pluginCatalog, pluginActivationManager } from '../../lib/plugins/pluginSystem';
import type { ExtendedPluginMetadata } from '../../lib/plugins/pluginSystem';

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

type BrowserTab = 'legacy' | 'workspace-panels';

export function PluginBrowser({ onSelectPlugin, selectedPluginId }: PluginBrowserProps) {
  const [activeTab, setActiveTab] = useState<BrowserTab>('legacy');
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
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setActiveTab('legacy')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'legacy'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Legacy Plugins
        </button>
        <button
          onClick={() => setActiveTab('workspace-panels')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'workspace-panels'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Workspace Panels
        </button>
      </div>

      {/* Legacy Plugins Tab */}
      {activeTab === 'legacy' && (
        <>
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
        </>
      )}

      {/* Workspace Panels Tab */}
      {activeTab === 'workspace-panels' && <WorkspacePanelsBrowser />}
    </div>
  );
}

// Workspace Panels Browser Component
function WorkspacePanelsBrowser() {
  const [panelPlugins, setPanelPlugins] = useState<ExtendedPluginMetadata<'workspace-panel'>[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'core' | 'development' | 'game' | 'tools' | 'custom'>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'builtin' | 'plugin-dir' | 'ui-bundle'>('all');

  // Load workspace panel plugins and subscribe to changes
  useEffect(() => {
    const loadPanels = () => {
      const panels = pluginCatalog.getByFamily('workspace-panel');
      setPanelPlugins(panels);
    };

    // Initial load
    loadPanels();

    // Subscribe to catalog changes
    const unsubscribe = pluginCatalog.subscribe(loadPanels);

    return () => {
      unsubscribe();
    };
  }, []);

  // Apply filters
  const filteredPanels = useMemo(() => {
    let filtered = panelPlugins;

    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.id.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((p) => p.category === categoryFilter);
    }

    // Origin filter
    if (originFilter !== 'all') {
      filtered = filtered.filter((p) => p.origin === originFilter);
    }

    return filtered;
  }, [panelPlugins, searchQuery, categoryFilter, originFilter]);

  const handleToggleActivation = async (panelId: string) => {
    const panel = pluginCatalog.get(panelId);
    if (!panel) return;

    if (panel.activationState === 'active') {
      await pluginActivationManager.deactivate(panelId);
    } else {
      await pluginActivationManager.activate(panelId);
    }
    // Panel list will update automatically via subscription
  };

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <input
          type="text"
          placeholder="Search workspace panels..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Categories</option>
          <option value="core">Core</option>
          <option value="development">Development</option>
          <option value="game">Game</option>
          <option value="tools">Tools</option>
          <option value="custom">Custom</option>
        </select>

        {/* Origin filter */}
        <select
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value as typeof originFilter)}
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Origins</option>
          <option value="builtin">Built-in</option>
          <option value="plugin-dir">Plugin Directory</option>
          <option value="ui-bundle">UI Bundle</option>
        </select>

        <div className="ml-auto text-sm text-neutral-600 dark:text-neutral-400">
          {filteredPanels.length} panel{filteredPanels.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Panel list */}
      <div className="space-y-2">
        {filteredPanels.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            No workspace panels found matching your filters
          </div>
        ) : (
          filteredPanels.map((panel) => (
            <WorkspacePanelListItem
              key={panel.id}
              panel={panel}
              onToggleActivation={handleToggleActivation}
            />
          ))
        )}
      </div>
    </>
  );
}

// Workspace Panel List Item Component
function WorkspacePanelListItem({
  panel,
  onToggleActivation,
}: {
  panel: ExtendedPluginMetadata<'workspace-panel'>;
  onToggleActivation: (panelId: string) => void;
}) {
  const isActive = panel.activationState === 'active';
  const canToggle = panel.canDisable;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {panel.name}
            </h3>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${
                isActive
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                  : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {isActive ? 'Active' : 'Inactive'}
            </span>
            {panel.origin === 'builtin' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                Built-in
              </span>
            )}
          </div>

          {panel.description && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
              {panel.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              ID: {panel.panelId}
            </span>
            {panel.category && (
              <span className="px-2 py-0.5 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                {panel.category}
              </span>
            )}
            {panel.supportsCompactMode && (
              <span className="px-2 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                Compact Mode
              </span>
            )}
            {panel.supportsMultipleInstances && (
              <span className="px-2 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                Multiple Instances
              </span>
            )}
            {panel.tags && panel.tags.length > 0 && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Tags: {panel.tags.join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Enable/Disable toggle */}
        <div className="flex flex-col items-end gap-2">
          {canToggle ? (
            <button
              onClick={() => onToggleActivation(panel.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                isActive
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isActive ? 'Disable' : 'Enable'}
            </button>
          ) : (
            <span className="px-3 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 italic">
              Always enabled
            </span>
          )}
        </div>
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
