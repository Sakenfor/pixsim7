/**
 * Define Widget Helper
 *
 * Type-safe helper for defining widgets with proper typing and validation.
 */

import type { WidgetDefinition } from './types';

/**
 * Define a widget with type safety.
 *
 * @example
 * ```typescript
 * const clockWidget = defineWidget({
 *   id: 'clock',
 *   title: 'Clock',
 *   category: 'info',
 *   surfaces: ['header', 'statusbar'],
 *   surfaceConfig: {
 *     header: { area: 'right', size: 'small' },
 *   },
 *   component: ClockWidget,
 * });
 * ```
 */
export function defineWidget<TSettings = Record<string, unknown>>(
  definition: WidgetDefinition<TSettings>
): WidgetDefinition<TSettings> {
  // Apply defaults
  const withDefaults: WidgetDefinition<TSettings> = {
    domain: 'core',
    ...definition,
  };

  return withDefaults;
}
