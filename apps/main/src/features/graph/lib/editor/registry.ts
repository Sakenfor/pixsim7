/**
 * Graph Editor Registry
 *
 * @deprecated Use `graphEditorSelectors` from '@lib/plugins/catalogSelectors' instead.
 * The PluginCatalog is now the source of truth for graph editors.
 *
 * Registration is now done via `registerGraphEditors()` using pluginRuntime.
 */

// Re-export catalog selectors as the new API
export { graphEditorSelectors } from '@lib/plugins/catalogSelectors';

// Legacy re-export for backwards compatibility (deprecated)
export { graphEditorRegistry } from './editorRegistry';
export type { GraphEditorDefinition } from './types';

// Export registration function
export { registerGraphEditors } from './registerEditors';
