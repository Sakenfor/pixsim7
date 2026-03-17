/**
 * Notification Settings Module
 *
 * Per-category notification preferences with granularity control.
 * Uses the schema-driven DynamicSettingsPanel for rendering.
 */
import { settingsRegistry } from '../../lib/core/registry';
import { registerNotificationSettings } from '../../lib/schemas/notification.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

registerNotificationSettings();

export function NotificationSettings() {
  return <DynamicSettingsPanel categoryId="notifications" />;
}

// Register this module
settingsRegistry.register({
  id: 'notifications',
  label: 'Notifications',
  icon: 'bell',
  component: NotificationSettings,
  order: 55,
});
