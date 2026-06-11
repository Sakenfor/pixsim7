/**
 * Menu Widget
 *
 * Generic dropdown/context menu widget for actions and navigation
 * Supports nested menus, dividers, icons, and keyboard navigation.
 *
 * The interactive component lives in MenuWidgetRenderer.tsx; this file holds
 * the public types + the factory that registers the widget.
 */

import type { ReactNode } from 'react';

import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';

import { MenuWidgetRenderer } from './MenuWidgetRenderer';

export interface MenuItem {
  /** Unique item ID */
  id: string;

  /** Item label */
  label: string;

  /** Icon name */
  icon?: string;

  /** Icon color class */
  iconColor?: string;

  /** Click handler */
  onClick?: (data: any) => void;

  /** Disabled state */
  disabled?: boolean;

  /** Item variant/style */
  variant?: 'default' | 'danger' | 'success';

  /** Sub-menu items */
  children?: MenuItem[];

  /** Show divider after this item */
  divider?: boolean;

  /** Keyboard shortcut hint */
  shortcut?: string;

  /** Custom React content — renders instead of the standard label/icon row */
  content?: ReactNode;
}

export interface MenuWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /** Menu items */
  items: MenuItem[] | ((data: any) => MenuItem[]);

  /** Trigger element (button/badge that opens menu) */
  trigger?: {
    icon?: string;
    label?: string;
    variant?: 'icon' | 'button' | 'badge';
    className?: string;
  };

  /** Menu trigger type */
  triggerType?: 'click' | 'hover' | 'contextmenu';

  /** Menu position relative to trigger */
  placement?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

  /** Close menu on item click */
  closeOnClick?: boolean;

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;

  /** Stack group for auto-stacking with other widgets */
  stackGroup?: string;
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a menu widget from configuration
 */
export function createMenuWidget(config: MenuWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    items,
    trigger = { icon: 'moreVertical', variant: 'icon' },
    triggerType = 'click',
    placement = 'bottom-right',
    closeOnClick = true,
    className = '',
    priority,
    stackGroup,
  } = config;

  return {
    id,
    type: 'menu',
    position,
    visibility,
    priority,
    stackGroup,
    interactive: true,
    handlesOwnInteraction: true, // Menu manages its own click/keyboard interaction internally
    render: (data: any) => (
      <MenuWidgetRenderer
        payload={data}
        items={items}
        trigger={trigger}
        triggerType={triggerType}
        placement={placement}
        closeOnClick={closeOnClick}
        className={className}
      />
    ),
  };
}
