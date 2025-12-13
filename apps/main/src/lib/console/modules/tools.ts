/**
 * Tools Console Module
 *
 * Thin wrapper that delegates to lib/gizmos/console for actual registration.
 * The gizmos feature owns its console commands.
 */

import type { ConsoleModule } from '../moduleRegistry';
import { opsRegistry } from '../opsRegistry';
import { dataRegistry } from '../dataRegistry';

// Re-export the store for backwards compatibility
export { useToolConsoleStore } from '@/gizmos/console';

export const toolsModule: ConsoleModule = {
  id: 'tools',
  name: 'Tools & Gizmos',
  description: 'Interactive tool operations, parameter overrides, and cheats',
  dependencies: ['core'],
  register: () => {
    // Delegate to gizmos feature's registration
    // Use dynamic import to avoid circular dependency
    import('@/gizmos/console').then(({ registerGizmoConsoleSync }) => {
      registerGizmoConsoleSync(opsRegistry, dataRegistry);
    });
  },
};
