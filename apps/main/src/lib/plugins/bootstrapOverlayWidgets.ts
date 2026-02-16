/**
 * Overlay Widget Plugin Auto-Discovery
 *
 * Uses Vite's import.meta.glob for build-time discovery of overlay widget plugins.
 * Follows the same pattern as bootstrapSceneViews.ts.
 *
 * Convention:
 * - Overlay widget plugins live in `src/plugins/overlay-widgets/`
 * - Each plugin is a folder with an `index.ts` that exports:
 *   - `widget: WidgetDefinition`
 *
 * Directory structure:
 * ```
 * src/plugins/overlay-widgets/
 * ├── badge/
 * │   └── index.ts           # exports widget
 * ├── button/
 * │   └── index.ts
 * └── scene-view/
 *     └── index.ts
 * ```
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import type { WidgetDefinition } from '@lib/widgets';

import type { PluginRegistration } from './registration';

/**
 * Overlay widget plugin module shape.
 */
interface OverlayWidgetPluginModule {
  widget: WidgetDefinition;
}

/**
 * Import all overlay widget plugin modules using Vite's glob import.
 * This is evaluated at build time.
 */
const overlayWidgetModules = import.meta.glob<OverlayWidgetPluginModule>(
  ['../../plugins/overlay-widgets/*/index.ts'],
  { eager: true }
);

/**
 * Build plugin registrations for all discovered overlay widgets.
 * Returns PluginRegistration objects that can be merged with other registrations.
 */
export async function discoverOverlayWidgetRegistrations(): Promise<PluginRegistration[]> {
  const registrations: PluginRegistration[] = [];

  for (const [path, module] of Object.entries(overlayWidgetModules)) {
    if (module.widget) {
      const widget = module.widget;
      registrations.push({
        id: `overlay-widget:${widget.id}`,
        family: 'overlay-widget',
        origin: 'builtin',
        source: 'source',
        label: widget.title,
        register: async () => {
          await registerPluginDefinition({
            id: `overlay-widget:${widget.id}`,
            family: 'overlay-widget',
            origin: 'builtin',
            source: 'source',
            plugin: widget,
            canDisable: false,
          });
          console.debug(`[OverlayWidget] Registered ${widget.id} from ${path}`);
        },
      });
    } else {
      console.warn(`[OverlayWidget] Plugin at ${path} missing widget export`);
    }
  }

  return registrations;
}
