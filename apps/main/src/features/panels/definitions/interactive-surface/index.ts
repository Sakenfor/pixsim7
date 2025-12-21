/**
 * Interactive Surface Panel Definition
 *
 * Self-contained panel definition using the auto-discovery pattern.
 * This file is automatically discovered and registered at startup.
 */

import { definePanel } from '../../lib/definePanel';
import { InteractiveSurfacePanel } from './InteractiveSurfacePanel';

export default definePanel({
  id: 'interactive-surface',
  title: 'Interactive Surface',
  icon: 'layers',
  category: 'tools',
  tags: ['interactive', 'surface', 'mask', 'annotation', 'inpaint', 'overlay'],
  description: 'Interactive overlay for mask creation, annotations, and image tagging',

  component: InteractiveSurfacePanel,

  // This panel is available in these contexts
  contexts: ['asset-viewer', 'workspace'],

  // Only show when there's an asset
  showWhen: (ctx) => !!ctx.currentAsset,
  requiresContext: true,

  supportsCompactMode: false,
  supportsMultipleInstances: false,
});

// Re-export component and types for direct imports
export { InteractiveSurfacePanel } from './InteractiveSurfacePanel';
export type {
  InteractiveSurfacePanelProps,
  InteractiveSurfacePanelContext,
} from './InteractiveSurfacePanel';
