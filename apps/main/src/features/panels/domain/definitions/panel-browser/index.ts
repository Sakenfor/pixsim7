import { PanelBrowserPanel } from './PanelBrowserPanel';

import { definePanelWithMeta } from '../../../lib/definePanel';

export default definePanelWithMeta({
  id: 'panel-browser',
  title: 'Panel Browser',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Replaced legacy launcher with searchable panel browser metadata surfaced in UI.',
  featureHighlights: [
    'Search and category-grouping for all registered panels.',
    'Dock and floating launch actions from a single browser panel.',
  ],
  component: PanelBrowserPanel,
  category: 'utilities',
  tags: ['panels', 'launcher', 'browser', 'utilities'],
  icon: 'layoutGrid',
  description: 'Browse all available panels and launch them docked or floating',
  availableIn: ['workspace', 'control-center'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
