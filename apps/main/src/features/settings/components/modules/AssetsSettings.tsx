import { settingsRegistry } from '../../lib/core/registry';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { registerAssetSettings } from '../../lib/schemas/assets.settings';

// Auto-register schema-based settings when module loads
registerAssetSettings();

export function AssetsSettings() {
  return <DynamicSettingsPanel categoryId="assets" />;
}

// Register this module
settingsRegistry.register({
  id: 'assets',
  label: 'Assets',
  icon: '📦',
  component: AssetsSettings,
  order: 35,
});
