/**
 * MenuWidgetRenderer — the interactive component for the menu overlay widget.
 *
 * Split out from MenuWidget.tsx so that file exports only the factory + types
 * (react-refresh requires a module to export either components or non-components,
 * not a mix). Module-level so it doesn't remount on parent re-render.
 */

import { Popover } from '@pixsim7/shared.ui';
import { useState, useRef } from 'react';

import { Icon } from '@lib/icons';

import type { MenuItem, MenuWidgetConfig } from './MenuWidget';

export interface MenuWidgetRendererProps {
  payload: any;
  items: MenuItem[] | ((data: any) => MenuItem[]);
  trigger: NonNullable<MenuWidgetConfig['trigger']>;
  triggerType: NonNullable<MenuWidgetConfig['triggerType']>;
  placement: NonNullable<MenuWidgetConfig['placement']>;
  closeOnClick: boolean;
  className: string;
}

export function MenuWidgetRenderer({
  payload,
  items,
  trigger,
  triggerType,
  placement,
  closeOnClick,
  className,
}: MenuWidgetRendererProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openSubMenus, setOpenSubMenus] = useState<Set<string>>(new Set());
  const triggerRef = useRef<HTMLButtonElement>(null);

  const menuItems = typeof items === 'function' ? items(payload) : items;

  const closeMenu = () => {
    setIsOpen(false);
    setOpenSubMenus(new Set());
  };

  // Map the widget's corner placement onto Popover's side + cross-axis align.
  const popoverPlacement = placement.startsWith('top') ? 'top' : 'bottom';
  const popoverAlign = placement.endsWith('right') ? 'end' : 'start';

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
        item.onClick(payload);
      }

      if (closeOnClick) {
        setIsOpen(false);
        setOpenSubMenus(new Set());
      }
    }
  };

  const renderMenuItem = (item: MenuItem, depth: number = 0) => {
    // Custom content — renders directly instead of the standard button row
    if (item.content) {
      return (
        <div key={item.id}>
          <div className="px-3 py-2">{item.content}</div>
          {item.divider && (
            <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
          )}
        </div>
      );
    }

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

  return (
    <div className={`relative ${className}`}>
      {renderTrigger()}

      {/* Canonical Popover: portal, click-outside, Escape, viewport clamp. */}
      <Popover
        open={isOpen && menuItems.length > 0}
        anchor={triggerRef.current}
        placement={popoverPlacement}
        align={popoverAlign}
        offset={4}
        onClose={closeMenu}
        triggerRef={triggerRef}
        onMouseEnter={() => {
          if (triggerType === 'hover') {
            setIsOpen(true);
          }
        }}
      >
        <div className="min-w-[180px] max-w-[280px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 overflow-hidden">
          {menuItems.map((item) => renderMenuItem(item))}
        </div>
      </Popover>
    </div>
  );
}
