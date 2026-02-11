/* eslint-disable react-refresh/only-export-components */
/**
 * QuickGenPanelHost
 *
 * Thin wrapper around PanelHostDockview for quickgen panel layouts.
 * Handles common configuration: panels, scopes, default layout, storage key.
 *
 * Chrome components (GenerationSourceToggle, ViewerAssetInputProvider, etc.)
 * should be composed around this host, not inside it.
 *
 * Does NOT handle:
 * - CC's multi-asset/transition layout (that bypasses dockview)
 * - Capability providers (composed externally)
 * - Scope selection UI (handled by parent widget)
 *
 * Uses the quickgen panel group definition for configuration.
 * @see {@link @features/panels/domain/groups/quickgen}
 */

import type { DockviewApi } from 'dockview-core';
import { useCallback, forwardRef } from 'react';

import { createSafeApi } from '@lib/dockview';

import {
  PanelHostDockview,
  type PanelHostDockviewRef,
} from '@features/panels';

// Import from panel group definition
import quickgenGroup, {
  QUICKGEN_PANEL_IDS,
  QUICKGEN_PRESETS,
  type QuickGenSlot,
  type QuickGenPreset,
} from '@features/panels/domain/groups/quickgen';

type DockviewPanelPosition = Parameters<DockviewApi['addPanel']>[0]['position'];

// Re-export for backward compatibility
export { QUICKGEN_PANEL_IDS, QUICKGEN_PRESETS };
export type { QuickGenSlot, QuickGenPreset };

export interface QuickGenPanelHostProps {
  /** Panel IDs to include. Use QUICKGEN_PRESETS or custom array. */
  panels: readonly string[];
  /** Storage key for persisting layout. Should be unique per host instance. */
  storageKey: string;
  /** Panel manager ID for settings resolution */
  panelManagerId?: string;
  /** Context object passed to panels via dockview */
  context?: unknown;
  /** Custom default layout function. If not provided, uses auto-layout. */
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

/**
 * Shared quickgen panel host with common dockview configuration.
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
      resolvePanelPosition: customResolvePanelPosition,
      onReady,
      minPanelsForTabs = 1,
      enableContextMenu = true,
      className,
    },
    ref
  ) => {
    // Create default layout function for this panel set
    const createDefaultLayout = useCallback(
      (api: DockviewApi) => {
        // Use custom layout if provided
        if (customDefaultLayout) {
          customDefaultLayout(api);
          return;
        }

        // Use safe API to avoid "panel already exists" errors
        const safe = createSafeApi(api);

        // Auto-layout: add panels in order with sensible positions
        const hasAsset = panels.includes(QUICKGEN_PANEL_IDS.asset);
        const hasBlocks = panels.includes(QUICKGEN_PANEL_IDS.blocks);

        const promptPanel = api.getPanel(QUICKGEN_PANEL_IDS.prompt);

        // First panel (asset or prompt)
        const firstPanel = hasAsset ? QUICKGEN_PANEL_IDS.asset : QUICKGEN_PANEL_IDS.prompt;
        if (firstPanel === QUICKGEN_PANEL_IDS.asset && !api.getPanel(firstPanel)) {
          safe.addPanel({
            id: firstPanel,
            component: firstPanel,
            title: getPanelTitle(firstPanel),
            position: promptPanel ? { direction: 'left', referencePanel: QUICKGEN_PANEL_IDS.prompt } : undefined,
          });
        } else {
          safe.addPanel({
            id: firstPanel,
            component: firstPanel,
            title: getPanelTitle(firstPanel),
          });
        }

        // Prompt (if not first)
        if (hasAsset && panels.includes(QUICKGEN_PANEL_IDS.prompt)) {
          safe.addPanel({
            id: QUICKGEN_PANEL_IDS.prompt,
            component: QUICKGEN_PANEL_IDS.prompt,
            title: getPanelTitle(QUICKGEN_PANEL_IDS.prompt),
            position: api.getPanel(QUICKGEN_PANEL_IDS.asset)
              ? { direction: 'right', referencePanel: QUICKGEN_PANEL_IDS.asset }
              : undefined,
          });
        }

        // Settings
        if (panels.includes(QUICKGEN_PANEL_IDS.settings)) {
          const settingsRefPanel = api.getPanel(QUICKGEN_PANEL_IDS.prompt)
            ? QUICKGEN_PANEL_IDS.prompt
            : api.getPanel(QUICKGEN_PANEL_IDS.asset)
              ? QUICKGEN_PANEL_IDS.asset
              : undefined;
          safe.addPanel({
            id: QUICKGEN_PANEL_IDS.settings,
            component: QUICKGEN_PANEL_IDS.settings,
            title: getPanelTitle(QUICKGEN_PANEL_IDS.settings),
            position: settingsRefPanel ? { direction: 'right', referencePanel: settingsRefPanel } : undefined,
          });
        }

        // Blocks below prompt
        if (hasBlocks) {
          safe.addPanel({
            id: QUICKGEN_PANEL_IDS.blocks,
            component: QUICKGEN_PANEL_IDS.blocks,
            title: getPanelTitle(QUICKGEN_PANEL_IDS.blocks),
            position: api.getPanel(QUICKGEN_PANEL_IDS.prompt)
              ? { direction: 'below', referencePanel: QUICKGEN_PANEL_IDS.prompt }
              : undefined,
          });
        }
      },
      [panels, customDefaultLayout]
    );

    const resolvePanelPosition = useCallback(
      (panelId: string, api: DockviewApi) => {
        const override = customResolvePanelPosition?.(panelId, api);
        if (override) return override;
        if (
          panelId === QUICKGEN_PANEL_IDS.settings &&
          api.getPanel(QUICKGEN_PANEL_IDS.prompt)
        ) {
          return { direction: 'right', referencePanel: QUICKGEN_PANEL_IDS.prompt };
        }
        if (
          panelId === QUICKGEN_PANEL_IDS.blocks &&
          api.getPanel(QUICKGEN_PANEL_IDS.prompt)
        ) {
          return { direction: 'below', referencePanel: QUICKGEN_PANEL_IDS.prompt };
        }
        return undefined;
      },
      [customResolvePanelPosition],
    );

    return (
      <PanelHostDockview
        ref={ref}
        panels={panels}
        storageKey={storageKey}
        context={context}
        panelManagerId={panelManagerId}
        defaultLayout={createDefaultLayout}
        minPanelsForTabs={minPanelsForTabs}
        onReady={onReady}
        enableContextMenu={enableContextMenu}
        className={className}
        resolvePanelTitle={getPanelTitle}
        resolvePanelPosition={resolvePanelPosition}
      />
    );
  }
);

QuickGenPanelHost.displayName = 'QuickGenPanelHost';

/** Get display title for a panel ID using group definition */
function getPanelTitle(panelId: string): string {
  // Find slot name for this panel ID
  for (const [slotName, id] of Object.entries(QUICKGEN_PANEL_IDS)) {
    if (id === panelId) {
      return quickgenGroup.resolveTitle(slotName as QuickGenSlot);
    }
  }
  return panelId;
}
