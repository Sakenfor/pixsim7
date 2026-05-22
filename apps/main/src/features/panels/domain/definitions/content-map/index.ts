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
  description: 'Discovery and health map of content sources with panel drilldowns.',
  updatedAt: '2026-03-15T00:00:00Z',
  changeNote: 'Use as a cross-source inventory/health overview; drill into dedicated panels for operations.',
  featureHighlights: ['Browse packs, primitives, vocabularies, plugins, and templates in one place.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'prompts', safeForNonDev: true },
});
