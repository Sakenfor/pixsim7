/**
 * Media Card Overlay Presets
 *
 * Pre-configured overlay presets for media cards, replacing and enhancing
 * the legacy badge configuration system.
 */

import type { OverlayPreset, OverlayConfiguration, OverlayWidget } from '../types';
import { createBadgeWidget } from '../widgets/BadgeWidget';
import { createButtonWidget } from '../widgets/ButtonWidget';
import { createPanelWidget } from '../widgets/PanelWidget';

// Helper to tag preset-defined widgets for linting/debugging
function asMediaCardPresetWidget(widget: OverlayWidget): OverlayWidget {
  return { ...widget, group: 'media-card-preset' };
}

/**
 * Default / Full Featured
 *
 * Shows all badges and information - ideal for detailed browsing.
 * Runtime widgets provide: primary icon, status menu, duration, provider badge,
 * video scrubber, upload button, and tags tooltip.
 */
export const defaultPreset: OverlayPreset = {
  id: 'media-card-default',
  name: 'Default',
  icon: '⚖️',
  category: 'media',
  // Default preset uses all runtime widgets with no special capabilities
  capabilities: {},
  configuration: {
    id: 'media-card-default',
    name: 'Default Media Card',
    description: 'Full featured media card with all badges and information',
    spacing: 'normal',
    // All widgets provided by runtime - see createDefaultMediaCardWidgets()
    widgets: [],
  },
};

/**
 * Minimal
 *
 * Shows only essential badges - clean and minimal.
 * Uses compact spacing and relies on runtime widgets.
 */
export const minimalPreset: OverlayPreset = {
  id: 'media-card-minimal',
  name: 'Minimal',
  icon: '✨',
  category: 'media',
  // Minimal preset skips hover widgets for cleaner look
  capabilities: {
    skipUploadButton: true,
    skipTagsTooltip: true,
  },
  configuration: {
    id: 'media-card-minimal',
    name: 'Minimal Media Card',
    description: 'Clean interface with only essential information',
    spacing: 'compact',
    // Runtime widgets provide primary icon, status, duration
    widgets: [],
  },
};

/**
 * Compact
 *
 * Balanced view with key information.
 * Uses compact spacing for denser gallery layouts.
 */
export const compactPreset: OverlayPreset = {
  id: 'media-card-compact',
  name: 'Compact',
  icon: '📦',
  category: 'media',
  // Compact uses all runtime widgets
  capabilities: {},
  configuration: {
    id: 'media-card-compact',
    name: 'Compact Media Card',
    description: 'Balanced view with essential badges',
    spacing: 'compact',
    // Runtime widgets provide all badges
    widgets: [],
  },
};

/**
 * Detailed / Information Heavy
 *
 * Maximum information display with metadata panel on hover.
 */
export const detailedPreset: OverlayPreset = {
  id: 'media-card-detailed',
  name: 'Detailed',
  icon: '📋',
  category: 'media',
  // Detailed uses all runtime widgets plus its own metadata panel
  capabilities: {},
  configuration: {
    id: 'media-card-detailed',
    name: 'Detailed Media Card',
    description: 'Maximum information with all available data',
    spacing: 'normal',
    widgets: [
      // Runtime provides primary icon, status, duration, etc.
      // This preset adds a metadata panel for extra information.

      // Use bottom-center to avoid overlapping MediaCard's runtime
      // upload/tag widgets at bottom-left.
      asMediaCardPresetWidget(
        createPanelWidget({
          id: 'metadata-panel',
          position: { anchor: 'bottom-center', offset: { x: 0, y: -8 } },
          visibility: { trigger: 'hover-container' },
          title: 'Metadata',
          variant: 'glass',
          content: (data) => {
            // Format duration as MM:SS
            const formatDuration = (sec?: number) => {
              if (!sec) return null;
              const mins = Math.floor(sec / 60);
              const secs = Math.floor(sec % 60);
              return `${mins}:${secs.toString().padStart(2, '0')}`;
            };
            const duration = formatDuration(data.durationSec);

            return (
              <div className="space-y-1 text-xs">
                <div>Provider: {data.providerId}</div>
                <div>Type: {data.mediaType}</div>
                {duration && <div>Duration: {duration}</div>}
                {data.createdAt && (
                  <div>Created: {new Date(data.createdAt).toLocaleDateString()}</div>
                )}
              </div>
            );
          },
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
  // Generation preset shows generation menu, skips upload/tags for focused workflow
  capabilities: {
    showsGenerationMenu: true,
    skipUploadButton: true,
    skipTagsTooltip: true,
  },
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
  // Review preset provides its own status widget and buttons, skips upload/tags
  capabilities: {
    providesStatusWidget: true,
    skipUploadButton: true,
    skipTagsTooltip: true,
    touchFriendlyButtons: true,
  },
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
          // Use touchFallback: 'always' so buttons are visible on tablets
          visibility: { trigger: 'hover-container', touchFallback: 'always' },
          icon: 'check',
          label: 'Approve',
          tooltip: 'Mark asset as approved',
          variant: 'primary',
          size: 'sm',
          onClick: (data) => data.actions?.onApprove?.(data.id),
          priority: 10,
        }),
      ),

      asMediaCardPresetWidget(
        createButtonWidget({
          id: 'reject',
          // Slightly above the bottom-right reserved duration slot
          position: { anchor: 'bottom-right', offset: { x: -8, y: -32 } },
          // Use touchFallback: 'always' so buttons are visible on tablets
          visibility: { trigger: 'hover-container', touchFallback: 'always' },
          icon: 'x',
          label: 'Reject',
          tooltip: 'Mark asset as rejected',
          variant: 'danger',
          size: 'sm',
          onClick: (data) => data.actions?.onReject?.(data.id),
          priority: 10,
        }),
      ),
    ],
  },
};

/**
 * Focus Mode
 *
 * Clean presentation mode - all overlays hidden until hover.
 * Ideal for showcasing content without visual clutter.
 */
export const focusPreset: OverlayPreset = {
  id: 'media-card-focus',
  name: 'Focus',
  icon: '🎯',
  category: 'media',
  // Focus mode: hide everything, show only on hover
  capabilities: {
    forceHoverOnly: true,
    skipUploadButton: true,
    skipTagsTooltip: true,
  },
  configuration: {
    id: 'media-card-focus',
    name: 'Focus Mode',
    description: 'Clean presentation with overlays only on hover',
    spacing: 'normal',
    widgets: [],
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
  focusPreset,
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
