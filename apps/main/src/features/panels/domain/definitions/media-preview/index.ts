import { MediaPanel } from '@/components/media/viewer/panels/MediaPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'media-preview',
  title: 'Media Preview',
  component: MediaPanel,
  category: 'workspace',
  panelRole: 'sub-panel',
  browsable: false,
  tags: ['media', 'preview', 'viewer'],
  icon: 'film',
  description: 'Lightweight media preview panel for selected assets',
  availableIn: ['asset-viewer'],
  supportsCompactMode: false,
  supportsMultipleInstances: true,
  consumesCapabilities: ['preview:scope'],
});
