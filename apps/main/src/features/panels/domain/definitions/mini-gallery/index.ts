import { MiniGallery } from '@features/gallery/components/MiniGallery';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'mini-gallery',
  title: 'Mini Gallery',
  component: MiniGallery,
  category: 'tools',
  tags: ['gallery', 'assets', 'browse'],
  icon: 'image',
  description: 'Compact gallery panel for browsing and filtering assets',
  supportsCompactMode: true,
  supportsMultipleInstances: true,
  internal: false,
});
