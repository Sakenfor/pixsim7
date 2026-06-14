import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { useHasManualRefreshUpdate } from '@lib/dev/manualRefreshStatus';
import { getBaseIcon } from '@lib/icons';
import { useEdgeInset } from '@lib/layout/edgeInsets';
import { panelSelectors } from '@lib/plugins/catalogSelectors';
import { useIsCoarsePointer } from '@lib/ui/coarsePointer';
import { suppressBeforeUnloadPrompt } from '@lib/utils/beforeUnloadGuard';


import { getFloatingDefinitionId } from '@features/workspace/lib/floatingPanelUtils';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { useActivityBarStore } from '@/stores/activityBarStore';

import { moduleRegistry } from '@app/modules';
import type { PageCategory } from '@app/modules/contracts';

import { MorePanelsFlyout } from './MorePanelsFlyout';
import { NavBadge } from './NavBadge';
import { PanelShortcuts } from './PanelShortcuts';
import { RecentShortcuts } from './RecentShortcuts';
import { SettingsFlyout } from './SettingsFlyout';
import { DRAG_MIME, pinnedPanelIdsFrom } from './shortcutDrag';
import { buildSubNavForPage } from './subNavBuilder';
import { SubNavFlyout, type NavFlyoutAction } from './SubNavFlyout';

/** Category display order */
const CATEGORY_ORDER: PageCategory[] = ['creation', 'automation', 'game', 'management', 'development'];

const CATEGORY_LABELS: Record<string, string> = {
  creation: 'CREATE',
  automation: 'AUTO',
  game: 'GAME',
  management: 'MANAGE',
  development: 'DEV',
};

type PageEntry = ReturnType<typeof moduleRegistry.getPages>[number];

function isPageVisibleInNav(page: PageEntry): boolean {
  if (page.showInNav !== undefined) {
    return page.showInNav;
  }
  return !page.hidden;
}

/** Reactive pages hook — mirrors the proven pattern from useModuleRoutes */
function useRegistryPages() {
  const [version, setVersion] = useState(0);
  const hiddenPageIds = useActivityBarStore((s) => s.hiddenPageIds);

  useEffect(() => {
    return moduleRegistry.subscribe(() => setVersion((v) => v + 1));
  }, []);

  return useMemo(() => {
    void version; // reactive dependency
    const allPages = moduleRegistry.getPages({ includeHidden: true });
    const hiddenSet = new Set(hiddenPageIds);
    const visiblePages = allPages.filter((p) => isPageVisibleInNav(p) && !hiddenSet.has(p.id));
    return { allPages, visiblePages };
  }, [version, hiddenPageIds]);
}

/** Reactive activity bar widgets from all registered modules */
function useActivityBarWidgets() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return moduleRegistry.subscribe(() => setVersion((v) => v + 1));
  }, []);

  return useMemo(() => {
    void version;
    return moduleRegistry.getActivityBarWidgets();
  }, [version]);
}

function groupByCategory(pages: PageEntry[]) {
  const groups: Partial<Record<PageCategory, PageEntry[]>> = {};
  for (const page of pages) {
    (groups[page.category] ??= []).push(page);
  }
  // Within each category, surface primary pages first (stable otherwise).
  for (const key of Object.keys(groups) as PageCategory[]) {
    const list = groups[key];
    if (!list) continue;
    list.sort((a, b) => {
      const ap = a.featurePrimary ? 0 : 1;
      const bp = b.featurePrimary ? 0 : 1;
      return ap - bp;
    });
  }
  return groups;
}

function Separator() {
  return <div className="w-6 border-t border-neutral-700/40 my-1" />;
}

/** Render a Lucide icon directly from the base icon map, bypassing theme system. */
export function NavIcon({ name, size }: { name: string; size: number }) {
  const Comp = getBaseIcon(name);
  if (!Comp) return null;
  return <Comp size={size} strokeWidth={2} />;
}

function GearButton({ panelId }: { panelId: string }) {
  return (
    <SettingsFlyout panelId={panelId}>
      <NavBadge
        position="tr"
        size="md"
        shape="square"
        tone="neutral"
        icon="settings"
        iconSize={10}
        hoverGated
        onClick={(e) => e.stopPropagation()}
        ariaLabel="Panel settings"
      />
    </SettingsFlyout>
  );
}

