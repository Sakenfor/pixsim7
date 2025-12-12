/**
 * Arc Node Renderers (Auto-Wire Enabled)
 *
 * This file is now mostly empty as arc node renderers are auto-registered via
 * registerRenderersFromNodeTypes() based on the rendererComponent field in
 * NodeTypeDefinition.
 *
 * The auto-wire system (in autoRegisterRenderers.ts) handles:
 * - Arc nodes → ArcNodeRenderer
 * - Quest nodes → QuestNodeRenderer
 * - Milestone nodes → MilestoneNodeRenderer
 * - Arc group nodes → DefaultNodeRenderer
 *
 * How it works:
 * 1. NodeTypeDefinition in arcNodeTypes.ts includes rendererComponent: 'ArcNodeRenderer'
 * 2. Auto-wire discovers /src/components/graph/ArcNodeRenderer.tsx via import.meta.glob
 * 3. Renderer is lazy-loaded and registered automatically
 *
 * Only add manual registrations here if you need to override the auto-wire behavior
 * with custom configuration (e.g., special defaultSize, custom preloadPriority).
 */

/**
 * Register arc node renderers
 * Now a no-op since renderers are auto-wired
 */
export function registerArcRenderers() {
  // All arc renderers are now auto-registered via registerRenderersFromNodeTypes()
  // in App.tsx. The system discovers renderers based on the rendererComponent field
  // in each NodeTypeDefinition.

  console.log('✓ Arc renderer registration (auto-wire enabled)');
}
