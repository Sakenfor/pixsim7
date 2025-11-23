/**
 * Badge Configuration Presets
 *
 * Predefined badge configurations for common use cases.
 * Part of Task 62 - Gallery Panel Config & Builder Widget
 */

import type { MediaCardBadgeConfig } from '../../components/media/MediaCard';

export interface BadgeConfigPreset {
  id: string;
  name: string;
  description: string;
  icon?: string;
  config: MediaCardBadgeConfig;
}

/**
 * Default badge configuration presets
 */
export const BADGE_CONFIG_PRESETS: BadgeConfigPreset[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Balanced view with all badges visible',
    icon: '⚖️',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: true,
      showTagsInOverlay: true,
      showFooterProvider: true,
      showFooterDate: true,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean view with minimal badges',
    icon: '✨',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: false,
      showStatusTextOnHover: false,
      showTagsInOverlay: false,
      showFooterProvider: false,
      showFooterDate: false,
    },
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Good for small cards and dense grids',
    icon: '📦',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: false,
      showTagsInOverlay: false,
      showFooterProvider: false,
      showFooterDate: true,
    },
  },
  {
    id: 'detailed',
    name: 'Detailed',
    description: 'Show all available information',
    icon: '📋',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: true,
      showTagsInOverlay: true,
      showFooterProvider: true,
      showFooterDate: true,
    },
  },
  {
    id: 'curator',
    name: 'Curator',
    description: 'Emphasis on tags and metadata',
    icon: '⭐',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: false,
      showStatusTextOnHover: false,
      showTagsInOverlay: true,
      showFooterProvider: true,
      showFooterDate: true,
    },
  },
  {
    id: 'review',
    name: 'Review',
    description: 'Emphasis on status and quality control',
    icon: '✓',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: true,
      showTagsInOverlay: false,
      showFooterProvider: true,
      showFooterDate: false,
    },
  },
  {
    id: 'presentation',
    name: 'Presentation',
    description: 'Clean view for client presentations',
    icon: '🎨',
    config: {
      showPrimaryIcon: false,
      showStatusIcon: false,
      showStatusTextOnHover: false,
      showTagsInOverlay: false,
      showFooterProvider: false,
      showFooterDate: false,
    },
  },
];

/**
 * Get a preset by ID
 */
export function getBadgeConfigPreset(id: string): BadgeConfigPreset | undefined {
  return BADGE_CONFIG_PRESETS.find(preset => preset.id === id);
}

/**
 * Get preset config by ID
 */
export function getPresetConfig(id: string): MediaCardBadgeConfig | undefined {
  return getBadgeConfigPreset(id)?.config;
}

/**
 * Find the preset that matches a given config (if any)
 */
export function findMatchingPreset(config: Partial<MediaCardBadgeConfig>): string | null {
  for (const preset of BADGE_CONFIG_PRESETS) {
    const matches = Object.keys(preset.config).every(key => {
      const k = key as keyof MediaCardBadgeConfig;
      return config[k] === preset.config[k];
    });
    if (matches) {
      return preset.id;
    }
  }
  return null;
}
