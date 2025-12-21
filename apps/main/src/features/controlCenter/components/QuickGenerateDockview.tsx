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
import { SmartDockview, createLocalPanelRegistry } from '@lib/dockview';
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

const emptyQuickGenRegistry = createLocalPanelRegistry<string>();

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
        ? 'quickGenerate-dockview-layout:v2:with-asset'
        : 'quickGenerate-dockview-layout:v2:no-asset'),
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

    return (
      <SmartDockview
        key={resetKey}
        registry={emptyQuickGenRegistry}
        storageKey={storageKey}
        context={context}
        defaultLayout={defaultLayout}
        minPanelsForTabs={2}
        className={className}
        onReady={handleReady}
        panelManagerId={panelManagerId}
        enableContextMenu
        includeGlobalPanels
        panelRegistryOverrides={{
          'quickgen-asset': { title: 'Asset' },
          'quickgen-prompt': { title: 'Prompt' },
          'quickgen-settings': { title: 'Settings' },
          'quickgen-blocks': { title: 'Blocks' },
        }}
      />
    );
  }
);

QuickGenerateDockview.displayName = 'QuickGenerateDockview';
