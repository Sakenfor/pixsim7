import { createPanelSchemaSettingsSection } from '@features/settings';

import { AssetViewerPanel } from '@/components/media/AssetViewerPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'assetViewer',
  title: 'Asset Viewer',
  component: AssetViewerPanel,
  category: 'workspace',
  tags: ['assets', 'viewer', 'media'],
  icon: 'image',
  description: 'Asset viewer with docked sub-panels',
  internal: true,
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  settingsSections: [
    {
      id: 'ui-settings',
      title: 'UI Settings',
      description: 'Viewer defaults and playback behavior.',
      component: createPanelSchemaSettingsSection('workspace', 'asset-viewer'),
    },
  ],
  orchestration: {
    type: 'dockview-container',
    defaultZone: 'center',
    canChangeZone: true,
    dockview: {
      hasDockview: true,
      subPanelsCanBreakout: true,
      persistLayout: true,
      storageKey: 'asset-viewer-dockview-layout:v3',
    },
    priority: 80,
  },
});
