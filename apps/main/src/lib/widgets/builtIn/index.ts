/**
 * Built-in Widgets
 *
 * Core widgets that ship with the widget system.
 */

export { clockWidget } from './ClockWidget';
export { deviceStatusWidget } from './DeviceStatusWidget';

import { registerWidget } from '../widgetRegistry';
import { clockWidget } from './ClockWidget';
import { deviceStatusWidget } from './DeviceStatusWidget';

/**
 * All built-in widget definitions
 */
export const builtInWidgets = [
  clockWidget,
  deviceStatusWidget,
];

/**
 * Register all built-in widgets
 */
export function registerBuiltInWidgets(): void {
  for (const widget of builtInWidgets) {
    registerWidget(widget);
  }
}
