import type { SubNavItem } from '@pixsim7/shared.modules.core';
import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { NavIcon } from './ActivityBar';

interface SubNavFlyoutProps {
  /** The nav items to display in the flyout */
  items: SubNavItem[];
  /** Base route for the page (e.g. '/assets') */
  route: string;
  /** Render the trigger button */
  children: React.ReactElement;
}

export function SubNavFlyout({ items, route, children }: SubNavFlyoutProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: 300,
    collapseDelay: 200,
  });

  const activeItemId = getActiveItemId(items, location.search);

  const handleItemClick = useCallback(
    (item: SubNavItem) => {
      if (item.param) {
        navigate(`${route}?${item.param.key}=${item.param.value}`);
      } else {
        navigate(route);
      }
    },
    [navigate, route],
  );

  const rect = triggerRef.current?.getBoundingClientRect();

  return (
    <div ref={triggerRef} {...handlers}>
      {children}

      {isExpanded &&
        rect &&
        createPortal(
          <div
            className="fixed z-popover py-1.5 min-w-[160px] bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm"
            style={{ top: rect.top, left: rect.right + 4 }}
            onMouseEnter={handlers.onMouseEnter}
            onMouseLeave={handlers.onMouseLeave}
          >
            {items.map((item) => {
              const isActive = item.id === activeItemId;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'text-accent bg-accent/15'
                      : 'text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700/50'
                  }`}
                >
                  {item.icon && <NavIcon name={item.icon} size={14} />}
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

function getActiveItemId(items: SubNavItem[], search: string): string | null {
  const params = new URLSearchParams(search);
  for (const item of items) {
    if (item.param && params.get(item.param.key) === item.param.value) {
      return item.id;
    }
  }
  return null;
}
