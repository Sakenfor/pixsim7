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

import type { MediaCardBadgeConfig } from '@/components/media/MediaCard';

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
    showStatusIcon: true,
    showTagsInOverlay: true,
    showFooterProvider: false,
    showGenerationBadge: true,
  };

  // Merge in order of priority: defaults < surface < panel < widget
  return {
    ...defaults,
    ...surfaceConfig,
    ...panelConfig,
    ...widgetConfig,
  };
}

/**
 * Best-effort migration helper: derive an overlay preset ID
 * from a legacy badgeConfig shape.
 *
 * This is used to map existing saved gallery settings (which only
 * knew about badgeConfig) onto the new MediaCard overlay presets
 * without losing the user's intent.
 */
export function deriveOverlayPresetIdFromBadgeConfig(
  config?: Partial<MediaCardBadgeConfig>
): string {
  if (!config) {
    return 'media-card-default';
  }

  const showStatusIcon = config.showStatusIcon ?? true;
  const showTagsInOverlay = config.showTagsInOverlay ?? true;
  const showFooterProvider = config.showFooterProvider ?? false;
  const showGenerationBadge = config.showGenerationBadge ?? true;

  // Legacy "Minimal" preset:
  // - no status, no tags, no footer, no generation controls
  if (
    showStatusIcon === false &&
    showTagsInOverlay === false &&
    showFooterProvider === false &&
    showGenerationBadge === false
  ) {
    return 'media-card-minimal';
  }

  // Legacy compact approximation:
  // - status visible
  // - tags hidden
  // - provider footer hidden
  // - generation controls visible
  if (
    showStatusIcon === true &&
    showTagsInOverlay === false &&
    showFooterProvider === false &&
    showGenerationBadge === true
  ) {
    return 'media-card-compact';
  }

  // Fallback: treat everything else as the default overlay.
  return 'media-card-default';
}
