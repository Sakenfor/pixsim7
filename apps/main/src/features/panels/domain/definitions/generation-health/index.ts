import { GenerationHealthView } from '@features/panels/components/dev/GenerationHealthView';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'generation-health',
  title: 'Generation Health',
  component: GenerationHealthView,
  category: 'dev',
  browsable: false,
  tags: ['generation', 'health', 'diagnostics', 'content'],
  icon: 'heart',
  description: 'Monitor content generation health and diagnostics',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for generation diagnostics tool.',
  featureHighlights: ['Generation health and diagnostics visibility for content pipelines.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'generation' },
});
