import { definePanel } from '../../../lib/definePanel';
import { MediaPanel } from '@/components/media/viewer/panels/MediaPanel';

export default definePanel({
  id: 'media-preview',
  title: 'Media Preview',
  component: MediaPanel,
  category: 'workspace',
  tags: ['media', 'preview', 'viewer'],
  icon: 'image',
  description: 'Lightweight media preview panel for selected assets',
  availableIn: ['asset-viewer'],
  supportsCompactMode: false,
  supportsMultipleInstances: true,
  settingScopes: ['preview'],
});
