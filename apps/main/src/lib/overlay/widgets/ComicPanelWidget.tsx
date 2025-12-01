/**
 * Comic Panel Widget
 *
 * Displays one or more comic panel frames as simple image sequences
 * with optional captions. Designed to work with the comic panel
 * system for presenting story beats visually.
 */

import React from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import type { DataBinding } from '@/lib/editing-core';
import { resolveDataBinding, createBindingFromValue } from '@/lib/editing-core';
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
   * Panel IDs to display from Scene.meta.comicPanels
   * Preferred: Use panelIdsBinding with DataBinding<string[]>
   * Legacy: string[] | ((data: any) => string[])
   */
  panelIds?: string[] | ((data: any) => string[]);
  panelIdsBinding?: DataBinding<string[]>;

  /**
   * Direct gallery asset IDs (fallback when not using scene panels)
   * Preferred: Use assetIdsBinding with DataBinding<string[]>
   * Legacy: string[] | ((data: any) => string[])
   */
  assetIds?: string[] | ((data: any) => string[]);
  assetIdsBinding?: DataBinding<string[]>;

  /**
   * Full panel data (for advanced usage)
   * Preferred: Use panelsBinding with DataBinding<SceneMetaComicPanel[]>
   */
  panels?: SceneMetaComicPanel[];
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
    panelIds,
    panelIdsBinding,
    assetIds,
    assetIdsBinding,
    panels,
    panelsBinding,
    layout = 'single',
    showCaption = true,
    className = '',
    priority,
    onClick,
  } = config;

  // Create bindings (prefer new DataBinding, fall back to legacy pattern)
  const finalPanelIdsBinding = panelIdsBinding || (panelIds !== undefined ? createBindingFromValue('panelIds', panelIds) : undefined);
  const finalAssetIdsBinding = assetIdsBinding || (assetIds !== undefined ? createBindingFromValue('assetIds', assetIds) : undefined);
  const finalPanelsBinding = panelsBinding || (panels !== undefined ? createBindingFromValue('panels', panels) : undefined);

  return {
    id,
    type: 'comic-panel',
    position,
    visibility,
    priority,
    interactive: Boolean(onClick),
    onClick: onClick ? (data) => {
      // Call onClick with first panel id if available
      const resolvedPanels = resolveDataBinding(finalPanelsBinding, data);
      if (resolvedPanels && resolvedPanels.length > 0) {
        onClick(resolvedPanels[0].id, data);
      }
    } : undefined,
    render: (data, context) => {
      // Resolve bindings
      let resolvedPanels: SceneMetaComicPanel[] | undefined = resolveDataBinding(finalPanelsBinding, data);

      // If no full panels provided, construct from panelIds or assetIds
      if (!resolvedPanels || resolvedPanels.length === 0) {
        const resolvedPanelIds = resolveDataBinding(finalPanelIdsBinding, data);
        const resolvedAssetIds = resolveDataBinding(finalAssetIdsBinding, data);

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
