/**
 * Plugins Settings Module
 *
 * Manage UI plugins - enable/disable plugins from the backend catalog.
 * Plugins are loaded dynamically when enabled and can extend the application
 * with new scene views, tools, and UI components.
 */
import { useEffect } from 'react';

import { Icon } from '@lib/icons';

import { usePluginCatalogStore } from '@/stores/pluginCatalogStore';

import { settingsRegistry } from '../../lib/core/registry';

// Family display names and descriptions
const FAMILY_INFO: Record<string, { label: string; description: string }> = {
  scene: {
    label: 'Scene View Plugins',
    description: 'Custom scene rendering modes and visualizations',
  },
  ui: {
    label: 'UI Plugins',
    description: 'UI components, overlays, and control center modules',
  },
  tool: {
    label: 'Tool Plugins',
    description: 'World, gallery, brain, and development tools',
  },
  panel: {
    label: 'Panel Plugins',
    description: 'Workspace panels, dock widgets, and panel groups',
  },
  graph: {
    label: 'Graph Plugins',
    description: 'Node types, renderers, and graph editors',
  },
  game: {
    label: 'Game Plugins',
    description: 'Helpers and interaction behavior plugins',
  },
  surface: {
    label: 'Surface Plugins',
    description: 'Gallery and gizmo rendering surfaces',
  },
  generation: {
    label: 'Generation Plugins',
    description: 'Provider and generation UI plugins',
  },
};

export function PluginsSettings() {
  const {
    plugins,
    isLoading,
    isInitialized,
    error,
    initialize,
    enablePlugin,
    disablePlugin,
    isPending,
  } = usePluginCatalogStore();

  // Initialize the catalog on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Group plugins by family
  const pluginsByFamily = plugins.reduce((acc, plugin) => {
    const family = plugin.family;
    if (!acc[family]) {
      acc[family] = [];
    }
    acc[family].push(plugin);
    return acc;
  }, {} as Record<string, typeof plugins>);

  const handleToggle = async (pluginId: string, isEnabled: boolean) => {
    if (isEnabled) {
      await disablePlugin(pluginId);
    } else {
      await enablePlugin(pluginId);
    }
  };

  if (isLoading && !isInitialized) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500 dark:text-neutral-400">
        Loading plugins...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-[11px] text-red-700 dark:text-red-300">
          <strong>Error loading plugins:</strong> {error}
        </div>
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="p-3 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-700 rounded text-[11px] text-neutral-600 dark:text-neutral-400">
          No plugins available. Built-in plugins will appear here once the plugin catalog is seeded.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6 text-xs text-neutral-800 dark:text-neutral-100">
      {/* Info Banner */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-[11px] text-blue-700 dark:text-blue-300">
        <strong>Plugin Management:</strong> Enable or disable UI plugins. Changes take effect after reloading the page.
      </div>

      {/* Plugin Families */}
      {Object.entries(pluginsByFamily).map(([family, familyPlugins]) => {
        const info = FAMILY_INFO[family] || { label: family, description: '' };

        return (
          <section key={family} className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {info.label}
            </h2>
            {info.description && (
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                {info.description}
              </p>
            )}

            <div className="mt-3 space-y-2">
              {familyPlugins.map(plugin => {
                const pending = isPending(plugin.plugin_id);
                const isRequired = plugin.is_required;

                return (
                  <div
                    key={plugin.plugin_id}
                    className={`flex items-center justify-between p-3 rounded-md border ${
                      pending
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20'
                        : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {plugin.icon && (
                          <Icon name={plugin.icon} size={16} />
                        )}
                        <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                          {plugin.name}
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
                          v{plugin.version}
                        </span>
                        {plugin.is_builtin && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            Built-in
                          </span>
                        )}
                        {isRequired && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            Required
                          </span>
                        )}
                      </div>
                      {plugin.description && (
                        <div className="text-[10px] text-neutral-600 dark:text-neutral-400 mt-0.5">
                          {plugin.description}
                        </div>
                      )}
                      {plugin.author && (
                        <div className="text-[9px] text-neutral-500 dark:text-neutral-500 mt-0.5">
                          by {plugin.author}
                        </div>
                      )}
                    </div>

                    <label className={`flex items-center ml-4 ${isRequired ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={plugin.is_enabled}
                        onChange={() => handleToggle(plugin.plugin_id, plugin.is_enabled)}
                        disabled={pending || isRequired}
                        className="sr-only peer"
                      />
                      <div
                        className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative ${
                          pending
                            ? 'bg-blue-300 dark:bg-blue-700 animate-pulse'
                            : plugin.is_enabled
                            ? 'bg-blue-500'
                            : 'bg-neutral-300 dark:bg-neutral-700'
                        }`}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Permissions Info */}
      <section className="space-y-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          About Plugins
        </h2>
        <div className="text-[10px] text-neutral-600 dark:text-neutral-400 space-y-2">
          <p>
            Plugins extend the application with new features. Each plugin declares the permissions
            it requires (e.g., read session data, show overlays).
          </p>
          <p>
            Built-in plugins are provided by the PixSim7 team and are enabled by default.
            Third-party plugins may be available in the future.
          </p>
        </div>
      </section>
    </div>
  );
}

// Register this module
settingsRegistry.register({
  id: 'plugins',
  label: 'Plugins',
  icon: '🧩',
  component: PluginsSettings,
  order: 80,
});
