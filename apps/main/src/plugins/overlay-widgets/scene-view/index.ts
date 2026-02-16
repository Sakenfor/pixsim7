/**
 * Scene View Overlay Widget Plugin
 *
 * Scene view host for plugins.
 * Registered via the overlay-widget plugin family.
 */

import { createSceneViewHost, type SceneViewHostConfig } from '@lib/ui/overlay';
import { fromUnifiedPosition, fromUnifiedVisibility } from '@lib/ui/overlay';
import { extractBinding, type WidgetDefinition } from '@lib/widgets';

// ============================================================================
// Settings Interface
// ============================================================================

export interface SceneViewWidgetSettings {
  sceneViewId?: string;
  layout: 'single' | 'grid' | 'stack';
  showCaption: boolean;
}

// ============================================================================
// Widget Definition
// ============================================================================

export const widget: WidgetDefinition<SceneViewWidgetSettings> = {
  id: 'scene-view',
  title: 'Scene View',
  description: 'Scene view host for plugins',
  icon: 'image',
  category: 'display',
  domain: 'overlay',
  tags: ['scene', 'view', 'comic', 'panels', 'overlay'],
  surfaces: ['overlay'],
  surfaceConfig: {
    overlay: { defaultAnchor: 'center' },
  },
  factory: (config, runtimeOptions) => {
    const sceneViewConfig: SceneViewHostConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      sceneViewId: config.props?.sceneViewId as string | undefined,
      panelIdsBinding: extractBinding(config.bindings, 'panelIds'),
      assetIdsBinding: extractBinding(config.bindings, 'assetIds'),
      panelsBinding: extractBinding(config.bindings, 'panels'),
      layout: (config.props?.layout as any) || 'single',
      showCaption: config.props?.showCaption !== false,
      className: config.style?.className,
      priority: config.position.order,
      onClick: runtimeOptions?.onClick,
      requestContextBinding: extractBinding(config.bindings, 'requestContext'),
    };
    return createSceneViewHost(sceneViewConfig);
  },
  defaultSettings: {
    sceneViewId: 'scene-view:comic-panels',
    layout: 'single',
    showCaption: true,
  },
  settingsSchema: {
    groups: [
      {
        id: 'appearance',
        title: 'Appearance',
        description: 'Customize scene view layout.',
        fields: [
          { key: 'layout', type: 'select', label: 'Layout', description: 'How scene panels are arranged.', options: [{ value: 'single', label: 'Single' }, { value: 'grid', label: 'Grid' }, { value: 'stack', label: 'Stack' }] },
          { key: 'showCaption', type: 'toggle', label: 'Show Captions', description: 'Display captions below scene panels.' },
        ],
      },
    ],
  },
  defaultConfig: {
    type: 'scene-view',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'center' },
    visibility: { simple: 'always' },
    bindings: [],
    version: 1,
  },
};
