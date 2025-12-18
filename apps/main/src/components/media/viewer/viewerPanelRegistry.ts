/**
 * Asset Viewer Panel Registry
 *
 * Local panel registry for the asset viewer's dockview panels.
 * Only defines the Media panel - QuickGenerate and Info are now global helper panels.
 */

import { createLocalPanelRegistry } from '@lib/dockview';
import { MediaPanel } from './panels/MediaPanel';

/** Panel IDs for the asset viewer (only local panels) */
export type ViewerPanelId = 'media';

/** Create and configure the viewer panel registry */
export function createViewerPanelRegistry() {
  const registry = createLocalPanelRegistry<ViewerPanelId>();

  registry.registerAll([
    {
      id: 'media',
      title: 'Preview',
      component: MediaPanel,
      icon: 'image',
      size: { minHeight: 200 },
    },
    // Note: QuickGenerate and Info panels are now global helper panels
    // They're included via globalPanelIds prop in AssetViewerDockview
  ]);

  return registry;
}

/** Singleton registry instance */
export const viewerPanelRegistry = createViewerPanelRegistry();
