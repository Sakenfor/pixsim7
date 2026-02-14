/**
 * QuickGeneratePanel - Global Helper Panel
 *
 * Context-aware quick generation panel that adapts to current context.
 * Panels declare settingScopes: ['generation'], and SmartDockview/ScopeHost
 * applies GenerationScopeProvider automatically.
 */

import { useMemo } from 'react';
import type { IDockviewPanelProps } from 'dockview-core';
import { ViewerQuickGenerate } from '../../../../components/media/ViewerQuickGenerate';
import type { ViewerAsset } from '@features/assets';
import { CAP_ASSET_SELECTION, useCapability, type AssetSelection } from '@features/contextHub';

export interface QuickGeneratePanelContext {
  /** Current asset being viewed */
  currentAsset?: ViewerAsset | null;
  /** Current scene ID */
  currentSceneId?: string | null;
  /** Any other context data */
  [key: string]: unknown;
}

export interface QuickGeneratePanelProps extends IDockviewPanelProps {
  /** Workspace context */
  context?: QuickGeneratePanelContext;
  /** Panel-specific params from dockview */
  params?: Record<string, any>;
}

export function QuickGeneratePanel({ context, params }: QuickGeneratePanelProps) {
  const { value: selection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);

  const asset = useMemo(() => {
    // Try to get asset from context or params
    return context?.currentAsset || params?.asset || selection?.asset || null;
  }, [context?.currentAsset, params?.asset, selection?.asset]);

  const content = useMemo(() => {
    // Asset context - Generate from asset
    if (asset) {
      return (
        <div className="h-full overflow-y-auto p-2">
          <ViewerQuickGenerate asset={asset} alwaysExpanded />
        </div>
      );
    }

    // Scene context - Generate for scene
    if (context?.currentSceneId) {
      return (
        <div className="h-full flex items-center justify-center p-4 text-center">
          <div className="max-w-sm">
            <div className="text-neutral-500 dark:text-neutral-400 text-sm mb-2">
              Scene Generation
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Scene-based generation coming soon. This will allow generating content based on the current scene context.
            </p>
          </div>
        </div>
      );
    }

    // Generic context - No specific context
    return (
      <div className="h-full flex items-center justify-center p-4 text-center">
        <div className="max-w-sm">
          <div className="text-neutral-500 dark:text-neutral-400 text-sm mb-2">
            No Context Available
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Quick Generate requires an asset or scene context. Select an asset or open a scene to use this panel.
          </p>
        </div>
      </div>
    );
  }, [asset, context?.currentSceneId]);

  return content;
}
