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

import { useCallback, useEffect, useState } from 'react';
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

/**
 * Shared quickgen panel host with common SmartDockview configuration.
 *
 * Usage:
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
 */
export function QuickGenPanelHost({
  panels,
  storageKey,
  panelManagerId,
  onReady,
  deprecatedPanels: additionalDeprecated,
  minPanelsForTabs = 1,
  enableContextMenu = true,
  className,
}: QuickGenPanelHostProps) {
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);

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

  // Create default layout function for this panel set
  const createDefaultLayout = useCallback(
    (api: DockviewApi) => {
      // Add prompt panel first (or asset if present)
      const firstPanel = panels.includes(QUICKGEN_PANEL_IDS.asset)
        ? QUICKGEN_PANEL_IDS.asset
        : QUICKGEN_PANEL_IDS.prompt;

      api.addPanel({
        id: firstPanel,
        component: firstPanel,
        title: getPanelTitle(firstPanel),
      });

      // Add remaining panels
      for (const panelId of panels) {
        if (panelId === firstPanel) continue;

        const referencePanel =
          panelId === QUICKGEN_PANEL_IDS.settings
            ? QUICKGEN_PANEL_IDS.prompt
            : panelId === QUICKGEN_PANEL_IDS.prompt
              ? QUICKGEN_PANEL_IDS.asset
              : panels[0];

        api.addPanel({
          id: panelId,
          component: panelId,
          title: getPanelTitle(panelId),
          position: { direction: 'right', referencePanel },
        });
      }
    },
    [panels]
  );

  return (
    <div className={className ?? 'h-full w-full'}>
      <SmartDockview
        panels={[...panels]}
        storageKey={storageKey}
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
