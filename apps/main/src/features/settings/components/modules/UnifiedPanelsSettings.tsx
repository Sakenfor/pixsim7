/**
 * Workspace Settings Module
 *
 * Combines Panels, Widgets, and Layout Presets under one "Workspace" category.
 *
 * Panels: Master-detail layout for panel-specific settings.
 * Widgets: Auto-generated settings for widgets with settingsSchema.
 * Layout Presets: Save/load/export dockview layout presets.
 */

import { settingsRegistry } from '../../lib/core/registry';
import { PanelCentricSettings } from '../PanelCentricSettings';

import { PanelGroupsSettings } from './PanelGroupsSettings';
import { WidgetPresetsSettings } from './WidgetPresetsSettings';
import { WidgetsSettings } from './WidgetsSettings';

export function PanelsSettings() {
  return (
    <div className="h-full">
      <PanelCentricSettings />
    </div>
  );
}

// Register workspace module with Panels, Widgets, and Layout Presets as sub-sections
settingsRegistry.register({
  id: 'workspace',
  label: 'Workspace',
  icon: '🖥️',
  component: PanelsSettings,
  order: 16,
  subSections: [
    {
      id: 'panels',
      label: 'Panels',
      icon: '📋',
      component: PanelsSettings,
    },
    {
      id: 'widgets',
      label: 'Widgets',
      icon: '🧩',
      component: WidgetsSettings,
    },
    {
      id: 'panel-groups',
      label: 'Panel Groups',
      icon: '📦',
      component: PanelGroupsSettings,
    },
    {
      id: 'layout-presets',
      label: 'Layout Presets',
      icon: '🎭',
      component: WidgetPresetsSettings,
    },
  ],
});
