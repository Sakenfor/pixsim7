import { definePanel } from '../../../lib/definePanel';
import { ControlCenterManager } from '@features/controlCenter';
import { createPanelSchemaSettingsSection } from '@features/settings/components/shared/panelSchemaSettings';

export default definePanel({
  id: 'controlCenter',
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
      component: createPanelSchemaSettingsSection('panels', 'control-center'),
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
        assetViewer: 'retract',
        gallery: 'nothing',
      },
      whenCloses: {
        assetViewer: 'expand',
      },
    },
  },
});
