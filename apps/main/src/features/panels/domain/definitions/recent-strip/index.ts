import { RecentStripPanel } from '@/components/media/viewer/panels/RecentStripPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'recent-strip',
  title: 'Recent',
  component: RecentStripPanel,
  category: 'workspace',
  panelRole: 'sub-panel',
  browsable: false,
  tags: ['media', 'recent', 'viewer', 'filmstrip'],
  icon: 'layers',
  description: 'Horizontal filmstrip of recent assets in the active viewer scope',
  availableIn: ['asset-viewer'],
  supportsCompactMode: true,
  supportsMultipleInstances: false,
});
