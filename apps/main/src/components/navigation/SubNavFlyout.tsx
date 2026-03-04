import type { SubNavItem } from '@pixsim7/shared.modules.core';
import { PortalFloat, useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { openFloatingWorkspacePanel, openWorkspacePanel } from '@features/workspace';

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

  const activeItemId = getActiveItemId(items, location.pathname, location.search);

  const handleItemClick = useCallback(
    (item: SubNavItem, event: React.MouseEvent<HTMLButtonElement>) => {
      const panelId = getPanelIdFromSubNavItem(item);
      if (panelId) {
        const preference = getPanelOpenPreference(panelId);
        const forceWorkspaceRoute = event.ctrlKey || event.metaKey;
        if (forceWorkspaceRoute) {
          navigate(item.route ?? `/workspace?openPanel=${encodeURIComponent(panelId)}`);
          return;
        }

        if (preference === 'route-preferred') {
          navigate(item.route ?? `/workspace?openPanel=${encodeURIComponent(panelId)}`);
        } else if (preference === 'float-preferred') {
          openFloatingWorkspacePanel(panelId);
        } else {
          // dock-preferred: workspace restore with built-in floating fallback
          openWorkspacePanel(panelId);
        }
        return;
      }

      if (item.route) {
        navigate(item.route);
      } else if (item.param) {
        navigate(`${route}?${item.param.key}=${item.param.value}`);
      } else {
        navigate(route);
      }
    },
    [navigate, route],
  );

  return (
    <div ref={triggerRef} {...handlers}>
      {children}

      {isExpanded && (
        <PortalFloat
          anchor={triggerRef.current}
          placement="right"
          align="start"
          offset={4}
          className="py-1.5 min-w-[160px] bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm"
          onMouseEnter={handlers.onMouseEnter}
          onMouseLeave={handlers.onMouseLeave}
        >
          {items.map((item) => {
            const isActive = item.id === activeItemId;
            const panelId = getPanelIdFromSubNavItem(item);
            const preference = panelId ? getPanelOpenPreference(panelId) : null;
            return (
              <button
                key={item.id}
                onClick={(event) => handleItemClick(item, event)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'text-accent bg-accent/15'
                    : 'text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700/50'
                }`}
              >
                {item.icon && <NavIcon name={item.icon} size={14} />}
                <span className="whitespace-nowrap">{item.label}</span>
                {panelId ? (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-neutral-500">
                    {preference === 'route-preferred'
                      ? 'route'
                      : preference === 'float-preferred'
                        ? 'float'
                        : 'dock'}
                  </span>
                ) : null}
              </button>
            );
          })}
        </PortalFloat>
      )}
    </div>
  );
}

function getPanelOpenPreference(panelId: string): 'dock-preferred' | 'float-preferred' | 'route-preferred' {
  const panel = panelSelectors.get(panelId);
  return panel?.navigation?.openPreference ?? 'dock-preferred';
}

function getPanelIdFromSubNavItem(item: SubNavItem): string | null {
  if (item.id.startsWith('panel:')) {
    const panelId = item.id.slice('panel:'.length).trim();
    return panelId.length > 0 ? panelId : null;
  }

  if (!item.route) return null;

  try {
    const url = new URL(item.route, 'http://localhost');
    if (url.pathname !== '/workspace') return null;
    const panelId = url.searchParams.get('openPanel');
    return panelId && panelId.trim().length > 0 ? panelId : null;
  } catch {
    return null;
  }
}

function getActiveItemId(items: SubNavItem[], pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  for (const item of items) {
    if (item.route && item.route === `${pathname}${search}`) {
      return item.id;
    }
    if (item.param && params.get(item.param.key) === item.param.value) {
      return item.id;
    }
  }
  // Fallback: match route-based items by pathname only (ignoring query params)
  for (const item of items) {
    if (item.route && item.route === pathname) {
      return item.id;
    }
  }
  return null;
}
