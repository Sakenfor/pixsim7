/**
 * Plugin Manager UI Component
 *
 * Shows all plugins from the unified plugin catalog (Vite-discovered + backend).
 * Allows users to view plugin details and toggle activation state.
 */

import type { PluginMetadata, PluginFamily } from '@pixsim7/shared.plugins';
import { Button, Panel, Badge } from '@pixsim7/shared.ui';
import { useState, useSyncExternalStore, useMemo } from 'react';

import { pluginCatalog, pluginActivationManager } from '@lib/plugins';

// ===== Hooks =====

function useCatalogPlugins() {
  const plugins = useSyncExternalStore(
    (cb) => pluginCatalog.subscribe(cb),
    () => pluginCatalog.getAll(),
  );
  return plugins;
}

// ===== Families for display grouping =====

const FAMILY_LABELS: Partial<Record<PluginFamily, string>> = {
  'gallery-tool': 'Gallery Tools',
  'world-tool': 'World Tools',
  'brain-tool': 'Brain Tools',
  'helper': 'Helpers',
  'interaction': 'Interactions',
  'scene-view': 'Scene Views',
  'control-center': 'Control Center',
  'ui-plugin': 'UI Plugins',
  'generation-ui': 'Generation UI',
  'node-type': 'Node Types',
  'renderer': 'Renderers',
  'graph-editor': 'Graph Editors',
  'workspace-panel': 'Workspace Panels',
  'dock-widget': 'Dock Widgets',
  'gizmo-surface': 'Gizmo Surfaces',
  'panel-group': 'Panel Groups',
  'dev-tool': 'Dev Tools',
};

// ===== Component =====

export function PluginManagerUI() {
  const allPlugins = useCatalogPlugins();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [familyFilter, setFamilyFilter] = useState<string | null>(null);

  // Sorted plugins, optionally filtered by family
  const plugins = useMemo(() => {
    let list = [...allPlugins];
    if (familyFilter) {
      list = list.filter(p => p.family === familyFilter);
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [allPlugins, familyFilter]);

  // Available families for filter
  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allPlugins) {
      counts.set(p.family, (counts.get(p.family) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b));
  }, [allPlugins]);

  const selected = plugins.find(p => p.id === selectedId);
  const summary = pluginCatalog.getSummary();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Plugin Manager</h1>
        <div className="text-sm text-neutral-500">
          {summary.total} plugins ({summary.active} active)
        </div>
      </div>

      {/* Family filter */}
      {families.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              !familyFilter
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
            }`}
            onClick={() => setFamilyFilter(null)}
          >
            All ({allPlugins.length})
          </button>
          {families.map(([family, count]) => (
            <button
              key={family}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                familyFilter === family
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
              }`}
              onClick={() => setFamilyFilter(family)}
            >
              {FAMILY_LABELS[family as PluginFamily] ?? family} ({count})
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Plugin List */}
        <Panel className="lg:col-span-1 space-y-3 max-h-[75vh] overflow-y-auto">
          <h2 className="text-sm font-semibold">
            {familyFilter
              ? `${FAMILY_LABELS[familyFilter as PluginFamily] ?? familyFilter} (${plugins.length})`
              : `All Plugins (${plugins.length})`}
          </h2>
          {plugins.length === 0 ? (
            <p className="text-xs text-neutral-500">No plugins found</p>
          ) : (
            <div className="space-y-2">
              {plugins.map(plugin => (
                <button
                  key={plugin.id}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                    selectedId === plugin.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
                  }`}
                  onClick={() => setSelectedId(plugin.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">
                      {plugin.name}
                    </span>
                    <Badge
                      color={plugin.activationState === 'active' ? 'green' : 'gray'}
                      className="text-[10px] ml-2 shrink-0"
                    >
                      {plugin.activationState}
                    </Badge>
                  </div>
                  <p className={`text-xs truncate ${
                    selectedId === plugin.id ? 'text-blue-200' : 'text-neutral-500'
                  }`}>
                    {plugin.family}
                    {plugin.origin !== 'builtin' && ` · ${plugin.origin}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Plugin Details */}
        <Panel className="lg:col-span-2 space-y-3">
          {selected ? (
            <PluginDetails plugin={selected} />
          ) : (
            <div className="flex items-center justify-center h-64 text-neutral-500">
              Select a plugin to view details
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function PluginDetails({ plugin }: { plugin: PluginMetadata }) {
  const canToggle = pluginCatalog.canDisable(plugin.id);
  const isActive = plugin.activationState === 'active';

  const handleToggle = () => {
    pluginActivationManager.toggle(plugin.id);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{plugin.name}</h2>
        {canToggle && (
          <Button
            size="sm"
            variant={isActive ? 'secondary' : 'primary'}
            onClick={handleToggle}
          >
            {isActive ? 'Deactivate' : 'Activate'}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {plugin.description && (
          <div>
            <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Description
            </h3>
            <p className="text-sm">{plugin.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Family
            </h3>
            <p>{FAMILY_LABELS[plugin.family] ?? plugin.family}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Origin
            </h3>
            <p className="capitalize">{plugin.origin}</p>
          </div>
          {plugin.version && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Version
              </h3>
              <p>{plugin.version}</p>
            </div>
          )}
          {plugin.author && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Author
              </h3>
              <p>{plugin.author}</p>
            </div>
          )}
          <div>
            <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              State
            </h3>
            <Badge color={isActive ? 'green' : 'gray'}>
              {plugin.activationState}
            </Badge>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Can Disable
            </h3>
            <p>{canToggle ? 'Yes' : 'No (required)'}</p>
          </div>
        </div>

        {plugin.tags && plugin.tags.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Tags
            </h3>
            <div className="flex flex-wrap gap-1">
              {plugin.tags.map(tag => (
                <Badge key={tag} color="blue" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {plugin.providesFeatures && plugin.providesFeatures.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Provides
            </h3>
            <div className="flex flex-wrap gap-1">
              {plugin.providesFeatures.map(f => (
                <Badge key={f} color="green" className="text-xs">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {plugin.experimental && (
          <Badge color="yellow" className="text-xs">Experimental</Badge>
        )}

        {plugin.deprecated && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Deprecated{plugin.deprecationMessage ? `: ${plugin.deprecationMessage}` : ''}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
