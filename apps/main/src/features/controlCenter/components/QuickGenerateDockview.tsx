/**
 * QuickGenerateDockview
 *
 * Dockview-based quick generate module with resizable, rearrangeable panels.
 * Wraps QuickGenPanelHost with CC-specific configuration.
 *
 * Supports two layouts:
 * - 4-panel (with asset): Asset | Prompt | Settings, with Blocks below Prompt
 * - 3-panel (no asset): Prompt | Settings, with Blocks below Prompt
 */

import type { DockviewApi } from 'dockview-core';
import { useMemo, forwardRef } from 'react';

import {
  QuickGenPanelHost,
  QUICKGEN_PRESETS,
  type QuickGenPanelHostRef,
} from '@features/generation';

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

export const QuickGenerateDockview = forwardRef<QuickGenerateDockviewRef, QuickGenerateDockviewProps>(
  ({ context, showAssetPanel, onReady, className, panelManagerId }, ref) => {
    // Select panels and storage key based on showAssetPanel
    const panels = useMemo(
      () => (showAssetPanel ? QUICKGEN_PRESETS.fullWithBlocks : QUICKGEN_PRESETS.promptSettingsBlocks),
      [showAssetPanel]
    );

    const storageKey = useMemo(
      () => (showAssetPanel ? 'dockview:quickgen:v4:with-asset' : 'dockview:quickgen:v4:no-asset'),
      [showAssetPanel]
    );

    return (
      <QuickGenPanelHost
        ref={ref as React.Ref<QuickGenPanelHostRef>}
        panels={panels}
        storageKey={storageKey}
        context={context}
        panelManagerId={panelManagerId}
        onReady={onReady}
        className={className}
        minPanelsForTabs={2}
      />
    );
  }
);

QuickGenerateDockview.displayName = 'QuickGenerateDockview';
