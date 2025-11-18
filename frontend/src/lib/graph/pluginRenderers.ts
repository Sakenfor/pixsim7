/**
 * Plugin Node Renderers
 *
 * This file is now deprecated in favor of auto-registration via autoRegisterRenderers.ts
 *
 * PREVIOUS BEHAVIOR:
 * Plugin renderers (e.g., SeductionNodeRenderer, QuestTriggerRenderer) were manually
 * imported and registered here. This required updating this file every time a new
 * plugin node type with a custom renderer was added.
 *
 * NEW BEHAVIOR (AUTO-REGISTRATION):
 * Plugin renderers are now automatically discovered and registered based on the
 * `rendererComponent` field in NodeTypeDefinition. This happens in autoRegisterRenderers.ts
 * which is called from App.tsx after plugins are loaded.
 *
 * HOW IT WORKS:
 * 1. Create your node type plugin (e.g., seductionNode.ts) and set `rendererComponent: 'SeductionNodeRenderer'`
 * 2. Create the renderer component file (e.g., SeductionNodeRenderer.tsx) in components/graph/
 * 3. The auto-registration system will find and register it automatically
 *
 * WHEN TO USE THIS FILE:
 * Only use this file if you need to manually override the auto-registration behavior
 * for specific plugin renderers (e.g., custom defaultSize, special configuration).
 *
 * @deprecated Use autoRegisterRenderers.ts instead
 */

/**
 * Manual plugin renderer overrides
 * Called on app initialization after built-in renderers
 *
 * Note: Most plugin renderers should use auto-registration.
 * Only add manual registrations here if you need custom configuration.
 */
export function registerPluginRenderers() {
  // Previously, plugin renderers were manually registered here
  // Now they are auto-registered via registerRenderersFromNodeTypes()

  // Example of manual override (if needed):
  // nodeRendererRegistry.register({
  //   nodeType: 'my-special-plugin',
  //   component: MySpecialRenderer,
  //   defaultSize: { width: 300, height: 400 },
  //   customHeader: true,
  // });

  console.log('✓ Plugin renderers ready (auto-registered via node type metadata)');
}
