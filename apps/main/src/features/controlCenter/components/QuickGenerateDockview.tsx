/**
 * QuickGenerateDockview
 *
 * Dockview-based quick generate module with resizable, rearrangeable panels.
 * Uses SmartDockview for smart tab visibility (tabs shown only when grouped).
 *
 * Supports two layouts:
 * - 4-panel (with asset): Asset | Prompt | Settings, with Blocks below Prompt
 * - 3-panel (no asset): Prompt | Settings, with Blocks below Prompt
 */

import { useMemo, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import type { DockviewApi } from 'dockview-core';
import { SmartDockview } from '@lib/dockview';
import type { QuickGenPanelContext } from './QuickGeneratePanels';

export interface QuickGenerateDockviewProps {
  /** Shared context passed to all panel components */
  context: QuickGenPanelContext;
  /** Whether to show the asset panel in layout */
  showAssetPanel: boolean;
  /** Callback when dockview is ready */
  onReady?: (api: DockviewApi) => void;
  /** Additional class name */
  className?: string;
  /** Panel manager ID for orchestration */
  panelManagerId?: string;
}

export interface QuickGenerateDockviewRef {
  /** Reset the layout to default */
  resetLayout: () => void;
  /** Get the dockview API */
  getApi: () => DockviewApi | null;
}

// QuickGen panels to use (all have availableIn: ['control-center'])
const QUICKGEN_PANELS_WITH_ASSET = ['quickgen-asset', 'quickgen-prompt', 'quickgen-settings', 'quickgen-blocks'] as const;
const QUICKGEN_PANELS_NO_ASSET = ['quickgen-prompt', 'quickgen-settings', 'quickgen-blocks'] as const;

/**
 * Create the default 4-panel layout (with asset panel)
 */
function createLayoutWithAsset(api: DockviewApi) {
  // Asset panel on the left
  api.addPanel({
    id: 'quickgen-asset',
    component: 'quickgen-asset',
    title: 'Asset',
  });

  // Prompt panel in the center
  api.addPanel({
    id: 'quickgen-prompt',
    component: 'quickgen-prompt',
    title: 'Prompt',
    position: {
      direction: 'right',
      referencePanel: 'quickgen-asset',
    },
  });

  // Settings panel on the right
  api.addPanel({
    id: 'quickgen-settings',
    component: 'quickgen-settings',
    title: 'Settings',
    position: {
      direction: 'right',
      referencePanel: 'quickgen-prompt',
    },
  });

  // Blocks panel below prompt
  api.addPanel({
    id: 'quickgen-blocks',
    component: 'quickgen-blocks',
    title: 'Blocks',
    position: {
      direction: 'below',
      referencePanel: 'quickgen-prompt',
    },
  });
}

/**
 * Create the default 3-panel layout (without asset panel)
 */
function createLayoutWithoutAsset(api: DockviewApi) {
  // Prompt panel on the left
  api.addPanel({
    id: 'quickgen-prompt',
    component: 'quickgen-prompt',
    title: 'Prompt',
  });

  // Settings panel on the right
  api.addPanel({
    id: 'quickgen-settings',
    component: 'quickgen-settings',
    title: 'Settings',
    position: {
      direction: 'right',
      referencePanel: 'quickgen-prompt',
    },
  });

  // Blocks panel below prompt
  api.addPanel({
    id: 'quickgen-blocks',
    component: 'quickgen-blocks',
    title: 'Blocks',
    position: {
      direction: 'below',
      referencePanel: 'quickgen-prompt',
    },
  });
}

export const QuickGenerateDockview = forwardRef<QuickGenerateDockviewRef, QuickGenerateDockviewProps>(
  ({ context, showAssetPanel, onReady, className, panelManagerId }, ref) => {
    // Use different storage keys for different layouts to avoid conflicts
    const storageKey = useMemo(
      () => (showAssetPanel
        ? 'dockview:quickgen:v3:with-asset'
        : 'dockview:quickgen:v3:no-asset'),
      [showAssetPanel]
    );

    // Key to force remount on reset
    const [resetKey, setResetKey] = useState(0);

    // Choose default layout based on whether asset panel should be shown
    const defaultLayout = useCallback(
      (api: DockviewApi, _registry: any) => {
        if (showAssetPanel) {
          createLayoutWithAsset(api);
        } else {
          createLayoutWithoutAsset(api);
        }
      },
      [showAssetPanel]
    );

    // Handle ready event - forward to parent
    const handleReady = useCallback(
      (api: DockviewApi) => {
        onReady?.(api);
      },
      [onReady]
    );

    // Expose reset method via ref
    const resetLayout = useCallback(() => {
      // Clear the current storage key
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
      // Force remount by changing key
      setResetKey((k) => k + 1);
    }, [storageKey]);

    useImperativeHandle(ref, () => ({
      resetLayout,
      getApi: () => null, // API will be available through onReady callback
    }));

    // Select panels based on showAssetPanel
    const panelIds = useMemo(
      () => [...(showAssetPanel ? QUICKGEN_PANELS_WITH_ASSET : QUICKGEN_PANELS_NO_ASSET)],
      [showAssetPanel]
    );

    return (
      <SmartDockview
        key={resetKey}
        panels={panelIds}
        storageKey={storageKey}
        context={context}
        defaultPanelScopes={['generation']}
        defaultLayout={defaultLayout}
        minPanelsForTabs={2}
        className={className}
        onReady={handleReady}
        panelManagerId={panelManagerId}
        enableContextMenu
      />
    );
  }
);

QuickGenerateDockview.displayName = 'QuickGenerateDockview';
