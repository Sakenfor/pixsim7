import type { SubNavItem } from '@pixsim7/shared.modules.core';
import { PortalFloat, useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { openFloatingWorkspacePanel, openWorkspacePanel } from '@features/workspace';
import { getFloatingDefinitionId } from '@features/workspace/lib/floatingPanelUtils';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from './ActivityBar';

/** Lightweight action item for the page-actions section at the bottom of the flyout. */
export interface NavFlyoutAction {
  id: string;
  label: string;
  icon: string;
  danger?: boolean;
  onClick: () => void;
}

interface SubNavFlyoutProps {
  /** The nav items to display in the flyout */
  items: SubNavItem[];
  /** Base route for the page (e.g. '/assets') */
  route: string;
  /** Optional page-level actions (pin/hide etc.) rendered in a section below items */
  pageActions?: NavFlyoutAction[];
  /** Render the trigger button */
  children: React.ReactElement;
}

type MouseHandlers = {
  onMouseEnter: React.MouseEventHandler;
  onMouseLeave: React.MouseEventHandler;
};

export function SubNavFlyout({ items, route, pageActions, children }: SubNavFlyoutProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: 250,
    collapseDelay: 450,
  });

  const activeItemId = getActiveItemId(items, location.pathname, location.search);

  const visible = isExpanded && (items.length > 0 || (pageActions && pageActions.length > 0));

  return (
    <div ref={triggerRef} {...handlers}>
      {children}
      {visible && (
        <PortalFloat
          anchor={triggerRef.current}
          placement="right"
          align="start"
          offset={4}
          className="py-1.5 min-w-[180px] bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm"
          onMouseEnter={handlers.onMouseEnter}
          onMouseLeave={handlers.onMouseLeave}
        >
          <SubNavItemsList
            items={items}
            route={route}
            activeItemId={activeItemId}
            parentHandlers={handlers}
          />
          {pageActions && pageActions.length > 0 && (
            <>
              {items.length > 0 && <div className="my-1 border-t border-neutral-700/40" />}
              {pageActions.map((action) => (
                <button
                  key={action.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick();
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
                    action.danger
                      ? 'text-red-300 hover:text-red-200 hover:bg-red-900/30'
                      : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700/50'
                  }`}
                >
                  <NavIcon name={action.icon} size={12} />
                  <span className="whitespace-nowrap">{action.label}</span>
                </button>
              ))}
            </>
          )}
        </PortalFloat>
      )}
    </div>
  );
}

/**
 * Renders a list of SubNavItem rows. Items with `children` open a nested flyout
 * on hover (hover-cascading). Handlers are threaded through so ancestor flyouts
 * stay open while the cursor is inside any descendant.
 */
function SubNavItemsList({
  items,
  route,
  activeItemId,
  parentHandlers,
}: {
  items: SubNavItem[];
  route: string;
  activeItemId: string | null;
  parentHandlers: MouseHandlers;
}) {
  return (
    <>
      {items.map((item) => (
        <SubNavRow
          key={item.id}
          item={item}
          route={route}
          isActive={item.id === activeItemId}
          parentHandlers={parentHandlers}
        />
      ))}
    </>
  );
}

/**
 * Subscribe only to booleans so rows rerender only when their state flips.
 * When item is not a panel, both are `false` (no subscription payload churn).
 */
function usePanelLiveState(panelId: string | null): { isOpen: boolean; isRecent: boolean } {
  const isOpen = useWorkspaceStore((s) =>
    panelId ? s.floatingPanels.some((p) => getFloatingDefinitionId(p.id) === panelId) : false,
  );
  const isRecent = useWorkspaceStore((s) => (panelId ? panelId in s.lastFloatingPanelStates : false));
  return { isOpen, isRecent };
}

function SubNavRow({
  item,
  route,
  isActive,
  parentHandlers,
}: {
  item: SubNavItem;
  route: string;
  isActive: boolean;
  parentHandlers: MouseHandlers;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const panelId = useMemo(() => getPanelIdFromSubNavItem(item), [item]);
  const { isOpen, isRecent } = usePanelLiveState(panelId);
  const kind = getItemKind(item, panelId);

  const resolvedChildren = useMemo(() => {
    if (!item.children) return null;
    try {
      return typeof item.children === 'function' ? item.children() : item.children;
    } catch (err) {
      console.warn('[SubNavRow] children thunk threw:', err);
      return null;
    }
  }, [item.children]);

  const hasChildren = resolvedChildren != null && resolvedChildren.length > 0;

  const { isExpanded: childOpen, handlers: childHandlers } = useHoverExpand({
    expandDelay: 250,
    collapseDelay: 450,
  });

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      handleSubNavItemClick(item, route, event, navigate);
    },
    [item, route, navigate],
  );

  // Nested flyout hover extends the parent flyout's hover area too.
  const bridgedHandlers: MouseHandlers = {
    onMouseEnter: (e) => {
      parentHandlers.onMouseEnter(e);
      childHandlers.onMouseEnter(e);
    },
    onMouseLeave: (e) => {
      parentHandlers.onMouseLeave(e);
      childHandlers.onMouseLeave(e);
    },
  };

  // Row mouse events also keep parent open (the row is conceptually the parent's area).
  const rowHandlers: MouseHandlers = {
    onMouseEnter: (e) => {
      parentHandlers.onMouseEnter(e);
      if (hasChildren) childHandlers.onMouseEnter(e);
    },
    onMouseLeave: (e) => {
      parentHandlers.onMouseLeave(e);
      if (hasChildren) childHandlers.onMouseLeave(e);
    },
  };

  return (
    <div ref={rowRef} className="relative" {...rowHandlers}>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
          isActive
            ? 'text-accent bg-accent/15'
            : 'text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700/50'
        }`}
      >
        {item.icon && <NavIcon name={item.icon} size={14} />}
        <span className="whitespace-nowrap flex-1 text-left">{item.label}</span>
        {kind && (
          <span
            className="text-[8px] uppercase tracking-wider font-medium text-neutral-500"
            aria-hidden
          >
            {kind}
          </span>
        )}
        {panelId && (isOpen || isRecent) && (
          <span
            className={`text-[10px] leading-none ${
              isOpen ? 'text-emerald-400/90' : 'text-neutral-500/80'
            }`}
            title={isOpen ? 'Currently open' : 'Recently used'}
            aria-label={isOpen ? 'Currently open' : 'Recently used'}
          >
            ●
          </span>
        )}
        {hasChildren && (
          <NavIcon name="chevronRight" size={12} />
        )}
      </button>
      {hasChildren && childOpen && (
        <PortalFloat
          anchor={rowRef.current}
          placement="right"
          align="start"
          offset={4}
          className="py-1.5 min-w-[180px] bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm"
          onMouseEnter={bridgedHandlers.onMouseEnter}
          onMouseLeave={bridgedHandlers.onMouseLeave}
        >
          <SubNavItemsList
            items={resolvedChildren!}
            route={route}
            activeItemId={null}
            parentHandlers={bridgedHandlers}
          />
        </PortalFloat>
      )}
    </div>
  );
}

function handleSubNavItemClick(
  item: SubNavItem,
  route: string,
  event: React.MouseEvent<HTMLButtonElement>,
  navigate: ReturnType<typeof useNavigate>,
): void {
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
}

function getPanelOpenPreference(panelId: string): 'dock-preferred' | 'float-preferred' | 'route-preferred' {
  const panel = panelSelectors.get(panelId);
  return panel?.navigation?.openPreference ?? 'dock-preferred';
}

/**
 * Classify a row so the UI can show a PANEL / PAGE chip. Returns null for
 * items with no clear target (default stubs, param-only rows, bare labels).
 */
function getItemKind(item: SubNavItem, panelId: string | null): 'PANEL' | 'PAGE' | null {
  if (panelId) return 'PANEL';
  if (item.route && !item.route.startsWith('/workspace')) return 'PAGE';
  return null;
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
