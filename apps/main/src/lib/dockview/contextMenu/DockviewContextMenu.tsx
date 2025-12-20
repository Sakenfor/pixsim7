/**
 * Dockview Context Menu Component
 *
 * Renders context menu at cursor position based on menu action registry.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@lib/icons';
import { Dropdown, DropdownDivider, DropdownItem } from '@pixsim7/shared.ui';
import { useContextMenu } from './ContextMenuProvider';
import type { MenuItem } from './types';

/**
 * Context Menu Portal
 *
 * Renders the context menu as a portal when active.
 * Auto-positioned at cursor with viewport boundary detection.
 */
export function ContextMenuPortal() {
  const { state, hideContextMenu, registry } = useContextMenu();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!state.isOpen || !state.context) return;

    const { x, y } = state.context.position;
    setPosition({ x, y });

    const raf = requestAnimationFrame(() => {
      if (!menuRef.current) return;

      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let finalX = x;
      let finalY = y;

      if (x + rect.width > viewportWidth) {
        finalX = viewportWidth - rect.width - 10;
      }

      if (y + rect.height > viewportHeight) {
        finalY = viewportHeight - rect.height - 10;
      }

      setPosition({ x: Math.max(10, finalX), y: Math.max(10, finalY) });
    });

    return () => cancelAnimationFrame(raf);
  }, [state.isOpen, state.context]);

  // Close on escape key
  useEffect(() => {
    if (!state.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.isOpen, hideContextMenu]);

  // Close on click outside
  useEffect(() => {
    if (!state.isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-context-menu]')) return;
      hideContextMenu();
    };

    // Delay to avoid immediate close from the context menu trigger
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [state.isOpen, hideContextMenu]);

  if (!state.isOpen || !state.context) return null;

  // Convert registry actions to menu items
  const items = registry.toMenuItems(state.context.contextType, state.context);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      data-context-menu
    >
      <Dropdown
        isOpen
        onClose={hideContextMenu}
        positionMode="static"
        closeOnOutsideClick={false}
        minWidth="200px"
        className="min-w-[200px] max-w-[300px]"
      >
        {items.map(item => (
          <MenuItemComponent
            key={item.id}
            item={item}
            onClose={hideContextMenu}
          />
        ))}
        {items.length === 0 && (
          <div className="px-3 py-2 text-sm text-neutral-500 text-center">
            No actions available
          </div>
        )}
      </Dropdown>
    </div>,
    document.body
  );
}

interface MenuItemComponentProps {
  item: MenuItem;
  onClose: () => void;
  depth?: number;
}

/**
 * Recursive menu item component
 * Supports nested menus and various item types
 */
function MenuItemComponent({ item, onClose, depth = 0 }: MenuItemComponentProps) {
  const [showChildren, setShowChildren] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const hasChildren = item.children && item.children.length > 0;
  const isDisabled = !!item.disabled;

  const handleClick = () => {
    if (isDisabled) return;

    if (hasChildren) {
      setShowChildren(true);
    } else {
      item.onClick?.();
      onClose();
    }
  };

  // Variant styles
  const variantClasses = {
    default: 'hover:bg-neutral-100 dark:hover:bg-neutral-700',
    danger: 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400',
    success: 'hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400',
  };

  const variant = item.variant || 'default';

  useEffect(() => {
    if (!showChildren || !itemRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = rect.right + 6;
    let y = rect.top;

    // Prevent overflow to the right
    const estimatedWidth = 220;
    if (x + estimatedWidth > viewportWidth) {
      x = rect.left - estimatedWidth - 6;
    }

    // Prevent overflow to the bottom
    const estimatedHeight = 240;
    if (y + estimatedHeight > viewportHeight) {
      y = Math.max(10, viewportHeight - estimatedHeight - 10);
    }

    setSubmenuPos({ x, y });
  }, [showChildren]);

  const cancelHide = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      setShowChildren(false);
    }, 150);
  };

  return (
    <>
      <div
        ref={itemRef}
        onMouseEnter={() => {
          if (!hasChildren) return;
          cancelHide();
          setShowChildren(true);
        }}
        onMouseLeave={() => {
          if (!hasChildren) return;
          scheduleHide();
        }}
        title={typeof item.disabled === 'string' ? item.disabled : undefined}
      >
        <DropdownItem
          onClick={handleClick}
          disabled={isDisabled}
          variant={variant === 'success' ? 'success' : variant === 'danger' ? 'danger' : variant === 'default' ? 'default' : 'primary'}
          className="text-sm"
          icon={item.icon ? (
            <Icon
              name={item.icon as any}
              size={14}
              className={item.iconColor || 'text-current'}
            />
          ) : undefined}
          rightSlot={(
            <>
              {item.shortcut && <span>{item.shortcut}</span>}
              {hasChildren && <Icon name="chevronRight" size={12} />}
            </>
          )}
        >
          <span style={{ paddingLeft: `${12 + depth * 16}px` }}>{item.label}</span>
        </DropdownItem>
      </div>

      {item.divider && (
        <DropdownDivider />
      )}

      {/* Nested children */}
      {hasChildren && showChildren && submenuPos && (
        <div
          className="fixed z-[10000]"
          style={{ left: submenuPos.x, top: submenuPos.y }}
          data-context-menu
          onMouseEnter={() => {
            cancelHide();
            setShowChildren(true);
          }}
          onMouseLeave={() => scheduleHide()}
        >
          <Dropdown
            isOpen
            onClose={() => setShowChildren(false)}
            positionMode="static"
            closeOnOutsideClick={false}
            minWidth="200px"
            className="min-w-[200px] max-w-[300px]"
          >
            {item.children!.map(child => (
              <MenuItemComponent
                key={child.id}
                item={child}
                onClose={onClose}
                depth={0}
              />
            ))}
          </Dropdown>
        </div>
      )}
    </>
  );
}
