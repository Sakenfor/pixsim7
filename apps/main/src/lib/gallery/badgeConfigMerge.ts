/**
 * Badge Configuration Merge Logic
 *
 * Merges badge configuration from multiple sources with proper priority:
 * 1. Widget-level config (highest priority)
 * 2. Panel-level config
 * 3. Surface-level config (lowest priority)
 *
 * Part of Task 62 Phase 62.4
 */

import type { MediaCardBadgeConfig } from '../../components/media/MediaCard';

/**
 * Merge badge configurations with priority:
 * widget > panel > surface
 *
 * @param surfaceConfig - Badge config from gallery surface definition
 * @param panelConfig - Badge config from panel settings
 * @param widgetConfig - Badge config from widget props
 * @returns Merged badge configuration
 */
export function mergeBadgeConfig(
  surfaceConfig?: Partial<MediaCardBadgeConfig>,
  panelConfig?: Partial<MediaCardBadgeConfig>,
  widgetConfig?: Partial<MediaCardBadgeConfig>
): MediaCardBadgeConfig {
  // Default values if nothing is specified
  const defaults: MediaCardBadgeConfig = {
    showPrimaryIcon: true,
    showStatusIcon: true,
    showStatusTextOnHover: true,
    showTagsInOverlay: true,
    showFooterProvider: true,
    showFooterDate: true,
  };

  // Merge in order of priority: defaults < surface < panel < widget
  return {
    ...defaults,
    ...surfaceConfig,
    ...panelConfig,
    ...widgetConfig,
  };
}
