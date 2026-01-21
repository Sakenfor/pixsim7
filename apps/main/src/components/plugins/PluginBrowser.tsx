/**
 * Plugin Browser
 *
 * Read-only browser for all installed plugins across all systems.
 * Uses the unified plugin catalog for discovery.
 *
 * This is a simplified version focused on browsing within the Plugin Workspace.
 */

import type { ExtendedPluginMetadata } from '@lib/plugins/pluginSystem';
import type { UnifiedPluginDescriptor, UnifiedPluginFamily } from '@lib/plugins/types';

import { usePluginBrowserController } from '@/hooks/usePluginBrowserController';
import type { PanelCategory, PanelOrigin } from '@/hooks/usePluginBrowserController';

import { PluginDependencies } from '../capabilities/PluginDependencies';

// Plugin family labels
const PLUGIN_FAMILY_LABELS: Record<UnifiedPluginFamily, string> = {
  'world-tool': 'World Tool',
  'helper': 'Session Helper',
  'interaction': 'Interaction',
  'brain-tool': 'Brain Tool',
  'gallery-tool': 'Gallery Tool',
  'gallery-surface': 'Gallery Surface',
  'node-type': 'Node Type',
  'renderer': 'Renderer',
  'ui-plugin': 'UI Plugin',
  'scene-view': 'Scene View',
  'control-center': 'Control Center',
  'graph-editor': 'Graph Editor',
  'dev-tool': 'Dev Tool',
  'workspace-panel': 'Workspace Panel',
  'dock-widget': 'Dock Widget',
  'gizmo-surface': 'Gizmo Surface',
  'generation-ui': 'Generation UI',
};

// Plugin family icons
const PLUGIN_FAMILY_ICONS: Record<UnifiedPluginFamily, string> = {
  'world-tool': '🌍',
  'helper': '🎮',
  'interaction': '💬',
  'gallery-tool': '🖼',
  'node-type': '🔷',
  'renderer': '🖥',
  'ui-plugin': '🎨',
  'scene-view': '🎬',
  'control-center': '🎛',
  'graph-editor': '🗺',
  'dev-tool': '🛠',
  'workspace-panel': '🧩',
  'dock-widget': '📌',
  'gizmo-surface': '🧲',
  'generation-ui': '✨',
  'brain-tool': '??',
  'gallery-surface': '???',
};

interface PluginBrowserProps {
  onSelectPlugin?: (plugin: UnifiedPluginDescriptor) => void;
  selectedPluginId?: string;
}

export function PluginBrowser({ onSelectPlugin, selectedPluginId }: PluginBrowserProps) {
  // Use controller hook for all state and logic
  const controller = usePluginBrowserController();

  // Destructure controller state for easier access
  const {
    activeTab,
    setActiveTab,
    filteredPlugins,
    searchQuery,
    setSearchQuery,
    familyFilter,
    setFamilyFilter,
    categoryFilter,
    setCategoryFilter,
    featureFilter,
    setFeatureFilter,
    categories,
    features,
    families,
    hasControlCenterPlugins,
  } = controller;

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setActiveTab('plugins')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'plugins'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Plugins
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

      {/* Plugins Tab */}
      {activeTab === 'plugins' && (
        <>
          {/* Control Center Quick Link */}
          {hasControlCenterPlugins && (
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium text-purple-900 dark:text-purple-100 flex items-center gap-2">
                {PLUGIN_FAMILY_ICONS['control-center']} Control Center Plugins
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

        {/* Family filter */}
        <select
          value={familyFilter}
          onChange={(e) => setFamilyFilter(e.target.value as UnifiedPluginFamily | 'all')}
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Families</option>
          {families.map((family) => (
            <option key={family} value={family}>
              {PLUGIN_FAMILY_ICONS[family]} {PLUGIN_FAMILY_LABELS[family]}
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
                  key={`${plugin.family}-${plugin.id}`}
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
      {activeTab === 'workspace-panels' && (
        <WorkspacePanelsBrowser
          panelPlugins={controller.filteredPanelPlugins}
          searchQuery={controller.panelSearchQuery}
          setSearchQuery={controller.setPanelSearchQuery}
          categoryFilter={controller.panelCategoryFilter}
          setCategoryFilter={controller.setPanelCategoryFilter}
          originFilter={controller.panelOriginFilter}
          setOriginFilter={controller.setPanelOriginFilter}
          onToggleActivation={controller.handleTogglePanelActivation}
        />
      )}
    </div>
  );
}

// Workspace Panels Browser Component
interface WorkspacePanelsBrowserProps {
  panelPlugins: ExtendedPluginMetadata<'workspace-panel'>[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  categoryFilter: PanelCategory;
  setCategoryFilter: (category: PanelCategory) => void;
  originFilter: PanelOrigin;
  setOriginFilter: (origin: PanelOrigin) => void;
  onToggleActivation: (panelId: string) => Promise<void>;
}

function WorkspacePanelsBrowser({
  panelPlugins,
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  originFilter,
  setOriginFilter,
  onToggleActivation,
}: WorkspacePanelsBrowserProps) {

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
          {panelPlugins.length} panel{panelPlugins.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Panel list */}
      <div className="space-y-2">
        {panelPlugins.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            No workspace panels found matching your filters
          </div>
        ) : (
          panelPlugins.map((panel) => (
            <WorkspacePanelListItem
              key={panel.id}
              panel={panel}
              onToggleActivation={onToggleActivation}
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
  plugin: UnifiedPluginDescriptor;
  selected: boolean;
  onClick: () => void;
}) {
  const familyLabel = PLUGIN_FAMILY_LABELS[plugin.family];
  const familyIcon = PLUGIN_FAMILY_ICONS[plugin.family];
  const displayIcon = plugin.icon ?? familyIcon;
  const isControlCenter =
    plugin.family === 'control-center' ||
    plugin.providesFeatures?.includes('control-center');

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
              {displayIcon && <span className="text-lg">{displayIcon}</span>}
              <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                {plugin.name}
              </h3>
              {plugin.experimental && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                  Experimental
                </span>
              )}
              {plugin.deprecated && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                  Deprecated
                </span>
              )}
              {isControlCenter && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 flex items-center gap-1">
                  {PLUGIN_FAMILY_ICONS['control-center']} Control Center
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
                {familyIcon} {familyLabel}
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
            <span
              className={`px-2 py-1 text-xs font-medium rounded ${
                plugin.isActive
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                  : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {plugin.isActive ? 'Active' : 'Inactive'}
            </span>
            {plugin.isBuiltin && (
              <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                Built-in
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
