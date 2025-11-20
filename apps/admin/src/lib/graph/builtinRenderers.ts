/**
 * Builtin Node Renderers (Auto-Wire Enabled)
 *
 * This file is now mostly empty as builtin node renderers are auto-registered via
 * registerRenderersFromNodeTypes() based on the rendererComponent field in
 * NodeTypeDefinition.
 *
 * The auto-wire system (in autoRegisterRenderers.ts) handles:
 * - Video nodes → VideoNodeRenderer
 * - Choice nodes → ChoiceNodeRenderer
 * - Action, condition, end, scene_call, return, generation, node_group → DefaultNodeRenderer
 *
 * How it works:
 * 1. NodeTypeDefinition includes rendererComponent: 'VideoNodeRenderer'
 * 2. Auto-wire discovers /src/components/graph/VideoNodeRenderer.tsx via import.meta.glob
 * 3. Renderer is lazy-loaded and registered automatically
 *
 * Only add manual registrations here if you need to override the auto-wire behavior
 * with custom configuration (e.g., special defaultSize, custom preloadPriority).
 */

/**
 * Register built-in node renderers
 * Now a no-op since renderers are auto-wired
 */
export function registerBuiltinRenderers() {
  // All builtin renderers are now auto-registered via registerRenderersFromNodeTypes()
  // in App.tsx. The system discovers renderers based on the rendererComponent field
  // in each NodeTypeDefinition.

  console.log('✓ Builtin renderer registration (auto-wire enabled)');
}
