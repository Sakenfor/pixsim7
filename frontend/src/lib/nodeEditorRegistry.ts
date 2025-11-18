/**
 * Node Editor Registry
 *
 * Dynamic registry for node editor components with lazy loading support.
 * Editors are auto-discovered using glob patterns and loaded on-demand.
 *
 * USAGE:
 * ```typescript
 * import { nodeEditorRegistry } from './lib/nodeEditorRegistry';
 *
 * // Get an editor loader
 * const editorLoader = nodeEditorRegistry.getEditor('SeductionNodeEditor');
 * if (editorLoader) {
 *   const module = await editorLoader();
 *   const EditorComponent = module.default;
 *   // Render <EditorComponent ... />
 * }
 * ```
 */

import type { ComponentType } from 'react';

/**
 * Editor module loader function
 * Returns a promise that resolves to a module with a default export
 */
export type EditorLoader = () => Promise<{ default: ComponentType<any> }>;

/**
 * Registry storage
 * Maps editor component names to their loader functions
 */
const editorLoaders = new Map<string, EditorLoader>();

/**
 * Auto-discover editor components using glob patterns
 *
 * Convention:
 * - Editors are located in /src/components/inspector/**\/*.{tsx,ts}
 * - File names map to editor IDs (e.g., SeductionNodeEditor.tsx → "SeductionNodeEditor")
 * - Files must export a default component
 */
function discoverEditors() {
  // Use Vite's import.meta.glob to collect all editor modules
  // The eager:false option ensures lazy loading
  const editorModules = import.meta.glob<{ default: ComponentType<any> }>(
    '/src/components/inspector/**/*.{tsx,ts}',
    { eager: false }
  );

  // Register each discovered editor
  for (const [path, loader] of Object.entries(editorModules)) {
    // Extract filename from path (e.g., "/src/components/inspector/SeductionNodeEditor.tsx" → "SeductionNodeEditor")
    const match = path.match(/\/([^/]+)\.(tsx?|jsx?)$/);
    if (match) {
      const editorId = match[1];

      // Skip non-editor files
      if (editorId === 'index' || editorId === 'InspectorPanel' || editorId === 'useNodeEditor') {
        continue;
      }

      // Register the editor loader
      editorLoaders.set(editorId, loader as EditorLoader);
    }
  }

  console.log(
    `[NodeEditorRegistry] Discovered ${editorLoaders.size} editor(s):`,
    Array.from(editorLoaders.keys()).join(', ')
  );
}

/**
 * Manually register an editor component
 *
 * @param id - Editor component name (e.g., "SeductionNodeEditor")
 * @param loader - Async function that loads the editor module
 *
 * @example
 * ```typescript
 * nodeEditorRegistry.registerEditor(
 *   'CustomNodeEditor',
 *   () => import('./components/CustomNodeEditor')
 * );
 * ```
 */
export function registerEditor(id: string, loader: EditorLoader): void {
  editorLoaders.set(id, loader);
  console.log(`[NodeEditorRegistry] Registered editor: ${id}`);
}

/**
 * Get an editor loader by ID
 *
 * @param id - Editor component name
 * @returns The loader function, or undefined if not found
 *
 * @example
 * ```typescript
 * const loader = nodeEditorRegistry.getEditor('SeductionNodeEditor');
 * if (loader) {
 *   const module = await loader();
 *   const EditorComponent = module.default;
 * }
 * ```
 */
export function getEditor(id: string): EditorLoader | undefined {
  return editorLoaders.get(id);
}

/**
 * Get all registered editor IDs
 *
 * @returns Array of editor component names
 */
export function getAllEditorIds(): string[] {
  return Array.from(editorLoaders.keys());
}

/**
 * Check if an editor is registered
 *
 * @param id - Editor component name
 * @returns True if the editor is registered
 */
export function hasEditor(id: string): boolean {
  return editorLoaders.has(id);
}

/**
 * Clear all registered editors (useful for testing)
 */
export function clearEditors(): void {
  editorLoaders.clear();
}

/**
 * Node Editor Registry API
 */
export const nodeEditorRegistry = {
  registerEditor,
  getEditor,
  getAllEditorIds,
  hasEditor,
  clearEditors,
};

// Auto-discover editors on module load
discoverEditors();
