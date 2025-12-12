/**
 * Load Default Gizmo & Tool Packs
 *
 * Importing this module ensures all default packs are loaded and registered
 * with the canonical registry in @pixsim7/scene-gizmos.
 *
 * Use this in:
 * - App initialization/bootstrap
 * - Gizmo Lab and other dev tools
 * - Editor contexts that need gizmo/tool selection
 *
 * Packs are loaded in dependency order:
 * 1. Base pack (orb, constellation, touch, temperature, energy)
 * 2. Enhanced pack (adds feather)
 * 3. Water & Banana pack (adds water, banana)
 * 4. Rings pack (adds rings gizmo)
 * 5. Romance pack (adds caress, feather, silk, pleasure, hand-3d)
 */

import './registry';                  // Base pack
import './registry-enhanced';         // Enhanced pack
import './registry-water-banana';     // Water & Banana pack
import './registry-rings';            // Rings pack
import './registry-romance';          // Romance pack
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
} from '@pixsim7/scene.gizmos';
