/**
 * World Manifest Viewer World Tool Plugin
 *
 * Displays world manifest configuration including enabled plugins, arc graphs, etc.
 */

import type { WorldToolPlugin } from '../lib/types';
import type { WorldManifest } from '@lib/registries';
import { Badge } from '@pixsim7/shared.ui';

export const worldManifestDebugTool: WorldToolPlugin = {
  id: 'world-manifest-debug',
  name: 'World Manifest',
  description: 'View world configuration and enabled features',
  icon: '📋',
  category: 'debug',

  // Show when we have a world
  whenVisible: (context) => context.worldDetail !== null,

  render: (context) => {
    const { worldDetail } = context;

    if (!worldDetail) {
      return (
        <div className="text-sm text-neutral-500">
          No world selected
        </div>
      );
    }

    const meta = worldDetail.meta || {};
    const manifest = meta.manifest as WorldManifest | undefined;

    return (
      <div className="space-y-4">
        {/* World Info */}
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
          <div className="font-semibold text-sm mb-1">{worldDetail.name}</div>
          <div className="text-xs text-neutral-600 dark:text-neutral-400">
            World ID: #{worldDetail.id}
          </div>
        </div>

        {/* Manifest */}
        {manifest ? (
          <div className="space-y-3">
            {/* Turn Preset */}
            {manifest.turn_preset && (
              <div>
                <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                  Turn Preset
                </div>
                <Badge color="blue">{manifest.turn_preset}</Badge>
              </div>
            )}

            {/* Enabled Arc Graphs */}
            {manifest.enabled_arc_graphs && manifest.enabled_arc_graphs.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                  Enabled Arc Graphs
                </div>
                <div className="flex flex-wrap gap-1">
                  {manifest.enabled_arc_graphs.map((graph) => (
                    <Badge key={graph} color="purple">{graph}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Enabled Plugins */}
            {manifest.enabled_plugins && manifest.enabled_plugins.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                  Enabled Plugins
                </div>
                <div className="flex flex-wrap gap-1">
                  {manifest.enabled_plugins.map((plugin) => (
                    <Badge key={plugin} color="green">{plugin}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Other Manifest Fields */}
            {Object.keys(manifest).filter(
              key => !['turn_preset', 'enabled_arc_graphs', 'enabled_plugins'].includes(key)
            ).length > 0 && (
              <div>
                <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                  Additional Configuration
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded border border-neutral-200 dark:border-neutral-700 font-mono text-xs overflow-x-auto">
                  <pre>{JSON.stringify(
                    Object.fromEntries(
                      Object.entries(manifest).filter(
                        ([key]) => !['turn_preset', 'enabled_arc_graphs', 'enabled_plugins'].includes(key)
                      )
                    ),
                    null,
                    2
                  )}</pre>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">
            No manifest found in world.meta
          </div>
        )}

        {/* Full Meta (if has other fields) */}
        {Object.keys(meta).filter(key => key !== 'manifest').length > 0 && (
          <div>
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              Other Meta Fields
            </div>
            <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded border border-neutral-200 dark:border-neutral-700 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
              <pre>{JSON.stringify(
                Object.fromEntries(
                  Object.entries(meta).filter(([key]) => key !== 'manifest')
                ),
                null,
                2
              )}</pre>
            </div>
          </div>
        )}
      </div>
    );
  },
};
