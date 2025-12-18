/**
 * Unified Panels Settings Module
 *
 * Master-detail layout:
 * - Left: List of all panels
 * - Right: All settings for selected panel (UI, interactions, panel-specific, enable/disable)
 */

import { useState } from 'react';
import { settingsRegistry } from '../../lib/core/registry';
import { PanelCentricSettings } from '../PanelCentricSettings';

export function UnifiedPanelsSettings() {
  return (
    <div className="h-full">
      <PanelCentricSettings />
    </div>
  );
}

// Register unified panels module
settingsRegistry.register({
  id: 'panels',
  label: 'Panels',
  icon: '🎨',
  component: UnifiedPanelsSettings,
  order: 16,
});
