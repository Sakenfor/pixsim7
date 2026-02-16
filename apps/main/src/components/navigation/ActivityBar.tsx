import { Tooltip } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getBaseIcon } from '@lib/icons';
import { useEdgeInset } from '@lib/layout/edgeInsets';

import { useActivityBarStore } from '@/stores/activityBarStore';

import { moduleRegistry } from '@app/modules';
import type { PageCategory } from '@app/modules/contracts';

import { MorePanelsFlyout } from './MorePanelsFlyout';
import { PanelShortcuts } from './PanelShortcuts';
import { SettingsFlyout } from './SettingsFlyout';
import { SubNavFlyout } from './SubNavFlyout';

/** Category display order (development excluded) */
const CATEGORY_ORDER: PageCategory[] = ['creation', 'automation', 'game', 'management'];

const CATEGORY_LABELS: Record<string, string> = {
  creation: 'CREATE',
  automation: 'AUTO',
  game: 'GAME',
  management: 'MANAGE',
};

type PageEntry = ReturnType<typeof moduleRegistry.getPages>[number];

/** Reactive pages hook — mirrors the proven pattern from useModuleRoutes */
function useRegistryPages() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return moduleRegistry.subscribe(() => setVersion((v) => v + 1));
  }, []);

  return useMemo(() => {
    void version; // reactive dependency
    return moduleRegistry.getPages({ includeHidden: false });
  }, [version]);
}

function groupByCategory(pages: PageEntry[]) {
  const groups: Partial<Record<PageCategory, PageEntry[]>> = {};
  for (const page of pages) {
    if (page.category === 'development') continue;
    (groups[page.category] ??= []).push(page);
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
      <button
        onClick={(e) => e.stopPropagation()}
        className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-sm bg-neutral-700/80 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-600 transition-colors"
        aria-label="Panel settings"
      >
        <NavIcon name="settings" size={10} />
      </button>
    </SettingsFlyout>
  );
}

function NavButton({
  page,
  active,
}: {
  page: PageEntry;
  active: boolean;
}) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const hasSubNav = page.subNav && page.subNav.length > 0;
  const hasGear = !!page.settingsPanelId;

  const handleClick = useCallback(() => {
    navigate(page.route);
  }, [navigate, page.route]);

  const button = (
    <div
      className="relative flex items-center justify-center group/navbtn"
      onMouseEnter={hasSubNav ? undefined : () => setHovered(true)}
      onMouseLeave={hasSubNav ? undefined : () => setHovered(false)}
    >
      {/* Active indicator bar */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-accent-muted" />
      )}
      <button
        onClick={handleClick}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
          active
            ? 'text-accent bg-accent/15'
            : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
        }`}
        aria-label={page.name}
      >
        <NavIcon name={page.icon} size={20} />
      </button>
      {/* Gear icon — visible on hover when page has settingsPanelId */}
      {hasGear && (
        <div className="opacity-0 group-hover/navbtn:opacity-100 transition-opacity">
          <GearButton panelId={page.settingsPanelId!} />
        </div>
      )}
      {!hasSubNav && (
        <Tooltip content={page.name} position="right" show={hovered} delay={400} />
      )}
    </div>
  );

  if (hasSubNav) {
    return (
      <SubNavFlyout items={page.subNav!} route={page.route}>
        {button}
      </SubNavFlyout>
    );
  }

  return button;
}

function CategoryGroup({
  category,
  pages,
  location,
}: {
  category: string;
  pages: PageEntry[];
  location: { pathname: string };
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
        pages.map((page) => (
          <NavButton
            key={page.id}
            page={page}
            active={location.pathname.startsWith(page.route)}
          />
        ))}
    </div>
  );
}

export function ActivityBar() {
  const collapsed = useActivityBarStore((s) => s.collapsed);
  const toggle = useActivityBarStore((s) => s.toggle);
  const location = useLocation();

  // Register edge presence so other widgets can respond
  useEdgeInset('activityBar', 'left', 48, !collapsed, 0, true);
  const navigate = useNavigate();
  const pages = useRegistryPages();
  const groups = groupByCategory(pages);

  const [homeHovered, setHomeHovered] = useState(false);
  const [toggleHovered, setToggleHovered] = useState(false);

  const isHomeActive = location.pathname === '/';

  return (
    <>
      {/* Main bar — slides in/out */}
      <nav
        className="fixed left-0 top-0 h-screen w-12 z-30 flex flex-col items-center py-2 bg-neutral-900/90 border-r border-neutral-800/60 backdrop-blur-sm transition-transform duration-200 ease-in-out"
        style={{ transform: collapsed ? 'translateX(-100%)' : 'translateX(0)' }}
      >
        {/* Home button */}
        <div className="relative flex items-center justify-center">
          {isHomeActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-accent-muted" />
          )}
          <button
            onClick={() => navigate('/')}
            onMouseEnter={() => setHomeHovered(true)}
            onMouseLeave={() => setHomeHovered(false)}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
              isHomeActive
                ? 'text-accent bg-accent/15'
                : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
            }`}
            aria-label="Home"
          >
            <NavIcon name="home" size={20} />
          </button>
          <Tooltip content="Home" position="right" show={homeHovered} delay={400} />
        </div>

        <Separator />

        {/* Pinned panel shortcuts */}
        <PanelShortcuts />
        <MorePanelsFlyout />

        <Separator />

        {/* Category groups */}
        {CATEGORY_ORDER.map((cat, catIdx) => {
          const group = groups[cat];
          if (!group || group.length === 0) return null;
          return (
            <div key={cat} className="flex flex-col items-center gap-0.5">
              {catIdx > 0 && <Separator />}
              <CategoryGroup category={cat} pages={group} location={location} />
            </div>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Collapse toggle */}
        <div className="relative flex items-center justify-center mb-1">
          <button
            onClick={toggle}
            onMouseEnter={() => setToggleHovered(true)}
            onMouseLeave={() => setToggleHovered(false)}
            className={`w-10 h-10 flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50 transition-colors`}
            aria-label="Collapse activity bar"
          >
            <NavIcon name="chevronLeft" size={18} />
          </button>
          <Tooltip content="Collapse" position="right" show={toggleHovered} delay={400} />
        </div>
      </nav>

      {/* Expand affordance — visible only when collapsed */}
      <div
        className="fixed left-0 top-0 h-screen w-2 z-30 group/expand transition-opacity duration-200"
        style={{ opacity: collapsed ? 1 : 0, pointerEvents: collapsed ? 'auto' : 'none' }}
      >
        <button
          onClick={toggle}
          className={`w-full h-full flex items-center justify-center opacity-0 group-hover/expand:opacity-100 transition-opacity`}
          aria-label="Expand activity bar"
        >
          <div className="w-1 h-8 rounded-full bg-neutral-600 hover:bg-neutral-400 transition-colors" />
        </button>
      </div>
    </>
  );
}
