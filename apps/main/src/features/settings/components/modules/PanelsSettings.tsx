/**
 * Panels Settings Module
 *
 * Wrapper for PanelCentricSettings to register it in the settings registry.
 */
import { PanelCentricSettings } from '../PanelCentricSettings';
import { settingsRegistry } from '../../lib/core/registry';

export function PanelsSettings() {
  return <PanelCentricSettings />;
}

// Register this module
settingsRegistry.register({
  id: 'panels',
  label: 'Panels',
  component: PanelsSettings,
  order: 20,
});
