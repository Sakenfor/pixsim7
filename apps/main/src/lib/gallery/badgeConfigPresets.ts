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
    description: 'Balanced view with essential badges and info',
    icon: '⚖️',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: true,
      showTagsInOverlay: true,
      showFooterProvider: false,
      showFooterDate: true,
      showGenerationBadge: true,
      showGenerationInMenu: true,
      showGenerationOnHoverOnly: true,
      generationQuickAction: 'auto',
      enableBadgePulse: false,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Only primary badge, actions on click',
    icon: '✨',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: false,
      showStatusTextOnHover: false,
      showTagsInOverlay: false,
      showFooterProvider: false,
      showFooterDate: false,
      showGenerationBadge: false,
      showGenerationInMenu: true,
      showGenerationOnHoverOnly: true,
      generationQuickAction: 'none',
      enableBadgePulse: false,
    },
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Essential badges only, perfect for dense grids',
    icon: '📦',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: false,
      showTagsInOverlay: false,
      showFooterProvider: false,
      showFooterDate: true,
      showGenerationBadge: false,
      showGenerationInMenu: true,
      showGenerationOnHoverOnly: true,
      generationQuickAction: 'none',
      enableBadgePulse: false,
    },
  },
  {
    id: 'detailed',
    name: 'Detailed',
    description: 'All badges and info visible, including technical tags',
    icon: '📋',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: true,
      showTagsInOverlay: true,
      showFooterProvider: true,
      showFooterDate: true,
      showGenerationBadge: true,
      showGenerationInMenu: true,
      showGenerationOnHoverOnly: false,
      generationQuickAction: 'auto',
      enableBadgePulse: false,
    },
  },
  {
    id: 'generation',
    name: 'Generation',
    description: 'Optimized for generation workflows with quick actions',
    icon: '⚡',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: false,
      showTagsInOverlay: false,
      showFooterProvider: false,
      showFooterDate: false,
      showGenerationBadge: true,
      showGenerationInMenu: true,
      showGenerationOnHoverOnly: false,
      generationQuickAction: 'auto',
      enableBadgePulse: false,
    },
  },
  {
    id: 'curator',
    name: 'Curator',
    description: 'Focus on tags, metadata, and organization',
    icon: '⭐',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: false,
      showStatusTextOnHover: false,
      showTagsInOverlay: true,
      showFooterProvider: true,
      showFooterDate: true,
      showGenerationBadge: false,
      showGenerationInMenu: false,
      showGenerationOnHoverOnly: true,
      generationQuickAction: 'none',
      enableBadgePulse: false,
    },
  },
  {
    id: 'review',
    name: 'Review',
    description: 'Status-focused for quality control and review',
    icon: '✓',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: true,
      showTagsInOverlay: false,
      showFooterProvider: true,
      showFooterDate: true,
      showGenerationBadge: false,
      showGenerationInMenu: true,
      showGenerationOnHoverOnly: true,
      generationQuickAction: 'none',
      enableBadgePulse: false,
    },
  },
  {
    id: 'technical',
    name: 'Technical',
    description: 'All technical info for debugging and inspection',
    icon: '🔧',
    config: {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: true,
      showTagsInOverlay: true,
      showFooterProvider: true,
      showFooterDate: true,
      showGenerationBadge: false,
      showGenerationInMenu: true,
      showGenerationOnHoverOnly: true,
      generationQuickAction: 'none',
      enableBadgePulse: false,
    },
  },
  {
    id: 'presentation',
    name: 'Presentation',
    description: 'Ultra-clean, no badges or overlays for demos',
    icon: '🎨',
    config: {
      showPrimaryIcon: false,
      showStatusIcon: false,
      showStatusTextOnHover: false,
      showTagsInOverlay: false,
      showFooterProvider: false,
      showFooterDate: false,
      showGenerationBadge: false,
      showGenerationInMenu: false,
      showGenerationOnHoverOnly: true,
      generationQuickAction: 'none',
      enableBadgePulse: false,
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
