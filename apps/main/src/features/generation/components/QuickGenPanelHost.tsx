/**
 * QuickGenPanelHost
 *
 * Thin wrapper around SmartDockview for quickgen panel layouts.
 * Handles common configuration: panels, scopes, default layout, storage key.
 *
 * Chrome components (GenerationSourceToggle, ViewerAssetInputProvider, etc.)
 * should be composed around this host, not inside it.
 *
 * Does NOT handle:
 * - CC's multi-asset/transition layout (that bypasses dockview)
 * - Capability providers (composed externally)
 * - Scope selection UI (handled by parent widget)
 */

import {
  useCallback,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { SmartDockview } from '@lib/dockview';
import type { DockviewApi } from 'dockview-core';

/** Standard quickgen panel IDs from global registry */
export const QUICKGEN_PANEL_IDS = {
  asset: 'quickgen-asset',
  prompt: 'quickgen-prompt',
  settings: 'quickgen-settings',
  blocks: 'quickgen-blocks',
} as const;

/** Common panel configurations */
export const QUICKGEN_PRESETS = {
  /** Prompt + Settings (no asset panel) - for viewer, text-to-* ops */
  promptSettings: [QUICKGEN_PANEL_IDS.prompt, QUICKGEN_PANEL_IDS.settings] as const,
  /** Asset + Prompt + Settings - for CC single-asset mode */
  full: [QUICKGEN_PANEL_IDS.asset, QUICKGEN_PANEL_IDS.prompt, QUICKGEN_PANEL_IDS.settings] as const,
  /** Full with blocks panel */
  fullWithBlocks: [
    QUICKGEN_PANEL_IDS.asset,
    QUICKGEN_PANEL_IDS.prompt,
    QUICKGEN_PANEL_IDS.settings,
    QUICKGEN_PANEL_IDS.blocks,
  ] as const,
  /** Prompt + Settings + Blocks (no asset) */
  promptSettingsBlocks: [
    QUICKGEN_PANEL_IDS.prompt,
    QUICKGEN_PANEL_IDS.settings,
    QUICKGEN_PANEL_IDS.blocks,
  ] as const,
} as const;

/** Deprecated panel IDs for layout migration */
const DEPRECATED_PANELS: string[] = [
  'info',
  'prompt',
  'settings',
  'viewer-quickgen-prompt',
  'viewer-quickgen-settings',
];

export interface QuickGenPanelHostProps {
  /** Panel IDs to include. Use QUICKGEN_PRESETS or custom array. */
  panels: readonly string[];
  /** Storage key for persisting layout. Should be unique per host instance. */
  storageKey: string;
  /** Panel manager ID for settings resolution */
  panelManagerId?: string;
  /** Context object passed to panels via SmartDockview */
  context?: unknown;
  /** Custom default layout function. If not provided, uses auto-layout. */
  defaultLayout?: (api: DockviewApi) => void;
  /** Callback when dockview is ready */
  onReady?: (api: DockviewApi) => void;
  /** Additional deprecated panel IDs for migration */
  deprecatedPanels?: string[];
  /** Minimum panels before showing tabs (default: 1) */
  minPanelsForTabs?: number;
  /** Enable context menu (default: true) */
  enableContextMenu?: boolean;
  /** CSS class for the container */
  className?: string;
}

export interface QuickGenPanelHostRef {
  /** Reset the layout to default (clears storage, remounts) */
  resetLayout: () => void;
  /** Get the dockview API (may be null before ready) */
  getApi: () => DockviewApi | null;
}

/**
 * Shared quickgen panel host with common SmartDockview configuration.
 *
 * Usage (Viewer - simple):
 * ```tsx
 * <GenerationScopeProvider scopeId={scopeId}>
 *   <GenerationSourceToggle ... />
 *   <ViewerAssetInputProvider asset={asset} />
 *   <QuickGenPanelHost
 *     panels={QUICKGEN_PRESETS.promptSettings}
 *     storageKey="viewer-quickgen-layout"
 *     panelManagerId="viewerQuickGenerate"
 *   />
 * </GenerationScopeProvider>
 * ```
 *
 * Usage (CC - with context and ref):
 * ```tsx
 * <QuickGenPanelHost
 *   ref={hostRef}
 *   panels={showAsset ? QUICKGEN_PRESETS.fullWithBlocks : QUICKGEN_PRESETS.promptSettingsBlocks}
 *   storageKey={showAsset ? 'cc-quickgen-asset' : 'cc-quickgen-noasset'}
 *   panelManagerId="controlCenter"
 *   context={panelContext}
 *   defaultLayout={showAsset ? createLayoutWithAsset : createLayoutWithoutAsset}
 *   onReady={handleReady}
 * />
 * ```
 */
export const QuickGenPanelHost = forwardRef<QuickGenPanelHostRef, QuickGenPanelHostProps>(
  (
    {
      panels,
      storageKey,
      panelManagerId,
      context,
      defaultLayout: customDefaultLayout,
      onReady,
      deprecatedPanels: additionalDeprecated,
      minPanelsForTabs = 1,
      enableContextMenu = true,
      className,
    },
    ref
  ) => {
    const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
    const [resetKey, setResetKey] = useState(0);

    // Merge deprecated panels
    const allDeprecated = additionalDeprecated
      ? [...DEPRECATED_PANELS, ...additionalDeprecated]
      : DEPRECATED_PANELS;

    // Ensure required panels exist (handles stale layouts)
    const ensurePanels = useCallback(
      (api: DockviewApi) => {
        for (const panelId of panels) {
          if (!api.getPanel(panelId)) {
            const position =
              panelId === QUICKGEN_PANEL_IDS.settings && api.getPanel(QUICKGEN_PANEL_IDS.prompt)
                ? { direction: 'right' as const, referencePanel: QUICKGEN_PANEL_IDS.prompt }
                : panelId === QUICKGEN_PANEL_IDS.blocks && api.getPanel(QUICKGEN_PANEL_IDS.prompt)
                  ? { direction: 'below' as const, referencePanel: QUICKGEN_PANEL_IDS.prompt }
                  : undefined;

            api.addPanel({
              id: panelId,
              component: panelId,
              title: getPanelTitle(panelId),
              position,
            });
          }
        }
      },
      [panels]
    );

    const handleReady = useCallback(
      (api: DockviewApi) => {
        setDockviewApi(api);
        ensurePanels(api);
        onReady?.(api);
      },
      [ensurePanels, onReady]
    );

    // Re-check panels after layout load (handles stale persisted layouts)
    useEffect(() => {
      if (!dockviewApi) return;
      requestAnimationFrame(() => ensurePanels(dockviewApi));
    }, [dockviewApi, ensurePanels]);

    // Reset layout: clear storage and remount
    const resetLayout = useCallback(() => {
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
      setResetKey((k) => k + 1);
    }, [storageKey]);

    // Expose ref methods
    useImperativeHandle(
      ref,
      () => ({
        resetLayout,
        getApi: () => dockviewApi,
      }),
      [resetLayout, dockviewApi]
    );

    // Create default layout function for this panel set
    const createDefaultLayout = useCallback(
      (api: DockviewApi) => {
        // Use custom layout if provided
        if (customDefaultLayout) {
          customDefaultLayout(api);
          return;
        }

        // Auto-layout: add panels in order with sensible positions
        const hasAsset = panels.includes(QUICKGEN_PANEL_IDS.asset);
        const hasBlocks = panels.includes(QUICKGEN_PANEL_IDS.blocks);

        // First panel
        const firstPanel = hasAsset ? QUICKGEN_PANEL_IDS.asset : QUICKGEN_PANEL_IDS.prompt;
        api.addPanel({
          id: firstPanel,
          component: firstPanel,
          title: getPanelTitle(firstPanel),
        });

        // Prompt (if not first)
        if (hasAsset && panels.includes(QUICKGEN_PANEL_IDS.prompt)) {
          api.addPanel({
            id: QUICKGEN_PANEL_IDS.prompt,
            component: QUICKGEN_PANEL_IDS.prompt,
            title: getPanelTitle(QUICKGEN_PANEL_IDS.prompt),
            position: { direction: 'right', referencePanel: QUICKGEN_PANEL_IDS.asset },
          });
        }

        // Settings
        if (panels.includes(QUICKGEN_PANEL_IDS.settings)) {
          api.addPanel({
            id: QUICKGEN_PANEL_IDS.settings,
            component: QUICKGEN_PANEL_IDS.settings,
            title: getPanelTitle(QUICKGEN_PANEL_IDS.settings),
            position: { direction: 'right', referencePanel: QUICKGEN_PANEL_IDS.prompt },
          });
        }

        // Blocks below prompt
        if (hasBlocks) {
          api.addPanel({
            id: QUICKGEN_PANEL_IDS.blocks,
            component: QUICKGEN_PANEL_IDS.blocks,
            title: getPanelTitle(QUICKGEN_PANEL_IDS.blocks),
            position: { direction: 'below', referencePanel: QUICKGEN_PANEL_IDS.prompt },
          });
        }
      },
      [panels, customDefaultLayout]
    );

    return (
      <div className={className ?? 'h-full w-full'}>
        <SmartDockview
          key={resetKey}
          panels={[...panels]}
          storageKey={storageKey}
          context={context}
          defaultPanelScopes={['generation']}
          panelManagerId={panelManagerId}
          defaultLayout={createDefaultLayout}
          minPanelsForTabs={minPanelsForTabs}
          deprecatedPanels={allDeprecated}
          onReady={handleReady}
          enableContextMenu={enableContextMenu}
        />
      </div>
    );
  }
);

QuickGenPanelHost.displayName = 'QuickGenPanelHost';

/** Get display title for a panel ID */
function getPanelTitle(panelId: string): string {
  switch (panelId) {
    case QUICKGEN_PANEL_IDS.asset:
      return 'Asset';
    case QUICKGEN_PANEL_IDS.prompt:
      return 'Prompt';
    case QUICKGEN_PANEL_IDS.settings:
      return 'Settings';
    case QUICKGEN_PANEL_IDS.blocks:
      return 'Blocks';
    default:
      return panelId;
  }
}
