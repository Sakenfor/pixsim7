/**
 * Built-in Region Drawers
 *
 * Import this module to register all built-in drawers.
 */

// Import drawers to trigger their auto-registration
import './rectTool';
import './pathTool';
import './box3dTool';

// Re-export for direct access if needed
export { rectDrawer } from './rectTool';
export { pathDrawer } from './pathTool';
export { box3dDrawer } from './box3dTool';
