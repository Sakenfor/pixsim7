/**
 * Badge Overlay Widget Plugin
 *
 * Status badge with icon or label.
 * Registered via the overlay-widget plugin family.
 */

import { createBadgeWidget, type BadgeWidgetConfig } from '@lib/ui/overlay';
import { fromUnifiedPosition, fromUnifiedVisibility } from '@lib/ui/overlay';
import { extractBinding, type WidgetDefinition } from '@lib/widgets';

// ============================================================================
// Settings Interface
// ============================================================================

export interface BadgeWidgetSettings {
  variant: 'icon' | 'text' | 'pill';
  icon?: string;
  color: 'gray' | 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  shape: 'rounded' | 'circle' | 'square';
  pulse?: boolean;
  tooltip?: string;
}

// ============================================================================
// Widget Definition
// ============================================================================

export const widget: WidgetDefinition<BadgeWidgetSettings> = {
  id: 'badge',
  title: 'Badge',
  description: 'Status badge with icon or label',
  icon: 'tag',
  category: 'overlay',
  domain: 'overlay',
  tags: ['badge', 'status', 'icon', 'overlay'],
  surfaces: ['overlay', 'hud'],
  surfaceConfig: {
    overlay: {
      defaultAnchor: 'top-left',
      defaultOffset: { x: 8, y: 8 },
    },
  },
  factory: (config, runtimeOptions) => {
    const badgeConfig: BadgeWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      variant: (config.props?.variant as any) || 'icon',
      icon: config.props?.icon as string | undefined,
      labelBinding: extractBinding(config.bindings, 'label'),
      color: (config.props?.color as any) || 'gray',
      shape: (config.props?.shape as any) || 'rounded',
      pulse: config.props?.pulse as boolean | undefined,
      tooltip: config.props?.tooltip as string | undefined,
      onClick: runtimeOptions?.onClick,
      className: config.style?.className,
      priority: config.position.order,
    };
    return createBadgeWidget(badgeConfig);
  },
  defaultSettings: {
    variant: 'icon',
    color: 'gray',
    shape: 'rounded',
  },
  settingsSchema: {
    groups: [
      {
        id: 'appearance',
        title: 'Appearance',
        description: 'Customize badge appearance.',
        fields: [
          { key: 'variant', type: 'select', label: 'Variant', description: 'Display style of badges.', options: [{ value: 'icon', label: 'Icon' }, { value: 'text', label: 'Text' }, { value: 'pill', label: 'Pill' }] },
          { key: 'color', type: 'select', label: 'Color', description: 'Default badge color.', options: [{ value: 'gray', label: 'Gray' }, { value: 'blue', label: 'Blue' }, { value: 'green', label: 'Green' }, { value: 'red', label: 'Red' }, { value: 'yellow', label: 'Yellow' }, { value: 'purple', label: 'Purple' }] },
          { key: 'shape', type: 'select', label: 'Shape', description: 'Badge corner style.', options: [{ value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }] },
          { key: 'pulse', type: 'toggle', label: 'Pulse Animation', description: 'Enable a pulsing animation effect on badges.' },
        ],
      },
    ],
  },
  defaultConfig: {
    type: 'badge',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'top-left', offset: { x: 8, y: 8 } },
    visibility: { simple: 'always' },
    version: 1,
  },
};
