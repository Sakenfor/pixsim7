import { PlansPanel } from '@features/panels/components/dev/PlansPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'plans',
  title: 'Plans',
  component: PlansPanel,
  category: 'dev',
  browsable: true,
  tags: ['plans', 'registry', 'architecture', 'roadmap', 'sync'],
  icon: 'clipboard',
  description: 'Browse and manage plan registry — manifests, sync, events',
  updatedAt: '2026-03-16T00:00:00Z',
  changeNote: 'New plan registry browser with metadata, markdown, sync, and event history.',
  featureHighlights: ['Browse plans by status, view markdown, sync registry, activity feed.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'graph', safeForNonDev: true },
});
