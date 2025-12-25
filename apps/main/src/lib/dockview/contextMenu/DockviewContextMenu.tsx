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
  const submenuRef = useRef<HTMLDivElement>(null);
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

  const variant = item.variant || 'default';

  // Calculate submenu position when shown
  useEffect(() => {
    if (!showChildren || !itemRef.current) return;

    const updatePosition = () => {
      if (!itemRef.current) return;

      const itemRect = itemRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Get actual submenu dimensions if available, otherwise use estimates
      const submenuRect = submenuRef.current?.getBoundingClientRect();
      const submenuWidth = submenuRect?.width || 220;
      const submenuHeight = submenuRect?.height || 200;

      // Default position: to the right of the item, aligned with item top
      let x = itemRect.right + 4;
      let y = itemRect.top;

      // Check if submenu would overflow right edge
      if (x + submenuWidth > viewportWidth - 10) {
        // Position to the left of the parent menu item
        x = itemRect.left - submenuWidth - 4;
        // If still overflows left, just position at left edge
        if (x < 10) {
          x = 10;
        }
      }

      // Check if submenu would overflow bottom edge
      if (y + submenuHeight > viewportHeight - 10) {
        // Shift up just enough to fit, but try to keep aligned with item
        const overflow = (y + submenuHeight) - (viewportHeight - 10);
        y = Math.max(10, y - overflow);

        // Alternative: align bottom of submenu with bottom of viewport
        // y = Math.max(10, viewportHeight - submenuHeight - 10);
      }

      // Ensure y doesn't go above viewport
      if (y < 10) {
        y = 10;
      }

      setSubmenuPos({ x, y });
    };

    // Initial position with estimates
    updatePosition();

    // Reposition after render when we have actual dimensions
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
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
          ref={submenuRef}
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
