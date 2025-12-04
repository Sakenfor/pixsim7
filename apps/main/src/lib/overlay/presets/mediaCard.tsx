/**
 * Media Card Overlay Presets
 *
 * Pre-configured overlay presets for media cards, replacing and enhancing
 * the legacy badge configuration system.
 */

import type { OverlayPreset, OverlayConfiguration, OverlayWidget } from '../types';
import { createBadgeWidget, BadgePresets } from '../widgets/BadgeWidget';
import { createButtonWidget } from '../widgets/ButtonWidget';
import { createPanelWidget } from '../widgets/PanelWidget';

// Helper to tag preset-defined widgets for linting/debugging
function asMediaCardPresetWidget(widget: OverlayWidget): OverlayWidget {
  return { ...widget, group: 'media-card-preset' };
}

/**
 * Default / Full Featured
 *
 * Shows all badges and information - ideal for detailed browsing
 */
export const defaultPreset: OverlayPreset = {
  id: 'media-card-default',
  name: 'Default',
  icon: '⚖️',
  category: 'media',
  configuration: {
    id: 'media-card-default',
    name: 'Default Media Card',
    description: 'Full featured media card with all badges and information',
    spacing: 'normal',
    widgets: [
      // Primary media type icon - top-left
      asMediaCardPresetWidget(
        createBadgeWidget({
          id: 'primary-icon',
          position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
          visibility: { trigger: 'always' },
          variant: 'icon',
          icon: 'video', // Will be dynamic based on media type
          color: 'primary',
          shape: 'circle',
          tooltip: 'Media type',
          priority: 10,
        }),
      ),

      // Note: tag display for the default preset is handled by
      // runtime widgets (e.g., technical tags tooltip) to keep the
      // always-visible card surface lean. No dedicated tags panel here.
    ],
  },
};

/**
 * Minimal
 *
 * Shows only essential badges - clean and minimal
 */
export const minimalPreset: OverlayPreset = {
  id: 'media-card-minimal',
  name: 'Minimal',
  icon: '✨',
  category: 'media',
  configuration: {
    id: 'media-card-minimal',
    name: 'Minimal Media Card',
    description: 'Clean interface with only essential information',
    spacing: 'compact',
    widgets: [
      asMediaCardPresetWidget(
        createBadgeWidget({
          id: 'primary-icon',
          position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
          visibility: { trigger: 'always' },
          variant: 'icon',
          icon: 'image',
          color: 'neutral',
          shape: 'circle',
          priority: 10,
          className: 'opacity-60',
        }),
      ),
    ],
  },
};

/**
 * Compact
 *
 * Balanced view with key information
 */
export const compactPreset: OverlayPreset = {
  id: 'media-card-compact',
  name: 'Compact',
  icon: '📦',
  category: 'media',
  configuration: {
    id: 'media-card-compact',
    name: 'Compact Media Card',
    description: 'Balanced view with essential badges',
    spacing: 'compact',
    widgets: [
      asMediaCardPresetWidget(
        createBadgeWidget({
          id: 'primary-icon',
          position: { anchor: 'top-left', offset: { x: 6, y: 6 } },
          visibility: { trigger: 'always' },
          variant: 'icon',
          icon: 'video',
          color: 'primary',
          shape: 'circle',
          priority: 10,
        }),
      ),
    ],
  },
};

/**
 * Detailed / Information Heavy
 *
 * Maximum information display
 */
