/**
 * Water & Banana Gizmo Pack - Combined re-exports
 *
 * This file exists for backwards compatibility.
 * Water and banana tools are now in separate registries:
 * - registry-water.ts
 * - registry-banana.ts
 *
 * Prefer importing from the individual registries directly.
 */

// Re-export individual tools from their separate registries
export { waterTool, waterTools } from './registry-water';
export { bananaTool, bananaTools } from './registry-banana';

// Combined export for backwards compatibility
import { waterTool } from './registry-water';
import { bananaTool } from './registry-banana';

export const waterBananaTools = [waterTool, bananaTool];
