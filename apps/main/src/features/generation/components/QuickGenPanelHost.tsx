/* eslint-disable react-refresh/only-export-components */
/**
 * QuickGenPanelHost
 *
 * Thin wrapper around PanelHostDockview for quickgen panel layouts.
 * Adds workspace integration (bootstrap + floating panels) on top of the
 * generic PanelHostDockview.
 */

import type { DockviewApi } from 'dockview-core';
import { useMemo, useCallback, forwardRef } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import {
  PanelHostDockview,
  usePanelCatalogBootstrap,
  type PanelHostDockviewRef,
  type LayoutSpecEntry,
} from '@features/panels';
import { useIsMobileViewport } from '@features/panels/components/host/useIsMobileViewport';
import { useAppDockviewIntegration } from '@features/workspace';

type DockviewPanelPosition = Parameters<DockviewApi['addPanel']>[0]['position'];

// ── QuickGen panel IDs and presets ──

/** QuickGen slot names */
export type QuickGenSlot = 'asset' | 'prompt' | 'settings' | 'blocks';

/** QuickGen preset names */
export type QuickGenPreset = 'promptSettings' | 'full' | 'fullWithBlocks' | 'promptSettingsBlocks';

/** Panel IDs for quickgen slots */
export const QUICKGEN_PANEL_IDS = {
  asset: 'quickgen-asset',
  prompt: 'quickgen-prompt',
  settings: 'quickgen-settings',
  blocks: 'quickgen-blocks',
} as const satisfies Record<QuickGenSlot, string>;

/** Named panel sets for common quickgen configurations */
export const QUICKGEN_PRESETS = {
  /** Prompt + Settings (no asset) — for viewer, text-to-* ops */
  promptSettings: [QUICKGEN_PANEL_IDS.prompt, QUICKGEN_PANEL_IDS.settings],
  /** Asset + Prompt + Settings — for CC single-asset mode */
  full: [QUICKGEN_PANEL_IDS.asset, QUICKGEN_PANEL_IDS.prompt, QUICKGEN_PANEL_IDS.settings],
  /** Full with blocks panel */
  fullWithBlocks: [QUICKGEN_PANEL_IDS.asset, QUICKGEN_PANEL_IDS.prompt, QUICKGEN_PANEL_IDS.settings, QUICKGEN_PANEL_IDS.blocks],
  /** Prompt + Settings + Blocks (no asset) */
  promptSettingsBlocks: [QUICKGEN_PANEL_IDS.prompt, QUICKGEN_PANEL_IDS.settings, QUICKGEN_PANEL_IDS.blocks],
} as const satisfies Record<QuickGenPreset, readonly string[]>;

/**
 * Derive a layout spec from the included panel set.
 * Asset left, prompt right of asset (or first), settings right of prompt, blocks below prompt.
 */
function deriveLayoutSpec(panelIds: readonly string[]): LayoutSpecEntry[] {
  const has = (id: string) => panelIds.includes(id);
  const spec: LayoutSpecEntry[] = [];

  if (has(QUICKGEN_PANEL_IDS.asset)) {
    spec.push({ id: QUICKGEN_PANEL_IDS.asset });
  }

  if (has(QUICKGEN_PANEL_IDS.prompt)) {
    spec.push(
      has(QUICKGEN_PANEL_IDS.asset)
        ? { id: QUICKGEN_PANEL_IDS.prompt, direction: 'right', ref: QUICKGEN_PANEL_IDS.asset }
        : { id: QUICKGEN_PANEL_IDS.prompt },
    );
  }

  if (has(QUICKGEN_PANEL_IDS.settings)) {
    const ref = has(QUICKGEN_PANEL_IDS.prompt) ? QUICKGEN_PANEL_IDS.prompt
      : has(QUICKGEN_PANEL_IDS.asset) ? QUICKGEN_PANEL_IDS.asset
      : undefined;
    spec.push(ref
      ? { id: QUICKGEN_PANEL_IDS.settings, direction: 'right', ref }
      : { id: QUICKGEN_PANEL_IDS.settings },
    );
  }

  if (has(QUICKGEN_PANEL_IDS.blocks)) {
    spec.push(
      has(QUICKGEN_PANEL_IDS.prompt)
        ? { id: QUICKGEN_PANEL_IDS.blocks, direction: 'below', ref: QUICKGEN_PANEL_IDS.prompt }
        : { id: QUICKGEN_PANEL_IDS.blocks },
    );
  }

  return spec;
}

// ── Component ──

export interface QuickGenPanelHostProps {
  /** Panel IDs to include. Use QUICKGEN_PRESETS or custom array. */
  panels: readonly string[];
  /** Storage key for persisting layout. Should be unique per host instance. */
  storageKey: string;
  /** Panel manager ID for settings resolution */
  panelManagerId?: string;
  /** Context object passed to panels via dockview */
  context?: unknown;
  /** Custom default layout function. If not provided, uses auto-layout from panel set. */
  defaultLayout?: (api: DockviewApi) => void;
  /** Optional position resolver for missing panels. */
  resolvePanelPosition?: (panelId: string, api: DockviewApi) => DockviewPanelPosition | undefined;
  /** Callback when dockview is ready */
  onReady?: (api: DockviewApi) => void;
  /** Minimum panels before showing tabs (default: 1) */
  minPanelsForTabs?: number;
  /** Enable context menu (default: true) */
  enableContextMenu?: boolean;
  /** CSS class for the container */
  className?: string;
}

