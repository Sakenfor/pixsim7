import { ControlCenterManager } from '@features/controlCenter';
import { createDockPanelPrefsSettingsSection } from '@features/docks';
import { DOCK_IDS, PANEL_IDS } from '@features/panels/lib/panelIds';
import { createPanelSchemaSettingsSection } from '@features/settings';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: PANEL_IDS.controlCenter,
  title: 'Control Center',
  component: ControlCenterManager,
  category: 'system',
  tags: ['control-center', 'generation', 'modules'],
  icon: 'sliders',
  description: 'Control Center dock and generation modules',
  internal: true,
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  settingsSections: [
    {
      id: 'ui-settings',
      title: 'UI Settings',
      description: 'Dock layout and interaction preferences.',
      component: createPanelSchemaSettingsSection('workspace', DOCK_IDS.controlCenter),
    },
    {
      id: 'panel-preferences',
      title: 'Panels',
      description: 'Enable or disable control-center dock panels.',
      component: createDockPanelPrefsSettingsSection({
        dockId: DOCK_IDS.controlCenter,
      }),
    },
  ],
  orchestration: {
    type: 'dockview-container',
    defaultZone: 'left',
    canChangeZone: false,
    retraction: {
      canRetract: true,
      retractedWidth: 48,
      animationDuration: 200,
    },
    dockview: {
      hasDockview: true,
      subPanelsCanBreakout: false,
      persistLayout: true,
      storageKey: 'quickGenerate-dockview-layout:v2',
    },
    priority: 40,
    interactionRules: {
      whenOpens: {
        [PANEL_IDS.assetViewer]: 'retract',
        gallery: 'nothing',
      },
      whenCloses: {
        [PANEL_IDS.assetViewer]: 'expand',
      },
    },
  },
});
