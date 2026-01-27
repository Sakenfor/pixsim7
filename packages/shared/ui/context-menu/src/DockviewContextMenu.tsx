/**
 * Dockview Context Menu Component (shared, app-agnostic)
 *
 * Renders context menu at cursor position based on menu action registry.
 * Accepts optional renderIcon prop for app-specific icon rendering.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown, DropdownDivider, DropdownItem } from '@pixsim7/shared.ui';
import { useContextMenu } from './useContextMenu';
import type { MenuItem } from './types';

export type RenderIconFn = (name: string, size: number, className?: string) => ReactNode;

const defaultRenderIcon: RenderIconFn = (name, _size, className) => (
  <span className={className}>{name}</span>
);

export interface ContextMenuPortalProps {
  renderIcon?: RenderIconFn;
}

/**
 * Context Menu Portal
 *
 * Renders the context menu as a portal when active.
 * Auto-positioned at cursor with viewport boundary detection.
 */
export function ContextMenuPortal({ renderIcon = defaultRenderIcon }: ContextMenuPortalProps = {}) {
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

  useEffect(() => {
    if (!state.isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-context-menu]')) return;
      hideContextMenu();
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [state.isOpen, hideContextMenu]);

  if (!state.isOpen || !state.context) return null;

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
            renderIcon={renderIcon}
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
  renderIcon: RenderIconFn;
}

function MenuItemComponent({ item, onClose, depth = 0, renderIcon }: MenuItemComponentProps) {
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

  useEffect(() => {
    if (!showChildren || !itemRef.current) return;

    const updatePosition = () => {
      if (!itemRef.current) return;

      const itemRect = itemRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const submenuRect = submenuRef.current?.getBoundingClientRect();
      const submenuWidth = submenuRect?.width || 220;
      const submenuHeight = submenuRect?.height || 200;

      let x = itemRect.right + 4;
      let y = itemRect.top;

      if (x + submenuWidth > viewportWidth - 10) {
        x = itemRect.left - submenuWidth - 4;
        if (x < 10) {
          x = 10;
        }
      }

      if (y + submenuHeight > viewportHeight - 10) {
        const overflow = (y + submenuHeight) - (viewportHeight - 10);
        y = Math.max(10, y - overflow);
      }

      if (y < 10) {
        y = 10;
      }

      setSubmenuPos({ x, y });
    };

    updatePosition();

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
          icon={item.icon ? renderIcon(item.icon, 14, item.iconColor || 'text-current') : undefined}
          rightSlot={(
            <>
              {item.shortcut && <span>{item.shortcut}</span>}
              {hasChildren && renderIcon('chevronRight', 12)}
            </>
          )}
        >
          <span style={{ paddingLeft: `${12 + depth * 16}px` }}>{item.label}</span>
        </DropdownItem>
      </div>

      {item.divider && (
        <DropdownDivider />
      )}

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
                renderIcon={renderIcon}
              />
            ))}
          </Dropdown>
        </div>
      )}
    </>
  );
}
