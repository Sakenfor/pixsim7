/**
 * Media Card Overlay Presets
 *
 * Pre-configured overlay presets for media cards, replacing and enhancing
 * the legacy badge configuration system.
 */

import type { OverlayPreset, OverlayConfiguration } from '../types';
import { createBadgeWidget, BadgePresets } from '../widgets/BadgeWidget';
import { createButtonWidget } from '../widgets/ButtonWidget';
import { createPanelWidget } from '../widgets/PanelWidget';

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

      // Status badge - top-right
      createBadgeWidget({
        id: 'status-badge',
        position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
        visibility: { trigger: 'hover-container', delay: 100 },
        variant: 'icon',
        icon: 'check',
        color: 'success',
        shape: 'circle',
        tooltip: 'Status',
        priority: 20,
      }),

      // Provider info panel - bottom-left
      createPanelWidget({
        id: 'provider-info',
        position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
        visibility: { trigger: 'hover-container', transition: 'fade' },
        variant: 'glass',
        content: (data) => (
          <>
            <div className="text-xs opacity-80">{data.provider}</div>
            <div className="text-xs opacity-60">{data.mediaType}</div>
          </>
        ),
        priority: 5,
      }),

      // Generate button - bottom-right
      createButtonWidget({
        id: 'generate-button',
        position: { anchor: 'bottom-right', offset: { x: -8, y: -8 } },
        visibility: { trigger: 'hover-container', transition: 'fade', delay: 150 },
        icon: 'zap',
        label: 'Generate',
        variant: 'primary',
        size: 'sm',
        onClick: (data) => console.log('Generate', data),
        priority: 15,
      }),

      // Tags overlay - bottom center
      createPanelWidget({
        id: 'tags-overlay',
        position: { anchor: 'bottom-center', offset: { x: 0, y: -40 } },
        visibility: { trigger: 'hover-container', transition: 'slide' },
        variant: 'dark',
        content: (data) => (
          <div className="flex flex-wrap gap-1">
            {data.tags?.slice(0, 3).map((tag: string) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 bg-white/20 rounded text-[10px]"
              >
                {tag}
              </span>
            ))}
            {data.tags?.length > 3 && (
              <span className="px-1.5 py-0.5 text-[10px] opacity-60">
                +{data.tags.length - 3}
              </span>
            )}
          </div>
        ),
        priority: 8,
      }),
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

      createBadgeWidget({
        id: 'status-badge',
        position: { anchor: 'top-right', offset: { x: -6, y: 6 } },
        visibility: { trigger: 'always' },
        variant: 'icon',
        icon: 'check',
        color: 'success',
        shape: 'circle',
        className: 'w-6 h-6',
        priority: 10,
      }),
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

      createBadgeWidget({
        id: 'status-badge',
        position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
        visibility: { trigger: 'always' },
        variant: 'icon-text',
        icon: 'check',
        label: 'OK',
        color: 'success',
        shape: 'rounded',
        priority: 10,
      }),

      createPanelWidget({
        id: 'metadata-panel',
        position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
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

      createButtonWidget({
        id: 'generate-button',
        position: { anchor: 'bottom-right', offset: { x: -8, y: -8 } },
        visibility: { trigger: 'always' },
        icon: 'zap',
        label: 'Generate',
        variant: 'primary',
        size: 'md',
        onClick: (data) => console.log('Generate', data),
        priority: 10,
      }),
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
    widgets: [
      createBadgeWidget({
        id: 'media-type',
        position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
        visibility: { trigger: 'always' },
        variant: 'icon',
        icon: 'video',
        color: 'primary',
        shape: 'circle',
        priority: 10,
      }),

      createButtonWidget({
        id: 'quick-generate',
        position: { anchor: 'center' },
        visibility: { trigger: 'hover-container', transition: 'scale' },
        icon: 'zap',
        label: 'Quick Generate',
        variant: 'primary',
        size: 'lg',
        onClick: (data) => console.log('Quick generate', data),
        priority: 20,
      }),

      createButtonWidget({
        id: 'extend-video',
        position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
        visibility: { trigger: 'hover-container', transition: 'fade' },
        icon: 'arrowRight',
        label: 'Extend',
        variant: 'secondary',
        size: 'sm',
        onClick: (data) => console.log('Extend', data),
        priority: 10,
      }),

      createButtonWidget({
        id: 'add-transition',
        position: { anchor: 'bottom-right', offset: { x: -8, y: -8 } },
        visibility: { trigger: 'hover-container', transition: 'fade' },
        icon: 'link',
        label: 'Transition',
        variant: 'secondary',
        size: 'sm',
        onClick: (data) => console.log('Add transition', data),
        priority: 10,
      }),
    ],
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
    widgets: [
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

      createButtonWidget({
        id: 'approve',
        position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
        visibility: { trigger: 'hover-container' },
        icon: 'check',
        label: 'Approve',
        variant: 'primary',
        size: 'sm',
        onClick: (data) => console.log('Approve', data),
        priority: 10,
      }),

      createButtonWidget({
        id: 'reject',
        position: { anchor: 'bottom-right', offset: { x: -8, y: -8 } },
        visibility: { trigger: 'hover-container' },
        icon: 'x',
        label: 'Reject',
        variant: 'danger',
        size: 'sm',
        onClick: (data) => console.log('Reject', data),
        priority: 10,
      }),
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
