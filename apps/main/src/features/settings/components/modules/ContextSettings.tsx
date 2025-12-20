import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { registerContextSettings } from '../../lib/schemas/context.settings';
import { settingsRegistry } from '../../lib/core/registry';

registerContextSettings();

settingsRegistry.register({
  id: 'context',
  label: 'Context',
  icon: 'dY"?',
  order: 60,
  component: function ContextSettings() {
    return <DynamicSettingsPanel categoryId="context" />;
  },
});