export const detailedPreset: OverlayPreset = {
  id: 'media-card-detailed',
  name: 'Detailed',
  icon: '📋',
  category: 'media',
  configuration: {
    id: 'media-card-detailed',
    name: 'Detailed Media Card',
    description: 'Maximum information with all available data',
    spacing: 'normal',
    widgets: [
      asMediaCardPresetWidget(
        createBadgeWidget({
          id: 'primary-icon',
          position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
          visibility: { trigger: 'always' },
          variant: 'icon-text',
          icon: 'video',
          label: (data) => data.mediaType,
          color: 'primary',
          shape: 'rounded',
          priority: 10,
        }),
      ),

      // Note: Status badge is handled by MediaCard runtime widgets
      // to avoid overlap with status-menu

      // Use bottom-center to avoid overlapping MediaCard's runtime
      // upload/tag widgets at bottom-left.
      asMediaCardPresetWidget(
        createPanelWidget({
          id: 'metadata-panel',
          position: { anchor: 'bottom-center', offset: { x: 0, y: -8 } },
          visibility: { trigger: 'always' },
          title: 'Metadata',
          variant: 'glass',
          content: (data) => (
            <div className="space-y-1 text-xs">
              <div>Provider: {data.provider}</div>
              <div>Type: {data.mediaType}</div>
              <div>Size: {data.size}</div>
              {data.duration && <div>Duration: {data.duration}</div>}
            </div>
          ),
          priority: 5,
        }),
      ),
    ],
  },
};

/**
 * Generation Focused
 *
 * Optimized for generation workflows
 */
export const generationPreset: OverlayPreset = {
  id: 'media-card-generation',
  name: 'Generation',
  icon: '⚡',
  category: 'media',
  configuration: {
    id: 'media-card-generation',
    name: 'Generation Focused',
    description: 'Optimized for AI generation workflows',
    spacing: 'normal',
    // Rely entirely on MediaCard runtime widgets (primary icon, generation menu, etc.)
    widgets: [],
  },
};

/**
 * Review Mode
 *
 * Focused on content review and curation
 */
export const reviewPreset: OverlayPreset = {
  id: 'media-card-review',
  name: 'Review',
  icon: '✓',
  category: 'media',
  configuration: {
    id: 'media-card-review',
    name: 'Review Mode',
    description: 'Optimized for content review and approval',
    spacing: 'normal',
    collisionDetection: true,
    widgets: [
      asMediaCardPresetWidget(
        createBadgeWidget({
          id: 'review-status',
          position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
          visibility: { trigger: 'always' },
          variant: 'icon-text',
          icon: 'eye',
          label: 'Review',
          color: 'warning',
          shape: 'rounded',
          priority: 15,
        }),
      ),

      asMediaCardPresetWidget(
        createButtonWidget({
          id: 'approve',
          // Slightly above the bottom-left reserved upload/tag slot
          position: { anchor: 'bottom-left', offset: { x: 8, y: -32 } },
          visibility: { trigger: 'hover-container' },
          icon: 'check',
          label: 'Approve',
          tooltip: 'Mark asset as approved (review UI)',
          variant: 'primary',
          size: 'sm',
          onClick: (data) => console.log('Approve', data),
          priority: 10,
        }),
      ),

      asMediaCardPresetWidget(
        createButtonWidget({
          id: 'reject',
          // Slightly above the bottom-right reserved duration slot
          position: { anchor: 'bottom-right', offset: { x: -8, y: -32 } },
          visibility: { trigger: 'hover-container' },
          icon: 'x',
          label: 'Reject',
          tooltip: 'Mark asset as rejected (review UI)',
          variant: 'danger',
          size: 'sm',
          onClick: (data) => console.log('Reject', data),
          priority: 10,
        }),
      ),
    ],
  },
};

/**
 * All media card presets
 */
export const mediaCardPresets: OverlayPreset[] = [
  defaultPreset,
  minimalPreset,
  compactPreset,
  detailedPreset,
  generationPreset,
  reviewPreset,
];

/**
 * Get preset by ID
 */
export function getMediaCardPreset(id: string): OverlayPreset | undefined {
  return mediaCardPresets.find((p) => p.id === id);
}

/**
 * Get default media card configuration
 */
export function getDefaultMediaCardConfig(): OverlayConfiguration {
  return defaultPreset.configuration;
}