/** Portal-based tooltip label for nav buttons (avoids stacking context clipping) */
function NavTooltip({ name, triggerRef }: { name: string; triggerRef: React.RefObject<HTMLDivElement | null> }) {
  const rect = triggerRef.current?.getBoundingClientRect();
  if (!rect) return null;

  return createPortal(
    <div
      className="fixed z-tooltip py-1 px-3 bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm text-sm text-neutral-200 whitespace-nowrap pointer-events-none"
      style={{ top: rect.top + rect.height / 2, left: rect.right + 4, transform: 'translateY(-50%)' }}
    >
      {name}
    </div>,
    document.body,
  );
}

function NavButton({
  page,
  active,
  clickOverride,
}: {
  page: PageEntry;
  active: boolean;
  clickOverride?: { onClick: () => void; title: string };
}) {
  const navigate = useNavigate();
  const triggerRef = useRef<HTMLDivElement>(null);
  const subNavItems = typeof page.subNav === 'function' ? page.subNav() : page.subNav;
  const hasGear = !!page.settingsPanelId;

  const toggleShortcutPin = useWorkspaceStore((s) => s.toggleShortcutPin);
  const isPinnedShortcut = useWorkspaceStore((s) => s.isPinnedShortcut);
  const toggleHiddenPage = useActivityBarStore((s) => s.toggleHiddenPage);

  const handleClick = useCallback(() => {
    if (clickOverride) {
      clickOverride.onClick();
      return;
    }
    navigate(page.route);
  }, [clickOverride, navigate, page.route]);

  const shortcutKey = `page:${page.id}`;
  const isPinned = isPinnedShortcut(shortcutKey);

  const pageActions: NavFlyoutAction[] = [
    {
      id: 'pin',
      label: isPinned ? 'Unpin from shortcuts' : 'Pin to shortcuts',
      icon: 'pin',
      onClick: () => toggleShortcutPin(shortcutKey),
    },
    {
      id: 'hide',
      label: 'Hide from sidebar',
      icon: 'eye-off',
      danger: true,
      onClick: () => toggleHiddenPage(page.id),
    },
  ];

  const buttonStateClass = clickOverride
    ? 'text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 hover:text-emerald-300 animate-pulse-subtle'
    : active
      ? 'text-accent bg-accent/15'
      : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50';

  const button = (
    <div
      ref={triggerRef}
      className="relative flex items-center justify-center group/navbtn"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(DRAG_MIME, shortcutKey);
      }}
    >
      {/* Active indicator bar — hidden while click is repurposed as refresh */}
      {active && !clickOverride && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-accent-muted" />
      )}
      <button
        onClick={handleClick}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${buttonStateClass}`}
        aria-label={clickOverride?.title ?? page.name}
        title={clickOverride?.title}
      >
        <NavIcon name={page.icon} size={20} />
      </button>
      {/* Gear icon — visible on hover when page has settingsPanelId */}
      {hasGear && <GearButton panelId={page.settingsPanelId!} />}
    </div>
  );

  return (
    <SubNavFlyout
      items={subNavItems ?? []}
      route={page.route}
      pageActions={pageActions}
    >
      {button}
    </SubNavFlyout>
  );
}

function CategoryGroup({
  category,
  pages,
  location,
  refreshOverride,
}: {
  category: string;
  pages: PageEntry[];
  location: { pathname: string };
  refreshOverride?: { onClick: () => void; title: string };
}) {
  const isCollapsed = useActivityBarStore((s) => s.collapsedCategories.includes(category));
  const toggleCategory = useActivityBarStore((s) => s.toggleCategory);

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => toggleCategory(category)}
        className="w-full py-0.5 text-[9px] uppercase font-semibold tracking-wider text-neutral-600 hover:text-neutral-400 transition-colors select-none"
      >
        {CATEGORY_LABELS[category] ?? category.toUpperCase()}
      </button>
      {!isCollapsed &&
        pages.map((page, idx) => (
          <NavButton
            key={page.id}
            page={page}
            active={location.pathname.startsWith(page.route)}
            clickOverride={idx === 0 ? refreshOverride : undefined}
          />
        ))}
    </div>
  );
}

const DEV_REFRESH_CATEGORY = 'development';

export function ActivityBar() {
  const collapsed = useActivityBarStore((s) => s.collapsed);
  const toggle = useActivityBarStore((s) => s.toggle);
  // On touch devices there is no hover, so the hover-gated edge handle never
  // reveals itself — a collapsed bar becomes effectively impossible to reopen.
  // Show a persistent, finger-sized expand affordance instead.
  const coarsePointer = useIsCoarsePointer();

  // Drag-handle-to-collapse on touch. A dedicated grip on the right edge is the
  // reliable target — swiping anywhere on the 48px-wide bar competed with
  // button taps and had no room. The handle follows the finger left (live) and
  // collapses on a clear leftward drag (or a deliberate tap on the grip).
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const handleGripDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  }, []);
  const handleGripMove = useCallback((e: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start) return;
    // Only follow leftward; clamp so the bar can't be dragged off its rail.
    setDragX(Math.max(-48, Math.min(0, e.clientX - start.x)));
  }, []);
  const handleGripUp = useCallback((e: React.PointerEvent) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    setDragging(false);
    setDragX(0);
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const isTap = Math.abs(dx) < 6 && Math.abs(dy) < 6;
    // Dragged the grip clearly left, or tapped it directly → collapse.
    if (dx < -16 || isTap) toggle();
  }, [toggle]);
  const location = useLocation();
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const lastFloatingPanelStates = useWorkspaceStore((s) => s.lastFloatingPanelStates);
  const pinnedShortcuts = useWorkspaceStore((s) => s.pinnedShortcuts);
  const pinnedQuickAddPanels = useMemo(
    () => pinnedPanelIdsFrom(pinnedShortcuts),
    [pinnedShortcuts],
  );
  const { allPages, visiblePages } = useRegistryPages();
  const [panelVersion, setPanelVersion] = useState(0);

  useEffect(() => {
    return panelSelectors.subscribe(() => setPanelVersion((v) => v + 1));
  }, []);

  const openPanelIds = useMemo(
    () => Array.from(new Set(floatingPanels.map((panel) => getFloatingDefinitionId(panel.id)))),
    [floatingPanels],
  );
  const recentPanelIds = useMemo(
    () => Object.keys(lastFloatingPanelStates).reverse(),
    [lastFloatingPanelStates],
  );

  // Register edge presence so other widgets can respond
  useEdgeInset('activityBar', 'left', 48, !collapsed, 0, true);
  const navigate = useNavigate();
  const pages = useMemo(() => {
    void panelVersion; // reactive dependency for dynamic panel registration changes
    const panels = panelSelectors.getAll();
    return visiblePages.map((page) => ({
      ...page,
      subNav: buildSubNavForPage({
        page,
        allPages,
        panels,
        openPanelIds,
        recentPanelIds,
        pinnedPanelIds: pinnedQuickAddPanels,
      }),
    }));
  }, [allPages, openPanelIds, panelVersion, pinnedQuickAddPanels, recentPanelIds, visiblePages]);
  const groups = groupByCategory(pages);

  const homeRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLDivElement>(null);

  const activityBarWidgets = useActivityBarWidgets();
  const {
    enabled: manualRefreshEnabled,
    hasUpdate: manualRefreshHasUpdate,
    lastFile: manualRefreshLastFile,
  } = useHasManualRefreshUpdate();
  const devRefreshOverride = useMemo(
    () =>
      manualRefreshEnabled && manualRefreshHasUpdate
        ? {
            onClick: () => {
              suppressBeforeUnloadPrompt();
              window.location.reload();
            },
            title: manualRefreshLastFile
              ? `Frontend update available (${manualRefreshLastFile}). Click to refresh.`
              : 'Frontend update available. Click to refresh.',
          }
        : undefined,
    [manualRefreshEnabled, manualRefreshHasUpdate, manualRefreshLastFile],
  );

  const { isExpanded: homeHovered, handlers: homeHandlers } = useHoverExpand({ expandDelay: 400, collapseDelay: 0 });
  const { isExpanded: toggleHovered, handlers: toggleHandlers } = useHoverExpand({ expandDelay: 400, collapseDelay: 0 });

  const isHomeActive = location.pathname === '/';

  return (
    <>
      {/* Main bar — slides in/out */}
      <nav
        className="fixed left-0 top-0 h-screen h-dvh w-12 z-30 flex flex-col items-center py-2 bg-neutral-900/90 border-r border-neutral-800/60 backdrop-blur-sm transition-transform duration-200 ease-in-out"
        style={{
          transform: collapsed ? 'translateX(-100%)' : `translateX(${dragX}px)`,
          // Disable the slide transition while a finger is actively dragging so
          // the bar tracks the grip 1:1 (transition would lag the follow).
          transition: dragging ? 'none' : undefined,
        }}
      >
        {/* Always-visible top section */}
        <div className="w-full flex flex-col items-center shrink-0">
          {/* Home button */}
          <div ref={homeRef} className="relative flex items-center justify-center" {...homeHandlers}>
            {isHomeActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-accent-muted" />
            )}
            <button
              onClick={() => navigate('/')}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                isHomeActive
                  ? 'text-accent bg-accent/15'
                  : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
              }`}
              aria-label="Home"
            >
              <NavIcon name="home" size={20} />
            </button>
            {homeHovered && <NavTooltip name="Home" triggerRef={homeRef} />}
          </div>

          {/* Browse/search all panels — placed right under Home for discoverability */}
          <MorePanelsFlyout />

          <Separator />
        </div>

        {/* Scrollable middle — shortcuts + categories only */}
        <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain thin-scrollbar flex flex-col items-center">

          {/* Pinned panel shortcuts + auto "recent" section */}
          <PanelShortcuts />
          <RecentShortcuts />

          <Separator />

          {/* Category groups */}
          {CATEGORY_ORDER.map((cat, catIdx) => {
            const group = groups[cat];
            if (!group || group.length === 0) return null;
            return (
              <div key={cat} className="flex flex-col items-center gap-0.5">
                {catIdx > 0 && <Separator />}
                <CategoryGroup
                  category={cat}
                  pages={group}
                  location={location}
                  refreshOverride={cat === DEV_REFRESH_CATEGORY ? devRefreshOverride : undefined}
                />
              </div>
            );
          })}
        </div>

        {/* Activity bar widgets (contributed by modules) */}
        {activityBarWidgets.length > 0 && (
          <div className="flex flex-col items-center gap-0.5 mb-1">
            {activityBarWidgets.map((widget) => (
              <widget.component key={widget.id} />
            ))}
          </div>
        )}

        {/* Drag grip — touch only. Sits on the right edge; drag left (or tap)
            to collapse. `no-tap-expand` keeps its hit-area from bleeding over
            the adjacent nav buttons. `touch-action: none` lets it own the
            horizontal drag instead of the browser treating it as a scroll. */}
        {coarsePointer && !collapsed && (
          <button
            onPointerDown={handleGripDown}
            onPointerMove={handleGripMove}
            onPointerUp={handleGripUp}
            onPointerCancel={handleGripUp}
            className="no-tap-expand absolute left-full -ml-1.5 top-1/2 -translate-y-1/2 h-20 w-5 flex items-center justify-center active:bg-neutral-700/40 rounded-r"
            style={{ touchAction: 'none' }}
            aria-label="Drag left to collapse activity bar"
          >
            <div className="w-1 h-12 rounded-full bg-neutral-600" />
          </button>
        )}

        {/* Collapse toggle */}
        <div ref={toggleRef} className="relative flex items-center justify-center mb-1" {...toggleHandlers}>
          <button
            onClick={toggle}
            className={`w-10 h-10 flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50 transition-colors`}
            aria-label="Collapse activity bar"
          >
            <NavIcon name="chevronLeft" size={18} />
          </button>
          {toggleHovered && <NavTooltip name="Collapse" triggerRef={toggleRef} />}
        </div>
      </nav>

      {/* Expand affordance — visible only when collapsed. On touch devices it's
          wider and its handle is always visible (no hover to reveal it). */}
      <div
        className={`fixed left-0 top-0 h-screen h-dvh z-30 group/expand transition-opacity duration-200 ${coarsePointer ? 'w-6' : 'w-2'}`}
        style={{ opacity: collapsed ? 1 : 0, pointerEvents: collapsed ? 'auto' : 'none' }}
      >
        <button
          onClick={toggle}
          // `no-tap-expand` is essential: the global coarse-pointer ::after
          // hit-area sets `pointer-events: auto`, which would override the
          // wrapper's `pointer-events: none` and leave this full-height edge
          // strip stealing taps from the activity bar's own buttons while the
          // bar is expanded.
          className={`no-tap-expand w-full h-full flex items-center justify-center transition-opacity ${coarsePointer ? 'opacity-100' : 'opacity-0 group-hover/expand:opacity-100'}`}
          aria-label="Expand activity bar"
        >
          <div className={`rounded-full bg-neutral-600 hover:bg-neutral-400 transition-colors ${coarsePointer ? 'w-1.5 h-12' : 'w-1 h-8'}`} />
        </button>
      </div>
    </>
  );
}
