import { PlansGraphPanel } from '@features/panels/components/dev/PlansGraphPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'plans-graph',
  title: 'Plans Graph',
  component: PlansGraphPanel,
  category: 'dev',
  browsable: true,
  tags: ['plans', 'graph', 'roadmap', 'architecture'],
  icon: 'gitBranch',
  description: 'Network view of plan registry — parentId + dependsOn edges, lane clusters, click to open in Plans panel',
  updatedAt: '2026-05-04T00:00:00Z',
  changeNote: 'New plans graph panel — reactflow + dagre, mirrors DependencyGraphPanel pattern.',
  featureHighlights: [
    'Color by status, lane:* tags as cluster backgrounds, umbrellas larger, click to open plan detail.',
  ],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'graph', safeForNonDev: true },
});
