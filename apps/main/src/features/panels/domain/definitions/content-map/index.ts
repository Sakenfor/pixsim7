import { ContentMapPanel } from '@features/panels/components/dev/ContentMapPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'content-map',
  title: 'Content Map',
  component: ContentMapPanel,
  category: 'dev',
  browsable: true,
  tags: ['content', 'packs', 'primitives', 'vocabularies', 'map', 'inventory', 'plugins'],
  icon: 'map',
  description: 'Map of all content sources: packs, primitives, vocabularies, plugins',
  updatedAt: '2026-03-15T00:00:00Z',
  changeNote: 'Birds-eye view of all content sources with live summaries.',
  featureHighlights: ['Browse packs, primitives, vocabularies, plugins in one place.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'prompts', safeForNonDev: true },
});
