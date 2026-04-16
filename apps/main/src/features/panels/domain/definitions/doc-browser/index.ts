import { DocBrowserPanel } from '@features/panels/components/dev/DocBrowserPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'doc-browser',
  title: 'Docs',
  component: DocBrowserPanel,
  category: 'dev',
  browsable: false,
  tags: ['docs', 'documentation', 'plans', 'architecture', 'search'],
  icon: 'fileText',
  description: 'Browse and search project documentation',
  updatedAt: '2026-03-13T00:00:00Z',
  changeNote: 'Standalone documentation browser extracted from App Map.',
  featureHighlights: ['Browse, search, and read project documentation with linked navigation.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'graph' },
});
