/**
 * PanelHostMobile — SKETCH
 *
 * Mobile counterpart to PanelHostDockview. Reads the same panel registry
 * (panelSelectors) and reuses the same scope-resolver (resolveScopedPanelIds)
 * that dockview uses, but renders ONE active panel at a time with a bottom
 * nav for switching. No dockview chrome, no layout persistence, no drag/drop.
 *
 * The goal is parity of panel *eligibility* with dockview — if a panel shows
 * up in a given dock on desktop, it shows up in the mobile shell too, unless
 * explicitly opted out via `mobile.hidden` hints (not yet added to definePanel).
 *
 * Wiring (not yet done — left to call sites or an auto-switching wrapper):
 *
 *   const isMobile = useIsMobileViewport();
 *   return isMobile
 *     ? <PanelHostMobile dockId={dockId} context={ctx} storageKey={key} />
 *     : <PanelHostDockview dockId={dockId} context={ctx} storageKey={key} ... />;
 *
 * Next steps (after eyeballing this sketch):
 *   1. Pick ONE dock to trial-wire first (probably the main gallery or a
 *      viewer host). Identify its PanelHostDockview call site.
 *   2. Per-panel audit: run through panels that appear in that dock, note
 *      which render acceptably on 375px and which don't. Add a `mobile`
 *      hint field to definePanel ({ hidden?, priority?, compact? }) to
 *      opt out the ones that don't fit.
 *   3. Touch-target sweep in @pixsim7/shared.config: raise min button size,
 *      kill hover-only controls in shared.ui primitives.
 *
 * Known caveats:
 *   - Panel components are typed against IDockviewPanelProps and receive a
 *     real dockview `api`/`containerApi` on desktop. Here they get no-op
 *     stubs, which means any panel that calls e.g. `api.setTitle` will
 *     silently no-op. Fine for read/interact; surfaces if we hit a panel
 *     that actively drives dockview.
 *   - Scope-discovery/context-menu/dismiss-state are desktop concepts and
 *     are intentionally ignored here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import type { PanelDefinition, WorkspaceContext } from '@features/panels/lib/panelRegistry';

import { resolveScopedPanelIds } from './panelHostDockScope';

export interface PanelHostMobileProps {
  /** Dock scope (filters panels by availableIn). Mirrors PanelHostDockview. */
  dockId?: string;
  /** Explicit panel IDs. Mirrors PanelHostDockview. */
  panels?: readonly string[];
  excludePanels?: string[];
  allowedPanels?: string[];
  allowedCategories?: string[];
  hostSettingScopes?: string[];
  hostCapabilityKeys?: string[];
  /**
   * Context passed to panel components (as `params` and `context` props).
   * Matches PanelHostDockview's `context: unknown` shape — each panel
   * defines its own expected context type.
   */
  context?: unknown;
  /** Storage key — used to remember active panel across sessions. */
  storageKey: string;
  /** Panel IDs that should remain mounted even when not active. */
  keepMountedPanels?: string[];
  className?: string;
}

function getMobilePriority(def: PanelDefinition): number {
  return def.mobile?.priority ?? def.order ?? 9999;
}

function isMobileHidden(def: PanelDefinition): boolean {
  return def.mobile?.hidden === true;
}

export function PanelHostMobile({
  dockId,
  panels,
  excludePanels,
  allowedPanels,
  allowedCategories,
  hostSettingScopes,
  hostCapabilityKeys,
  context,
  storageKey,
  keepMountedPanels,
  className,
}: PanelHostMobileProps) {
  const eligiblePanelIds = useMemo(() => {
    const scoped = resolveScopedPanelIds(panelSelectors, {
      dockId,
      panels,
      excludePanels,
      allowedPanels,
      allowedCategories,
      hostSettingScopes,
      hostCapabilityKeys,
    });

    return scoped
      .map((id) => panelSelectors.get(id))
      .filter((def): def is PanelDefinition => !!def && !isMobileHidden(def))
      .filter((def) => !def.showWhen || def.showWhen(context as WorkspaceContext))
      .sort((a, b) => getMobilePriority(a) - getMobilePriority(b))
      .map((def) => def.id);
  }, [
    dockId,
    panels,
    excludePanels,
    allowedPanels,
    allowedCategories,
    hostSettingScopes,
    hostCapabilityKeys,
    context,
  ]);

  const activeStorageKey = `mobile-active:${storageKey}`;
  const [activeId, setActiveIdRaw] = useState<string | null>(() => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(activeStorageKey);
  });

  useEffect(() => {
    if (eligiblePanelIds.length === 0) return;
    if (!activeId || !eligiblePanelIds.includes(activeId)) {
      setActiveIdRaw(eligiblePanelIds[0]);
    }
  }, [eligiblePanelIds, activeId]);

  const setActiveId = useCallback(
    (id: string) => {
      setActiveIdRaw(id);
      try {
        localStorage.setItem(activeStorageKey, id);
      } catch {
        // storage unavailable — best-effort only
      }
    },
    [activeStorageKey],
  );

  const activeDef = activeId ? panelSelectors.get(activeId) : undefined;
  const mountedPanelIds = useMemo(() => {
    if (eligiblePanelIds.length === 0) return [];
    const requested = new Set(keepMountedPanels ?? []);
    const ids = new Set<string>();
    for (const panelId of eligiblePanelIds) {
      if (panelId === activeId || requested.has(panelId)) {
        ids.add(panelId);
      }
    }
    return eligiblePanelIds.filter((panelId) => ids.has(panelId));
  }, [eligiblePanelIds, keepMountedPanels, activeId]);

  return (
    <div className={className ?? 'flex h-full w-full flex-col'}>
      <header className="flex-none h-10 px-4 flex items-center border-b border-border">
        <h1 className="text-sm font-medium truncate">{activeDef?.title ?? ''}</h1>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {mountedPanelIds.map((panelId) => {
          const def = panelSelectors.get(panelId);
          const PanelComponent = def?.component;
          if (!PanelComponent) return null;
          const isActive = panelId === activeId;
          return (
            <div key={panelId} className={isActive ? 'h-full' : 'hidden h-full'} aria-hidden={!isActive}>
              <PanelComponent
                params={context}
                context={context}
                api={NOOP_PANEL_API}
                containerApi={NOOP_CONTAINER_API}
              />
            </div>
          );
        })}
      </main>

      <nav
        className="flex-none h-14 border-t border-border flex items-stretch overflow-x-auto"
        role="tablist"
        aria-label="Panels"
      >
        {eligiblePanelIds.map((id) => {
          const def = panelSelectors.get(id);
          if (!def) return null;
          const isActive = id === activeId;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(id)}
              className={
                'flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 text-[10px] px-2 ' +
                (isActive
                  ? 'text-foreground bg-accent/15'
                  : 'text-muted-foreground hover:bg-accent/5')
              }
            >
              <span className="truncate w-full text-center">{def.title}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// Minimal stubs for dockview APIs that panel components may destructure.
// Panels that actively drive dockview (setTitle, close tabs, etc.) will
// silently no-op on mobile — acceptable for read/interact flows.
const NOOP_PANEL_API = new Proxy(
  {},
  {
    get: () => () => undefined,
  },
) as any;

const NOOP_CONTAINER_API = new Proxy(
  {},
  {
    get: () => () => undefined,
  },
) as any;
