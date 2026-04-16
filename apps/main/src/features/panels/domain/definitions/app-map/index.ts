import { AppMapPanel } from '@features/panels/components/dev/AppMapPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'app-map',
  title: 'App Map',
  component: AppMapPanel,
  category: 'dev',
  browsable: false,
  tags: ['architecture', 'plugins', 'registries', 'capabilities', 'diagnostics'],
  icon: 'graph',
  description: 'Live map of features, plugins, registries, and architecture diagnostics',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for architecture mapping tool.',
  featureHighlights: ['Live architecture map for features, registries, and plugin surfaces.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'graph' },
});
