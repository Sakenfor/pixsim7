/**
 * Button Overlay Widget Plugin
 *
 * Action button widget.
 * Registered via the overlay-widget plugin family.
 */

import { createButtonWidget, type ButtonWidgetConfig } from '@lib/ui/overlay';
import { fromUnifiedPosition, fromUnifiedVisibility } from '@lib/ui/overlay';
import { extractBinding, type WidgetDefinition } from '@lib/widgets';

// ============================================================================
// Settings Interface
// ============================================================================

export interface ButtonWidgetSettings {
  icon?: string;
  variant: 'primary' | 'secondary' | 'ghost' | 'icon';
  size: 'xs' | 'sm' | 'md';
  disabled?: boolean;
}

// ============================================================================
// Widget Definition
// ============================================================================

export const widget: WidgetDefinition<ButtonWidgetSettings> = {
  id: 'button',
  title: 'Button',
  description: 'Action button',
  icon: 'square',
  category: 'actions',
  domain: 'overlay',
  tags: ['button', 'action', 'overlay'],
  surfaces: ['overlay', 'hud'],
  surfaceConfig: {
    overlay: {
      defaultAnchor: 'bottom-right',
      defaultOffset: { x: -8, y: -8 },
    },
  },
  factory: (config, runtimeOptions) => {
    const buttonConfig: ButtonWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      labelBinding: extractBinding(config.bindings, 'label'),
      icon: config.props?.icon as string | undefined,
      variant: (config.props?.variant as any) || 'secondary',
      size: (config.props?.size as any) || 'sm',
      disabled: config.props?.disabled as boolean | undefined,
      onClick: runtimeOptions?.onClick,
      className: config.style?.className,
      priority: config.position.order,
    };
    return createButtonWidget(buttonConfig);
  },
  defaultSettings: {
    variant: 'secondary',
    size: 'sm',
  },
  settingsSchema: {
    groups: [
      {
        id: 'appearance',
        title: 'Appearance',
        description: 'Customize button appearance.',
        fields: [
          { key: 'variant', type: 'select', label: 'Button Style', description: 'Visual style of buttons.', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }, { value: 'ghost', label: 'Ghost' }, { value: 'icon', label: 'Icon Only' }] },
          { key: 'size', type: 'select', label: 'Button Size', description: 'Default size of buttons.', options: [{ value: 'xs', label: 'Extra Small' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }] },
        ],
      },
    ],
  },
  defaultConfig: {
    type: 'button',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'bottom-right', offset: { x: -8, y: -8 } },
    visibility: { simple: 'hover' },
    version: 1,
  },
};
