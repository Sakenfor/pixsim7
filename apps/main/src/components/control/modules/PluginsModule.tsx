/**
 * Plugins Module for Control Center
 *
 * Quick plugin management:
 * - Installed plugins list
 * - Enable/disable plugins
 * - Plugin stats
 * - Link to plugin browser
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { pluginCatalog } from '@/lib/plugins/pluginSystem';
import type { ControlCenterModuleProps } from '@/lib/control/controlCenterModuleRegistry';

export function PluginsModule({ }: ControlCenterModuleProps) {
  const navigate = useNavigate();

  // Get plugin stats
  const stats = useMemo(() => {
    const all = pluginCatalog.getAll();
    const enabled = all.filter(p => p.active);
    const builtin = all.filter(p => p.origin === 'builtin');
    const custom = all.filter(p => p.origin !== 'builtin');

    const byFamily: Record<string, number> = {};
    all.forEach(p => {
      byFamily[p.family] = (byFamily[p.family] || 0) + 1;
    });

    return {
      total: all.length,
      enabled: enabled.length,
      disabled: all.length - enabled.length,
      builtin: builtin.length,
      custom: custom.length,
      byFamily,
    };
  }, []);

  // Get recently installed/updated plugins
  const recentPlugins = useMemo(() => {
    return pluginCatalog.getAll()
      .sort((a, b) => {
        // Sort by active first, then by name
        if (a.active && !b.active) return -1;
        if (!a.active && b.active) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6);
  }, []);

  const handleTogglePlugin = (pluginId: string, currentlyActive: boolean) => {
    if (currentlyActive) {
      pluginCatalog.disable(pluginId);
    } else {
      pluginCatalog.enable(pluginId);
    }
    // Force re-render
    window.location.reload();
  };

  return (
    <div className="p-4 space-y-4">
      {/* Plugin Stats */}
      <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-700">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span>🔌</span>
          Plugin Statistics
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Total:</span>
            <span className="font-semibold">{stats.total}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-600 dark:text-green-400">✓ Enabled:</span>
            <span className="font-semibold">{stats.enabled}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Built-in:</span>
            <span className="font-semibold">{stats.builtin}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Custom:</span>
            <span className="font-semibold">{stats.custom}</span>
          </div>
        </div>
      </div>

      {/* Plugin Families */}
      <div>
        <h3 className="text-sm font-semibold mb-2">By Type</h3>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {Object.entries(stats.byFamily).map(([family, count]) => (
            <div key={family} className="flex justify-between px-2 py-1 bg-neutral-50 dark:bg-neutral-800 rounded">
              <span className="text-neutral-600 dark:text-neutral-400 capitalize">
                {family.replace(/-/g, ' ')}:
              </span>
              <span className="font-semibold">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Plugin List */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Installed Plugins</h3>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {recentPlugins.map(plugin => (
            <div
              key={plugin.id}
              className={`px-2 py-1.5 text-xs border rounded transition-colors ${
                plugin.active
                  ? 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                  : 'border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{plugin.name}</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {plugin.family} • {plugin.origin}
                  </div>
                </div>
                {plugin.origin !== 'builtin' && (
                  <button
                    onClick={() => handleTogglePlugin(plugin.id, plugin.active)}
                    className={`ml-2 px-2 py-0.5 text-[10px] rounded transition-colors ${
                      plugin.active
                        ? 'bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300'
                        : 'bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300'
                    }`}
                  >
                    {plugin.active ? 'Disable' : 'Enable'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Plugin Management</h3>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => navigate('/settings?tab=plugins')}
            className="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded transition-colors"
          >
            🔌 Plugin Browser
          </button>
          <button
            onClick={() => navigate('/settings?tab=panel-config')}
            className="px-3 py-1.5 text-sm bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded transition-colors"
          >
            🪟 Panel Config
          </button>
        </div>
      </div>
    </div>
  );
}
