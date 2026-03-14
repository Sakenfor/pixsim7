import { createDockPanelPrefsSettingsSection } from '@features/docks';
import { DOCK_IDS, PANEL_IDS } from '@features/panels/lib/panelIds';
import { createPanelSchemaSettingsSection } from '@features/settings';

import { AssetViewerPanel } from '@/components/media/AssetViewerPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: PANEL_IDS.assetViewer,
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
      component: createPanelSchemaSettingsSection('workspace', DOCK_IDS.assetViewer),
    },
    {
      id: 'panel-preferences',
      title: 'Panels',
      description: 'Enable or disable asset-viewer dock panels.',
      component: createDockPanelPrefsSettingsSection({
        dockId: DOCK_IDS.assetViewer,
        requiredPanelIds: ['media-preview'],
      }),
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
      storageKey: 'dockview:asset-viewer:v5',
    },
    priority: 80,
  },
});
