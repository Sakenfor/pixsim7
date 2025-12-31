/**
 * Cube System V2 Plugin
 *
 * @deprecated This plugin is deprecated and no longer loaded at startup.
 *
 * Reasons for deprecation:
 * - Full-screen 3D takeover disrupts normal workflow
 * - Actions were never fully implemented (mostly console.log placeholders)
 * - Heavy GPU usage for minimal benefit
 * - Cube Formation V1 provides floating cubes without the drawbacks
 *
 * The code is preserved for reference but is not registered.
 * See: lib/plugins/bootstrapControlCenters.ts
 *
 * Original description:
 * 3D cube-based control center implementation using Three.js/React Three Fiber.
 * Exposed both as a standard plugin (for settings) and as a
 * control center implementation via ControlCenterManager.
 */

import type { Plugin, PluginAPI } from '@lib/plugins/types';
import type { ControlCenterPluginManifest, ControlCenterPlugin } from '@lib/plugins/controlCenterPlugin';
import { controlCenterRegistry } from '@lib/plugins/controlCenterPlugin';
import { CubeSystemV2 } from './CubeSystemV2';

export const manifest: ControlCenterPluginManifest = {
  id: 'cube-system-v2',
  name: 'Cube Control Center V2',
  version: '1.0.0',
  author: 'PixSim7 Team',
  description: 'Reimagined 3D cube-based control center with spatial intelligence and purpose-driven design',
  icon: '🎲',

  type: 'ui-overlay',

  permissions: [
    'ui:overlay',
    'storage',
    'read:session',
  ],

  main: 'plugin.ts',

  controlCenter: {
    id: 'cubes-v2',
    displayName: 'Cube System V2 (3D)',
    description: '3D cube interface with smart workspaces for creation, editing, and review',
    features: [
      '3D Graphics',
      'Smart Workspaces',
      'Purpose-driven',
      'Natural interactions',
      'WebGL accelerated',
    ],
  },
};

export const plugin: Plugin = {
  async onEnable(api: PluginAPI) {
    console.log('[CubeSystemV2] Plugin enabled');

    // Inform user that Cube System V2 is available via the Control Center selector
    api.ui.showNotification({
      message: '🎲 Cube Control Center V2 enabled. Use the Control Center selector (Ctrl+Shift+X) to switch to it.',
      type: 'success',
      duration: 5000,
    });
  },

  async onDisable() {
    console.log('[CubeSystemV2] Plugin disabled');
  },

  onUninstall() {
    console.log('[CubeSystemV2] Plugin uninstalled');
  },

  renderSettings(api: PluginAPI) {
    // Settings UI for the plugin
    return (
      <div className="space-y-4">
        <h3 className="font-bold text-lg">Cube System Settings</h3>

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={api.storage.get('auto-hide', true)}
              onChange={(e) => api.storage.set('auto-hide', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Auto-hide when not in use</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={api.storage.get('show-grid', true)}
              onChange={(e) => api.storage.set('show-grid', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show 3D grid helper</span>
          </label>

          <div className="pt-2">
            <label className="block text-sm mb-1">Default Workspace</label>
            <select
              value={api.storage.get('default-workspace', 'create')}
              onChange={(e) => api.storage.set('default-workspace', e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800"
            >
              <option value="create">Create Mode</option>
              <option value="edit">Edit Mode</option>
              <option value="review">Review Mode</option>
            </select>
          </div>

          <div className="pt-2">
            <label className="block text-sm mb-1">Animation Speed</label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={api.storage.get('animation-speed', 1)}
              onChange={(e) => api.storage.set('animation-speed', parseFloat(e.target.value))}
              className="w-full"
            />
            <span className="text-xs text-neutral-500">
              {api.storage.get('animation-speed', 1)}x
            </span>
          </div>
        </div>

        <div className="pt-4 border-t">
          <p className="text-xs text-neutral-500 mb-2">
            Tip: Use Ctrl+Shift+X to open the Control Center selector and switch between modes.
          </p>
        </div>
      </div>
    );
  },
};

// Also implement ControlCenterPlugin interface
export const controlCenterPlugin: ControlCenterPlugin = {
  render() {
    return <CubeSystemV2 />;
  },

  cleanup() {
    console.log('[CubeSystemV2] Control center cleanup');
  },
};

// @deprecated - Auto-registration disabled
// This plugin is no longer loaded at startup.
// If you need to test it, uncomment the line below:
// controlCenterRegistry.register(manifest, controlCenterPlugin);
