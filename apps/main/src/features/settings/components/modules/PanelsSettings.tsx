/**
 * Panels Settings Module
 *
 * Wrapper for PanelConfigurationPanel to register it in the settings registry.
 */
import { PanelConfigurationPanel } from '../PanelConfigurationPanel';
import { settingsRegistry } from '../../lib/core/registry';

export function PanelsSettings() {
  return <PanelConfigurationPanel />;
}

// Register this module
settingsRegistry.register({
  id: 'panels',
  label: 'Panels',
  component: PanelsSettings,
  order: 20,
});
