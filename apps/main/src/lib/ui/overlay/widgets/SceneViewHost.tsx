/**
 * Scene View Host Widget
 *
 * A generic overlay widget that delegates rendering to a registered scene view plugin.
 * The host handles data binding resolution and context inference, while the plugin
 * provides the actual UI implementation.
 *
 * This enables a plugin architecture where scene presentation modes (comic panels,
 * visual novel views, etc.) can be developed and distributed independently.
 */

import React from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import type { DataBinding } from '@lib/editing-core';
import { resolveDataBinding } from '@lib/editing-core';
import type {
  SceneMetaComicPanel,
  ComicPanelRequestContext,
  ComicPanelLayout,
  ComicPanelSession,
  ComicPanelSceneMeta,
} from '@features/scene';
import { getActiveComicPanels } from '@features/scene';
import { Ref } from '@pixsim7/shared.types';
import { sceneViewRegistry, type SceneViewRenderProps } from '@lib/plugins/sceneViewPlugin';
import { inspectSceneContent } from '@lib/plugins/sceneContentInspector';

export interface SceneViewHostConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /**
   * Scene view plugin ID to use. If not specified, uses the default
   * registered scene view from the registry.
   */
  sceneViewId?: string;

  /**
   * Panel IDs binding to display from Scene.meta.comicPanels.
   * Use createBindingFromValue() for static values or functions.
   */
  panelIdsBinding?: DataBinding<string[]>;

  /**
   * Direct gallery asset IDs binding (fallback when not using scene panels).
   * Use createBindingFromValue() for static values or functions.
   */
  assetIdsBinding?: DataBinding<string[]>;

  /**
   * Full panel data binding (for advanced usage).
   * Use createBindingFromValue() for static values or functions.
   */
  panelsBinding?: DataBinding<SceneMetaComicPanel[]>;

  /** Layout mode for displaying panels */
  layout?: ComicPanelLayout;

  /** Whether to show captions under panels */
  showCaption?: boolean;

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;

  /** Click handler (for interactive panels) */
  onClick?: (panelId: string, data: any) => void;

  /**
   * Optional data binding providing request context used when dynamically
   * resolving or generating panel assets.
   */
  requestContextBinding?: DataBinding<ComicPanelRequestContext>;
}

/**
 * Creates a scene view host widget from configuration.
 *
 * The host resolves data bindings and delegates rendering to the registered
 * scene view plugin. If no plugin is found, it renders a minimal fallback.
 */
export function createSceneViewHost(config: SceneViewHostConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    sceneViewId,
    panelIdsBinding,
    assetIdsBinding,
    panelsBinding,
    layout = 'single',
    showCaption = true,
    className = '',
    priority,
    onClick,
    requestContextBinding,
  } = config;

  return {
    id,
    type: 'scene-view',
    position,
    visibility,
    priority,
    interactive: Boolean(onClick),
    onClick: onClick
      ? (data) => {
          const resolvedPanels = resolveDataBinding(panelsBinding, data);
          if (resolvedPanels && resolvedPanels.length > 0) {
            onClick(resolvedPanels[0].id, data);
          }
        }
      : undefined,
    render: (data, context) => {
      // Resolve panels from bindings
      let resolvedPanels: SceneMetaComicPanel[] | undefined = resolveDataBinding(
        panelsBinding,
        data
      );

      // If no full panels provided, construct from panelIds or assetIds
      if (!resolvedPanels || resolvedPanels.length === 0) {
        const resolvedPanelIds = resolveDataBinding(panelIdsBinding, data);
        const resolvedAssetIds = resolveDataBinding(assetIdsBinding, data);

        if (resolvedPanelIds && resolvedPanelIds.length > 0) {
          // Try to get panels from scene meta if available
          const scenePanels = data?.scene?.comicPanels || data?.comicPanels;
          if (scenePanels) {
            resolvedPanels = scenePanels.filter((p: SceneMetaComicPanel) =>
              resolvedPanelIds.includes(p.id)
            );
          }
        } else if (resolvedAssetIds && resolvedAssetIds.length > 0) {
          // Fallback: create simple panels from asset IDs
          resolvedPanels = resolvedAssetIds.map((assetId, index) => ({
            id: `panel-${index}`,
            assetId,
          }));
        }
      }

      // Final fallback: get active panels from scene if available
      if ((!resolvedPanels || resolvedPanels.length === 0) && data?.scene?.comicPanels) {
        resolvedPanels = getActiveComicPanels(
          (data.session ?? {}) as ComicPanelSession,
          data.scene as ComicPanelSceneMeta
        );
      }

      const resolvedRequestContext: ComicPanelRequestContext | undefined =
        resolveDataBinding(requestContextBinding, data) ?? inferRequestContextFromData(data);

      // Inspect scene content and resolve the best plugin
      const offer = inspectSceneContent(data?.scene, data?.session);
      const pluginId = sceneViewId ?? sceneViewRegistry.resolve(offer) ?? sceneViewRegistry.getDefaultId();
      const plugin = pluginId ? sceneViewRegistry.getPlugin(pluginId) : null;

      const pluginProps: SceneViewRenderProps = {
        contentType: offer.contentTypes[0],
        panels: resolvedPanels || [],
        session: data?.session,
        sceneMeta: data?.scene,
        layout,
        showCaption,
        className,
        requestContext: resolvedRequestContext,
        onPanelClick: (panel: SceneMetaComicPanel) => onClick?.(panel.id, data),
      };

      // Delegate to plugin if available
      if (plugin) {
        return plugin.render(pluginProps);
      }

      // Fallback: render minimal placeholder when no plugin is registered
      return <SceneViewFallback panels={resolvedPanels || []} className={className} />;
    },
  };
}

/**
 * Infer request context from widget data for dynamic asset resolution.
 */
function inferRequestContextFromData(data: any): ComicPanelRequestContext | undefined {
  if (!data) {
    return undefined;
  }

  const activeNpcId = data.session?.activeNpcId;

  return {
    sceneId: data.scene?.id ?? data.sceneId,
    choiceId: data.choiceId ?? data.interaction?.choiceId,
    locationId: data.session?.locationId ?? data.locationId,
    characters:
      typeof activeNpcId === 'number'
        ? [Ref.npc(activeNpcId)]
        : Array.isArray(activeNpcId)
          ? activeNpcId
          : undefined,
  };
}

/**
 * Minimal fallback component when no scene view plugin is registered.
 */
function SceneViewFallback({
  panels,
  className,
}: {
  panels: SceneMetaComicPanel[];
  className?: string;
}) {
  if (!panels || panels.length === 0) {
    return (
      <div className={`scene-view-fallback scene-view-empty ${className ?? ''}`}>
        <div className="text-white/50 text-sm text-center p-4">No scene view available</div>
      </div>
    );
  }

  return (
    <div className={`scene-view-fallback ${className ?? ''}`}>
      <div className="text-white/50 text-sm text-center p-4">
        {panels.length} panel(s) ready - no scene view plugin registered
      </div>
    </div>
  );
}
