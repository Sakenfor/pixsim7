/**
 * Cube System V2 Plugin
 *
 * A revolutionary 3D cube-based control center that replaces the traditional dock.
 * Features purpose-driven cubes with spatial intelligence and natural interactions.
 */

import type { Plugin, PluginAPI } from '../../../lib/plugins/types';
import type { ControlCenterPluginManifest, ControlCenterPlugin } from '../../../lib/plugins/controlCenterPlugin';
import { controlCenterRegistry } from '../../../lib/plugins/controlCenterPlugin';
import { CubeSystemV2 } from './CubeSystemV2';

export const manifest: ControlCenterPluginManifest = {
  id: 'cube-system-v2',
  name: 'Cube Control Center V2',
  version: '1.0.0',
  author: 'PixSim7 Team',
  description: 'Reimagined 3D cube-based control center with spatial intelligence and purpose-driven design',
  icon: '✨',

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
    description: 'Revolutionary 3D cube interface with purpose-driven design and smart workspaces',
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

    // Add the cube system as a full-screen overlay
    api.ui.addOverlay({
      id: 'cube-system-v2-overlay',
      position: 'center',
      render: () => CubeSystemV2({}),
      zIndex: 45, // Just above floating panels (40) but below modals (50)
    });

    // Add menu item to toggle cube system
    api.ui.addMenuItem({
      id: 'toggle-cube-system',
      label: '🎲 Cube Control Center',
      icon: '🎲',
      onClick: () => {
        // Toggle visibility
        const visible = api.storage.get('cube-system-visible', true);
        api.storage.set('cube-system-visible', !visible);

        if (!visible) {
          api.ui.showNotification({
            message: 'Cube System activated',
            type: 'info',
            duration: 2000,
          });
        }
      },
    });

    // Show welcome notification
    api.ui.showNotification({
      message: '🎲 Cube Control Center V2 activated! Hover over bottom edge to reveal.',
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
            💡 Tip: Use Ctrl+Shift+C to quickly toggle the cube system
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

// Auto-register as a control center option
controlCenterRegistry.register(manifest, controlCenterPlugin);
