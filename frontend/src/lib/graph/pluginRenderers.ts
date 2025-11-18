/**
 * Manual plugin renderer overrides
 * Called on app initialization after built-in renderers
 *
 * This file is now mostly empty as plugin renderers are auto-registered via
 * registerRenderersFromNodeTypes() based on the rendererComponent field in
 * NodeTypeDefinition.
 *
 * Only add manual registrations here if:
 * 1. You need to override auto-registered renderers with custom configuration
 * 2. You need to register renderers for node types that don't have rendererComponent set
 * 3. You need to provide custom defaultSize or other renderer-specific options
 *
 * Example:
 * ```typescript
 * import { registerRendererFromNodeType } from './rendererBootstrap';
 * import { CustomRenderer } from '../../components/graph/CustomRenderer';
 *
 * registerRendererFromNodeType({
 *   nodeType: 'custom',
 *   component: CustomRenderer,
 *   defaultSize: { width: 300, height: 250 },
 *   preloadPriority: 8, // Override node type priority
 * });
 * ```
 */
export function registerPluginRenderers() {
  // No manual registrations needed - all plugin renderers are auto-registered
  // via registerRenderersFromNodeTypes() in App.tsx

  console.log('✓ Plugin renderer registration (auto-wire enabled)');
}
