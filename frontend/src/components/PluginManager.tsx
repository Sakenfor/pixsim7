/**
 * Plugin Manager UI Component
 *
 * Allows users to:
 * - View installed plugins
 * - Enable/disable plugins
 * - Install new plugins
 * - Configure plugin settings
 */

import { useState, useEffect } from 'react';
import { Button, Panel, Badge } from '@pixsim7/ui';
import { pluginManager } from '../lib/plugins';
import type { PluginEntry } from '../lib/plugins/types';

export function PluginManagerUI() {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = () => {
    const allPlugins = pluginManager.getPlugins();
    setPlugins(allPlugins);
  };

  const handleToggle = async (pluginId: string, enable: boolean) => {
    setError(null);
    try {
      if (enable) {
        await pluginManager.enablePlugin(pluginId);
      } else {
        await pluginManager.disablePlugin(pluginId);
      }
      loadPlugins();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleUninstall = async (pluginId: string) => {
    if (!confirm(`Uninstall plugin "${pluginId}"?`)) return;

    setError(null);
    try {
      await pluginManager.uninstallPlugin(pluginId);
      loadPlugins();
      if (selectedPlugin === pluginId) {
        setSelectedPlugin(null);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleInstallDemo = async () => {
    // Demo: Install the example relationship tracker
    try {
      const { manifest } = await import('../lib/plugins/examples/RelationshipTracker.plugin');
      await pluginManager.installPlugin(manifest, '// Plugin code would go here');
      loadPlugins();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const selected = plugins.find(p => p.manifest.id === selectedPlugin);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Plugin Manager</h1>
        <Button size="sm" variant="primary" onClick={handleInstallDemo}>
          Install Demo Plugin
        </Button>
      </div>

      {error && (
        <Panel className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Plugin List */}
        <Panel className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold">Installed Plugins ({plugins.length})</h2>
          {plugins.length === 0 ? (
            <p className="text-xs text-neutral-500">No plugins installed</p>
          ) : (
            <div className="space-y-2">
              {plugins.map(plugin => (
                <button
                  key={plugin.manifest.id}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                    selectedPlugin === plugin.manifest.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
                  }`}
                  onClick={() => setSelectedPlugin(plugin.manifest.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium flex items-center gap-1">
                      {plugin.manifest.icon && <span>{plugin.manifest.icon}</span>}
                      {plugin.manifest.name}
                    </span>
                    <Badge
                      color={
                        plugin.state === 'enabled'
                          ? 'green'
                          : plugin.state === 'error'
                          ? 'red'
                          : 'gray'
                      }
                      className="text-[10px]"
                    >
                      {plugin.state}
                    </Badge>
                  </div>
                  <p className="text-xs text-neutral-500">v{plugin.manifest.version}</p>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Plugin Details */}
        <Panel className="lg:col-span-2 space-y-3">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {selected.manifest.icon && <span className="text-2xl">{selected.manifest.icon}</span>}
                  {selected.manifest.name}
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={selected.state === 'enabled' ? 'secondary' : 'primary'}
                    onClick={() =>
                      handleToggle(selected.manifest.id, selected.state !== 'enabled')
                    }
                  >
                    {selected.state === 'enabled' ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleUninstall(selected.manifest.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Uninstall
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                    Description
                  </h3>
                  <p className="text-sm">{selected.manifest.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                      Version
                    </h3>
                    <p>{selected.manifest.version}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                      Author
                    </h3>
                    <p>{selected.manifest.author}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                      Type
                    </h3>
                    <p className="capitalize">{selected.manifest.type}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                      State
                    </h3>
                    <Badge color={selected.state === 'enabled' ? 'green' : 'gray'}>
                      {selected.state}
                    </Badge>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                    Permissions
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {selected.manifest.permissions.map(perm => (
                      <Badge key={perm} color="blue" className="text-xs">
                        {perm}
                      </Badge>
                    ))}
                  </div>
                </div>

                {selected.state === 'error' && selected.error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                    <h3 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                      Error
                    </h3>
                    <p className="text-sm text-red-600 dark:text-red-400">{selected.error}</p>
                  </div>
                )}

                {selected.installedAt && (
                  <div className="text-xs text-neutral-500">
                    Installed: {new Date(selected.installedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </>
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
