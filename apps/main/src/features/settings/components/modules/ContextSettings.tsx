import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { registerContextSettings } from '../../lib/schemas/context.settings';
import { settingsRegistry } from '../../lib/core/registry';

registerContextSettings();

settingsRegistry.register({
  id: 'context',
  label: 'Context',
  icon: '🔗',
  order: 60,
  component: function ContextSettings() {
    return (
      <div className="flex-1 overflow-auto p-4">
        <DynamicSettingsPanel categoryId="context" />
      </div>
    );
  },
});
