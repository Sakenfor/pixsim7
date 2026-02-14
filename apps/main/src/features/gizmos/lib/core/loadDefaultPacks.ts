/**
 * Load Default Gizmo & Tool Packs
 *
 * Importing this module ensures all default packs are loaded and registered
 * with the canonical registry in @pixsim7/interaction.gizmos.
 *
 * Use this in:
 * - App initialization/bootstrap
 * - Gizmo Lab and other dev tools
 * - Editor contexts that need gizmo/tool selection
 *
 * Packs loaded:
 * 1. Base pack (orb, constellation, touch, temperature, energy)
 * 2. Water & Banana pack (water, banana tools)
 * 3. Rings pack (rings gizmo)
 * 4. Romance pack (body-map gizmo - tools come from plugins)
 *
 * Note: Romance tools (feather, caress, etc.) now come from plugins:
 * - touch-tools plugin
 * - sensation-tools plugin
 */

import './registry';                  // Base pack (core gizmos + tools)
import './registry-water-banana';     // Water & Banana pack
import './registry-rings';            // Rings pack
import './registry-romance';          // Romance pack (body-map gizmo only)
import './console';                   // Console integration (self-registers)

// Re-export registry functions for convenience
export {
  getAllGizmos,
  getAllTools,
  getGizmo,
  getTool,
  getGizmosByCategory,
  getToolsByType,
  registerGizmo,
  registerTool,
} from '@pixsim7/interaction.gizmos';
