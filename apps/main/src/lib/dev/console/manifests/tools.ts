/**
 * Tools Console Manifest
 *
 * Declares tool and gizmo operations.
 * Uses dynamic import to delegate to the gizmos feature.
 */

import type { ConsoleManifest } from './types';

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
    import('@/gizmos/console').then(({ registerGizmoConsoleSync }) => {
      registerGizmoConsoleSync(opsRegistry, dataRegistry);
    });
  },
};
