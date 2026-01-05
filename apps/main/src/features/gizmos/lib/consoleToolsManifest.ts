/**
 * Tools Console Manifest
 *
 * Declares tool and gizmo operations.
 * Feature-owned manifest for the gizmos feature.
 * Uses dynamic import to delegate to the gizmos console registration.
 */

import type { ConsoleManifest } from '@lib/dev/console/manifests/types';

/**
 * Tools console manifest
 *
 * Registers:
 * - Tools category with tool selection and parameter override operations
 * - Gizmos category with gizmo operations
 *
 * Uses dynamic import to avoid circular dependencies with the gizmos feature.
 */
export const toolsManifest: ConsoleManifest = {
  id: 'tools',
  name: 'Tools & Gizmos',
  description: 'Interactive tool operations, parameter overrides, and cheats',
  dependencies: ['core'],

  // Dynamic import to avoid circular dependency
  register: ({ opsRegistry, dataRegistry }) => {
    // Import from local console.ts in the same feature
    import('./core/console').then(({ registerGizmoConsoleSync }) => {
      registerGizmoConsoleSync(opsRegistry, dataRegistry);
    });
  },
};
