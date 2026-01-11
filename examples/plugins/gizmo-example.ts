/**
 * Example: Gizmo Surface Plugin
 *
 * This file demonstrates how a plugin can contribute a custom gizmo surface
 * to the gizmo surface registry.
 *
 * To use this example:
 * 1. Rename this file to remove the `.example` extension
 * 2. Create your gizmo component (e.g., MyCustomGizmo.tsx)
 * 3. Update the import to point to your component
 * 4. Call registerGizmoSurface() from your plugin initialization
 */

import { registerPluginDefinition } from '../../apps/main/src/lib/plugins/pluginRuntime';
import type { GizmoSurfaceDefinition } from './surfaceRegistry';

// Import your custom gizmo component
// import { MyCustomGizmo } from './components/MyCustomGizmo';

/**
 * Example gizmo surface definition
 */
const exampleGizmoSurface: GizmoSurfaceDefinition = {
  id: 'my-custom-gizmo',
  label: 'My Custom Gizmo',
  description: 'A custom gizmo surface contributed by a plugin',
  icon: '🎯',
  category: 'custom',

  // Provide your gizmo component
  // overlayComponent: MyCustomGizmo,

  // Specify which contexts support this gizmo
  supportsContexts: ['game-2d', 'playground'],

  // Optional metadata
  tags: ['plugin', 'custom', 'example'],
  priority: 3,

  // Optional requirements
  requires: {
    features: ['my-custom-feature'],
  },
};

/**
 * Register the plugin gizmo surface
 *
 * This should be called from your plugin initialization function.
 */
export async function registerMyCustomGizmoSurface(): Promise<void> {
  await registerPluginDefinition({
    id: exampleGizmoSurface.id,
    family: 'gizmo-surface',
    origin: 'plugin-dir', // or 'ui-bundle' for dynamically loaded plugins
    source: 'sandbox',
    plugin: exampleGizmoSurface,
    activationState: 'active',
    canDisable: true,
    metadata: {
      author: 'Plugin Author Name',
      version: '1.0.0',
    },
  });

  console.log('[Plugin] Registered custom gizmo surface:', exampleGizmoSurface.id);
}

/**
 * Alternatively, for built-in gizmo surfaces that ship with the app,
 * call registerPluginDefinition with origin: 'builtin'.
 */

// ============================================================================
// Example Gizmo Component
// ============================================================================

/**
 * Here's a minimal example of what your gizmo component might look like:
 *
 * ```tsx
 * // MyCustomGizmo.tsx
 *
 * import type { GizmoComponentProps } from '@pixsim7/scene.gizmos';
 *
 * export function MyCustomGizmo({ config, state, onAction }: GizmoComponentProps) {
 *   return (
 *     <div className="my-custom-gizmo">
 *       <h3>My Custom Gizmo</h3>
 *       <p>This is a custom gizmo surface!</p>
 *
 *       <div className="zones">
 *         {config.zones.map(zone => (
 *           <button
 *             key={zone.id}
 *             onClick={() => onAction({
 *               type: 'segment',
 *               value: zone.segmentId || '',
 *               transition: 'smooth',
 *             })}
 *           >
 *             {zone.label}
 *           </button>
 *         ))}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */

// ============================================================================
// Plugin Discovery Integration
// ============================================================================

/**
 * If you want your plugin to be auto-discovered, add a discovery config:
 *
 * In src/lib/plugins/discoveryConfigs.ts:
 *
 * ```ts
 * {
 *   family: 'gizmo-surface',
 *   patterns: ['plugins/gizmos/register*.ts'],
 *   origin: 'plugin-dir',
 *   extractionMode: 'named-export',
 *   exportPattern: 'register*GizmoSurface',
 *   eager: true,
 * }
 * ```
 *
 * Then your registration function will be auto-discovered and called!
 */
