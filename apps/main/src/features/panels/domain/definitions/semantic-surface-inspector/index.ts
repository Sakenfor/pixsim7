import { definePanel } from '../../../lib/definePanel';

import { SemanticSurfaceInspectorPanel } from './SemanticSurfaceInspectorPanel';

export { SemanticSurfaceInspectorPanel };

export default definePanel({
  id: 'semantic-surface-inspector',
  title: 'Semantic Surface Inspector',
  component: SemanticSurfaceInspectorPanel,
  category: 'dev',
  tags: ['ontology', 'tags', 'primitives', 'coverage', 'analysis', 'debug'],
  icon: 'grid',
  description: 'Visual coverage of primitive packs against ontology namespaces',
  updatedAt: '2026-05-01T00:00:00Z',
  changeNote: 'Initial coverage matrix view (v0).',
  featureHighlights: [
    'Heatmap of primitive packs / categories vs ontology namespaces.',
    'Color scale highlights low / zero coverage cells so gaps pop visually.',
    'Click a cell to see contributing block_ids + text previews.',
  ],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug', safeForNonDev: false },
});
