/**
 * World Tool Plugin Registry
 *
 * @deprecated Use `worldToolSelectors` from '@lib/plugins/catalogSelectors' instead.
 * The PluginCatalog is now the source of truth for world tools.
 *
 * Registration is now done via `registerWorldTools()` using pluginRuntime.
 *
 * @example
 * // In main.tsx or app initialization:
 * import { registerWorldTools } from '@features/worldTools/lib';
 * registerWorldTools();
 */

// Re-export catalog selectors as the new API
export { worldToolSelectors } from '@lib/plugins/catalogSelectors';

// Legacy re-export for backwards compatibility (deprecated)
export { worldToolRegistry } from './types';
export type { WorldToolPlugin, WorldToolContext, WorldToolCategory } from './types';

// Export registration function
export { registerWorldTools } from './registerWorldTools';
