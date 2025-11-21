/**
 * Simulation Plugins Panel (Phase 8)
 *
 * UI for viewing and managing simulation plugins.
 * Shows registered plugins, their status, and allows enabling/disabling them.
 */

import { useState } from 'react';
import { Panel, Button } from '@pixsim7/shared.ui';
import type { SimulationPlugin } from '../../lib/simulation/hooks';

interface SimulationPluginsPanelProps {
  plugins: SimulationPlugin[];
  onTogglePlugin: (pluginId: string, enabled: boolean) => void;
}

export function SimulationPluginsPanel({
  plugins,
  onTogglePlugin,
}: SimulationPluginsPanelProps) {
  const [expandedPluginId, setExpandedPluginId] = useState<string | null>(null);

  const enabledPlugins = plugins.filter((p) => p.enabled);
  const disabledPlugins = plugins.filter((p) => !p.enabled);

  const getHookCount = (plugin: SimulationPlugin): number => {
    return Object.values(plugin.hooks).filter((h) => h !== undefined).length;
  };

  const getHookNames = (plugin: SimulationPlugin): string[] => {
    return Object.keys(plugin.hooks).filter((k) => (plugin.hooks as any)[k] !== undefined);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Panel className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Simulation Plugins</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
              {enabledPlugins.length} enabled, {disabledPlugins.length} disabled
            </p>
          </div>
          <div className="text-xs text-neutral-500">
            {plugins.length} total plugin{plugins.length !== 1 ? 's' : ''}
          </div>
        </div>
      </Panel>

      {plugins.length === 0 && (
        <Panel className="p-8 text-center">
          <p className="text-sm text-neutral-500">No plugins registered</p>
          <p className="text-xs text-neutral-400 mt-2">
            Plugins will appear here when registered via the hooks system
          </p>
        </Panel>
      )}

      {/* Enabled Plugins */}
      {enabledPlugins.length > 0 && (
        <Panel className="p-4">
          <h3 className="text-sm font-semibold mb-3">Enabled Plugins</h3>
          <div className="space-y-2">
            {enabledPlugins.map((plugin) => (
              <div
                key={plugin.id}
                className="p-3 rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{plugin.name}</span>
                      {plugin.version && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700">
                          v{plugin.version}
                        </span>
                      )}
                      <span className="w-2 h-2 rounded-full bg-green-500" title="Enabled" />
                    </div>

                    {plugin.description && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                        {plugin.description}
                      </p>
                    )}

                    {plugin.author && (
                      <p className="text-xs text-neutral-500 mt-1">by {plugin.author}</p>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-neutral-600 dark:text-neutral-400">
                        {getHookCount(plugin)} hook{getHookCount(plugin) !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() =>
                          setExpandedPluginId(
                            expandedPluginId === plugin.id ? null : plugin.id
                          )
                        }
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {expandedPluginId === plugin.id ? 'Hide' : 'Show'} details
                      </button>
                    </div>

                    {expandedPluginId === plugin.id && (
                      <div className="mt-2 p-2 rounded bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700">
                        <div className="text-xs font-semibold mb-1">Hooks:</div>
                        <div className="space-y-1">
                          {getHookNames(plugin).map((hookName) => (
                            <div
                              key={hookName}
                              className="text-xs font-mono text-neutral-700 dark:text-neutral-300"
                            >
                              • {hookName}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onTogglePlugin(plugin.id, false)}
                  >
                    Disable
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Disabled Plugins */}
      {disabledPlugins.length > 0 && (
        <Panel className="p-4">
          <h3 className="text-sm font-semibold mb-3">Disabled Plugins</h3>
          <div className="space-y-2">
            {disabledPlugins.map((plugin) => (
              <div
                key={plugin.id}
                className="p-3 rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                        {plugin.name}
                      </span>
                      {plugin.version && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700">
                          v{plugin.version}
                        </span>
                      )}
                      <span className="w-2 h-2 rounded-full bg-neutral-400" title="Disabled" />
                    </div>

                    {plugin.description && (
                      <p className="text-xs text-neutral-500 mt-1">{plugin.description}</p>
                    )}

                    <div className="text-xs text-neutral-500 mt-2">
                      {getHookCount(plugin)} hook{getHookCount(plugin) !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onTogglePlugin(plugin.id, true)}
                  >
                    Enable
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Plugin Info */}
      <Panel className="p-4">
        <h3 className="text-sm font-semibold mb-2">About Simulation Plugins</h3>
        <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-2">
          <p>
            Simulation plugins extend the playground with custom functionality without affecting
            live sessions.
          </p>
          <div>
            <div className="font-semibold mb-1">Available Hook Types:</div>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                <code className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1 rounded">
                  beforeTick
                </code>{' '}
                - Runs before each simulation tick
              </li>
              <li>
                <code className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1 rounded">
                  afterTick
                </code>{' '}
                - Runs after each simulation tick
              </li>
              <li>
                <code className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1 rounded">
                  onTick
                </code>{' '}
                - Generates events during tick execution
              </li>
              <li>
                <code className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1 rounded">
                  onScenarioLoaded
                </code>{' '}
                - Triggers when a scenario is loaded
              </li>
              <li>
                <code className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1 rounded">
                  onSimulationStarted
                </code>{' '}
                - Triggers when simulation starts
              </li>
              <li>
                <code className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1 rounded">
                  onSimulationStopped
                </code>{' '}
                - Triggers when simulation stops
              </li>
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}
