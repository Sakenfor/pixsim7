/**
 * Menu Widget
 *
 * Generic dropdown/context menu widget for actions and navigation
 * Supports nested menus, dividers, icons, and keyboard navigation
 */

import React, { useState, useRef, useEffect } from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Icon } from '@/lib/icons';

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
}

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
  } = config;

  return {
    id,
    type: 'menu',
    position,
    visibility,
    priority,
    interactive: true,
    handlesOwnInteraction: true, // Menu manages its own click/keyboard interaction internally
    render: (data: any) => {
      const [isOpen, setIsOpen] = useState(false);
      const [openSubMenus, setOpenSubMenus] = useState<Set<string>>(new Set());
      const menuRef = useRef<HTMLDivElement>(null);
      const triggerRef = useRef<HTMLButtonElement>(null);

      const menuItems = typeof items === 'function' ? items(data) : items;

      // Close menu when clicking outside
      useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
          if (
            menuRef.current &&
            !menuRef.current.contains(event.target as Node) &&
            triggerRef.current &&
            !triggerRef.current.contains(event.target as Node)
          ) {
            setIsOpen(false);
            setOpenSubMenus(new Set());
          }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, [isOpen]);

      // Handle keyboard navigation
      useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
            setOpenSubMenus(new Set());
          }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
      }, [isOpen]);

      const handleTriggerClick = () => {
        if (triggerType === 'click') {
          setIsOpen(!isOpen);
        }
      };

      const handleTriggerHover = () => {
        if (triggerType === 'hover') {
          setIsOpen(true);
        }
      };

      const handleTriggerLeave = () => {
        if (triggerType === 'hover') {
          // Delay closing to allow moving to menu
          setTimeout(() => setIsOpen(false), 200);
        }
      };

      const handleItemClick = (item: MenuItem) => {
        if (item.disabled) return;

        if (item.children && item.children.length > 0) {
          // Toggle submenu
          const newOpenSubMenus = new Set(openSubMenus);
          if (newOpenSubMenus.has(item.id)) {
            newOpenSubMenus.delete(item.id);
          } else {
            newOpenSubMenus.add(item.id);
          }
          setOpenSubMenus(newOpenSubMenus);
        } else {
          // Execute action
          if (item.onClick) {
            item.onClick(data);
          }

          if (closeOnClick) {
            setIsOpen(false);
            setOpenSubMenus(new Set());
          }
        }
      };

      const renderMenuItem = (item: MenuItem, depth: number = 0) => {
        const hasChildren = item.children && item.children.length > 0;
        const isSubMenuOpen = openSubMenus.has(item.id);
        const variantClasses = {
          default: 'hover:bg-neutral-100 dark:hover:bg-neutral-700',
          danger: 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
          success: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20',
        };

        return (
          <div key={item.id}>
            <button
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
              className={`
                w-full px-3 py-2 flex items-center gap-2 text-sm text-left
                ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${variantClasses[item.variant || 'default']}
                transition-colors
              `}
              style={{ paddingLeft: `${0.75 + depth * 0.5}rem` }}
            >
              {/* Icon */}
              {item.icon && (
                <Icon
                  name={item.icon}
                  size={14}
                  className={item.iconColor || 'text-neutral-500 dark:text-neutral-400'}
                />
              )}

              {/* Label */}
              <span className="flex-1">{item.label}</span>

              {/* Shortcut hint */}
              {item.shortcut && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  {item.shortcut}
                </span>
              )}

              {/* Submenu indicator */}
              {hasChildren && (
                <Icon
                  name="chevronRight"
                  size={12}
                  className="text-neutral-400 dark:text-neutral-500"
                />
              )}
            </button>

            {/* Submenu */}
            {hasChildren && isSubMenuOpen && (
              <div className="border-l-2 border-neutral-200 dark:border-neutral-700 ml-2">
                {item.children!.map((child) => renderMenuItem(child, depth + 1))}
              </div>
            )}

            {/* Divider */}
            {item.divider && (
              <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
            )}
          </div>
        );
      };

      const renderTrigger = () => {
        if (trigger.variant === 'icon') {
          return (
            <button
              ref={triggerRef}
              onClick={handleTriggerClick}
              onMouseEnter={handleTriggerHover}
              onMouseLeave={handleTriggerLeave}
              className={`
                p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700
                transition-colors ${trigger.className || ''}
              `}
              aria-label="Open menu"
            >
              {trigger.icon && (
                <Icon name={trigger.icon} size={16} className="text-neutral-700 dark:text-neutral-300" />
              )}
            </button>
          );
        }

        if (trigger.variant === 'button') {
          return (
            <button
              ref={triggerRef}
              onClick={handleTriggerClick}
              onMouseEnter={handleTriggerHover}
              onMouseLeave={handleTriggerLeave}
              className={`
                px-3 py-1.5 rounded text-sm font-medium
                bg-neutral-100 dark:bg-neutral-700
                hover:bg-neutral-200 dark:hover:bg-neutral-600
                transition-colors ${trigger.className || ''}
              `}
            >
              {trigger.icon && <Icon name={trigger.icon} size={14} className="mr-1.5" />}
              {trigger.label || 'Menu'}
            </button>
          );
        }

        // Badge variant
        return (
          <button
            ref={triggerRef}
            onClick={handleTriggerClick}
            onMouseEnter={handleTriggerHover}
            onMouseLeave={handleTriggerLeave}
            className={`
              px-2 py-1 rounded-full text-xs font-medium
              bg-blue-100 dark:bg-blue-900/30
              text-blue-700 dark:text-blue-300
              hover:bg-blue-200 dark:hover:bg-blue-900/50
              transition-colors ${trigger.className || ''}
            `}
          >
            {trigger.icon && <Icon name={trigger.icon} size={12} className="mr-1" />}
            {trigger.label || 'Menu'}
          </button>
        );
      };

      const placementClasses = {
        'bottom-left': 'top-full left-0 mt-1',
        'bottom-right': 'top-full right-0 mt-1',
        'top-left': 'bottom-full left-0 mb-1',
        'top-right': 'bottom-full right-0 mb-1',
      };

      return (
        <div className={`relative ${className}`}>
          {renderTrigger()}

          {/* Menu dropdown */}
          {isOpen && menuItems.length > 0 && (
            <div
              ref={menuRef}
              className={`
                absolute ${placementClasses[placement]}
                min-w-[180px] max-w-[280px]
                bg-white dark:bg-neutral-800
                border border-neutral-200 dark:border-neutral-700
                rounded-lg shadow-lg
                py-1 z-50
                overflow-hidden
              `}
              onMouseEnter={() => {
                if (triggerType === 'hover') {
                  setIsOpen(true);
                }
              }}
            >
              {menuItems.map((item) => renderMenuItem(item))}
            </div>
          )}
        </div>
      );
    },
  };
}
