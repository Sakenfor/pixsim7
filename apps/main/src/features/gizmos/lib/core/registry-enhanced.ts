/**
 * Enhanced Gizmo Pack - Extends base pack with additional tools
 *
 * Note: Feather tool has been moved to registry-romance.ts to avoid duplication.
 * Import featherTool from there if needed.
 */

// Re-export base gizmos and tools for convenience
export {
  orbGizmo,
  constellationGizmo,
  touchTool,
  temperatureTool,
  energyTool,
  defaultGizmos,
  defaultTools,
} from './registry';

// Re-export feather from romance pack (canonical location)
export { featherTool } from './registry-romance';

// ============================================================================
// Helper exports
// ============================================================================

// Enhanced tools are now consolidated in romance pack
export { romanceTools as enhancedTools } from './registry-romance';