export type QuickGenPanelHostRef = PanelHostDockviewRef;

function arePanelsRegistered(panelIds: readonly string[]): boolean {
  return panelIds.every((panelId) => panelSelectors.has(panelId));
}

// ── Mobile stacked-layout heights (px) ──
// Asset is compact; prompt + settings get more vertical room since they hold
// the primary inputs. Container scrolls when the sum exceeds viewport.
const QUICKGEN_MOBILE_SECTION_HEIGHTS: Record<string, number> = {
  [QUICKGEN_PANEL_IDS.asset]: 140,
  [QUICKGEN_PANEL_IDS.prompt]: 260,
  [QUICKGEN_PANEL_IDS.settings]: 320,
  [QUICKGEN_PANEL_IDS.blocks]: 280,
};

// Dockview-API stubs for panels rendered outside a real dockview host.
// Same pattern as PanelHostMobile — panels that drive the dockview API on
// desktop will silently no-op on mobile, which is acceptable for read/edit
// flows that don't reposition tabs themselves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NOOP_PANEL_API: any = new Proxy({}, { get: () => () => undefined });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NOOP_CONTAINER_API: any = new Proxy({}, { get: () => () => undefined });

/**
 * Shared quickgen panel host with workspace integration (bootstrap + floating panels).
 */
export const QuickGenPanelHost = forwardRef<QuickGenPanelHostRef, QuickGenPanelHostProps>(
  (
    {
      panels,
      storageKey,
      panelManagerId,
      context,
      defaultLayout,
      resolvePanelPosition: customResolvePanelPosition,
      onReady,
      minPanelsForTabs = 1,
      enableContextMenu = true,
      className,
    },
    ref
  ) => {
    // Workspace integration: bootstrap + floating panels
    const { initializationComplete } = usePanelCatalogBootstrap({
      panelIds: panels,
      onInitializeError: (error) => {
        console.error('[QuickGenPanelHost] Failed to initialize quickgen panels:', error);
      },
    });
    const panelsReady = arePanelsRegistered(panels);
    const showLoadingPlaceholder = !initializationComplete && !panelsReady;
    const isMobile = useIsMobileViewport();
    const {
      capabilities: dockCapabilities,
      placementExclusions: floatingQuickGenPanelIds,
    } = useAppDockviewIntegration(panelManagerId, panels);

    // Derive layout spec from included panels (excluding floating ones)
    const layoutSpec = useMemo(() => {
      const excludedPanelIds = new Set(floatingQuickGenPanelIds);
      const included = panels.filter((id) => !excludedPanelIds.has(id));
      return deriveLayoutSpec(included);
    }, [floatingQuickGenPanelIds, panels]);

    // Position resolver for panels added after initial layout
    const resolvePanelPosition = useCallback(
      (panelId: string, api: DockviewApi) => {
        const override = customResolvePanelPosition?.(panelId, api);
        if (override) return override;
        if (panelId === QUICKGEN_PANEL_IDS.settings && api.getPanel(QUICKGEN_PANEL_IDS.prompt)) {
          return { direction: 'right', referencePanel: QUICKGEN_PANEL_IDS.prompt };
        }
        if (panelId === QUICKGEN_PANEL_IDS.blocks && api.getPanel(QUICKGEN_PANEL_IDS.prompt)) {
          return { direction: 'below', referencePanel: QUICKGEN_PANEL_IDS.prompt };
        }
        return undefined;
      },
      [customResolvePanelPosition],
    );

    if (showLoadingPlaceholder) {
      return <div className={className ?? 'h-full w-full'} />;
    }

    if (isMobile) {
      // Mobile: stack all included quickgen panels vertically in one scroll
      // container — asset, prompt, and settings are visible simultaneously,
      // each taking full viewport width. Avoids the desktop horizontal split
      // (which collapses the prompt textbox to ~80px wide on a 375px screen)
      // and avoids the extra tab strip a tabs-based mobile host would add.
      const excluded = new Set(floatingQuickGenPanelIds);
      const stackedPanels = panels.filter((id) => !excluded.has(id));
      return (
        <div className={className ?? 'h-full overflow-y-auto'}>
          <div className="flex flex-col">
            {stackedPanels.map((panelId) => {
              const def = panelSelectors.get(panelId);
              if (!def) return null;
              const Component = def.component;
              const sectionHeight = QUICKGEN_MOBILE_SECTION_HEIGHTS[panelId] ?? 240;
              return (
                <section
                  key={panelId}
                  className="flex-shrink-0 flex flex-col border-b border-neutral-200 dark:border-neutral-800 last:border-b-0"
                  style={{ height: sectionHeight }}
                >
                  <header className="flex-none px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/40">
                    {def.title}
                  </header>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <Component
                      params={context}
                      context={context}
                      api={NOOP_PANEL_API}
                      containerApi={NOOP_CONTAINER_API}
                    />
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <PanelHostDockview
        ref={ref}
        panels={panels}
        storageKey={storageKey}
        context={context}
        panelManagerId={panelManagerId}
        excludeFromLayout={floatingQuickGenPanelIds}
        defaultLayout={defaultLayout}
        layoutSpec={defaultLayout ? undefined : layoutSpec}
        minPanelsForTabs={minPanelsForTabs}
        onReady={onReady}
        enableContextMenu={enableContextMenu}
        capabilities={dockCapabilities}
        className={className}
        resolvePanelPosition={resolvePanelPosition}
      />
    );
  }
);

QuickGenPanelHost.displayName = 'QuickGenPanelHost';
