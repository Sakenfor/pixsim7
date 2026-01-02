import { definePanel } from '../../../lib/definePanel';
import { AssetsRoute } from '@/routes/Assets';
import { galleryPanelSettingsSections } from '@features/gallery/components/GalleryPanelSettings';

export default definePanel({
  id: 'gallery',
  title: 'Gallery',
  component: AssetsRoute,
  category: 'workspace',
  tags: ['assets', 'media', 'images'],
  icon: 'image',
  description: 'Browse and manage project assets',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: false,
    priority: 60,
    interactionRules: {
      whenOpens: {
        assetViewer: 'minimize',
      },
      whenCloses: {
        assetViewer: 'restore',
      },
    },
  },
  settingsSections: galleryPanelSettingsSections,
});
