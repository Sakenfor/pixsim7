/**
 * Workspace Settings Module
 *
 * Combines Panels and Widgets settings under one "Workspace" category.
 *
 * Panels: Master-detail layout for panel-specific settings.
 * Widgets: Auto-generated settings for widgets with settingsSchema.
 */

import { settingsRegistry } from '../../lib/core/registry';
import { PanelCentricSettings } from '../PanelCentricSettings';

import { WidgetsSettings } from './WidgetsSettings';

export function UnifiedPanelsSettings() {
  return (
    <div className="h-full">
      <PanelCentricSettings />
    </div>
  );
}

// Register workspace module with Panels as default and Widgets as sub-section
settingsRegistry.register({
  id: 'workspace',
  label: 'Workspace',
  icon: '🖥️',
  component: UnifiedPanelsSettings,
  order: 16,
  subSections: [
    {
      id: 'widgets',
      label: 'Widgets',
      icon: '🧩',
      component: WidgetsSettings,
    },
  ],
});
