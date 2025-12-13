/**
 * Comic Panel Widget
 *
 * Displays one or more comic panel frames as simple image sequences
 * with optional captions. Designed to work with the comic panel
 * system for presenting story beats visually.
 */

import React from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import type { DataBinding } from '@lib/editing-core';
import { resolveDataBinding } from '@lib/editing-core';
import type { SceneMetaComicPanel } from '@/modules/scene-builder';

export type ComicPanelLayout = 'single' | 'strip' | 'grid2';

export interface ComicPanelWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

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
}

/**
 * Creates a comic panel widget from configuration
 */
export function createComicPanelWidget(config: ComicPanelWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    panelIdsBinding,
    assetIdsBinding,
    panelsBinding,
    layout = 'single',
    showCaption = true,
    className = '',
    priority,
    onClick,
  } = config;

  return {
    id,
    type: 'comic-panel',
    position,
    visibility,
    priority,
    interactive: Boolean(onClick),
    onClick: onClick ? (data) => {
      // Call onClick with first panel id if available
      const resolvedPanels = resolveDataBinding(panelsBinding, data);
      if (resolvedPanels && resolvedPanels.length > 0) {
        onClick(resolvedPanels[0].id, data);
      }
    } : undefined,
    render: (data, context) => {
      // Resolve bindings
      let resolvedPanels: SceneMetaComicPanel[] | undefined = resolveDataBinding(panelsBinding, data);

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

      // If still no panels, show placeholder
      if (!resolvedPanels || resolvedPanels.length === 0) {
        return (
          <div className={`comic-panel-widget comic-panel-empty ${className}`}>
            <div className="text-white/50 text-sm text-center p-4">
              No comic panels to display
            </div>
          </div>
        );
      }

      // Layout-specific rendering
      const layoutClasses = {
        single: 'flex flex-col items-center justify-center',
        strip: 'flex flex-row gap-4 overflow-x-auto',
        grid2: 'grid grid-cols-2 gap-4',
      };

      return (
        <div
          className={`comic-panel-widget ${layoutClasses[layout]} ${className}`}
          style={{ maxWidth: layout === 'single' ? '600px' : '100%' }}
        >
          {resolvedPanels.map((panel, index) => (
            <div
              key={panel.id || index}
              className="comic-panel-frame flex flex-col"
              onClick={() => onClick?.(panel.id, data)}
              style={{ cursor: onClick ? 'pointer' : 'default' }}
            >
              <div className="comic-panel-image relative bg-black/20 rounded-lg overflow-hidden">
                <img
                  src={`/api/assets/${panel.assetId}`}
                  alt={panel.caption || `Comic panel ${index + 1}`}
                  className="w-full h-auto object-contain"
                  style={{
                    maxHeight: layout === 'single' ? '70vh' : '40vh',
                  }}
                />
              </div>

              {showCaption && panel.caption && (
                <div className="comic-panel-caption mt-2 text-sm text-white/80 text-center px-2">
                  {panel.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    },
  };
}
