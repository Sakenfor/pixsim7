/**
 * Brain Tool Registry
 *
 * @deprecated Use `brainToolSelectors` from '@lib/plugins/catalogSelectors' instead.
 * The PluginCatalog is now the source of truth for brain tools.
 *
 * Registration is now done via `registerBrainTools()` using pluginRuntime.
 *
 * @example
 * // In main.tsx or app initialization:
 * import { registerBrainTools } from '@features/brainTools/lib';
 * registerBrainTools();
 */

// Re-export catalog selectors as the new API
export { brainToolSelectors } from '@lib/plugins/catalogSelectors';

// Legacy re-export for backwards compatibility (deprecated)
export { brainToolRegistry } from './types';
export type { BrainToolPlugin, BrainToolContext, BrainToolCategory } from './types';

// Export registration function
export { registerBrainTools } from './registerBrainTools';
