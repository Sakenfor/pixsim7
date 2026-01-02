import { registerArcRenderersFromNodeTypes } from './autoRegisterRenderers';

/**
 * Arc Node Renderers (Auto-Wire Enabled)
 *
 * This file is now mostly empty as arc node renderers are auto-registered via
 * registerArcRenderersFromNodeTypes() based on the rendererComponent field in
 * NodeTypeDefinition.
 *
 * The auto-wire system (in autoRegisterRenderers.ts) handles:
 * - Arc nodes -> ArcNodeRenderer
 * - Quest nodes -> QuestNodeRenderer
 * - Milestone nodes -> MilestoneNodeRenderer
 * - Arc group nodes -> DefaultNodeRenderer
 *
 * Only add manual registrations here if you need to override the auto-wire behavior
 * with custom configuration (e.g., special defaultSize, custom preloadPriority).
 */

/**
 * Register arc node renderers
 * Auto-wired from node type definitions
 */
export function registerArcRenderers() {
  registerArcRenderersFromNodeTypes({
    verbose: true,
    strict: false,
  });
}
