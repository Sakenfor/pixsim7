/**
 * Overlay Widgets - Unified Registration
 *
 * Registers overlay widgets directly in the unified widget registry.
 * Replaces the legacy editing-core/registry/widgetRegistry registration.
 */

import { registerWidget } from '../widgetRegistry';
import type { WidgetDefinition } from '../types';
import type { UnifiedWidgetConfig } from '@lib/editing-core/unifiedConfig';
import type { OverlayWidget } from '@lib/ui/overlay/types';
import { fromUnifiedPosition, fromUnifiedVisibility } from '@lib/ui/overlay/overlayConfig';
import { createBindingFromValue, type DataBinding } from '@lib/editing-core';

// Widget creators
import { createBadgeWidget, type BadgeWidgetConfig } from '@lib/ui/overlay/widgets/BadgeWidget';
import { createPanelWidget, type PanelWidgetConfig } from '@lib/ui/overlay/widgets/PanelWidget';
import { createUploadWidget, type UploadWidgetConfig } from '@lib/ui/overlay/widgets/UploadWidget';
import { createButtonWidget, type ButtonWidgetConfig } from '@lib/ui/overlay/widgets/ButtonWidget';
import { createMenuWidget, type MenuWidgetConfig } from '@lib/ui/overlay/widgets/MenuWidget';
import { createTooltipWidget, type TooltipWidgetConfig } from '@lib/ui/overlay/widgets/TooltipWidget';
import { createVideoScrubWidget, type VideoScrubWidgetConfig } from '@lib/ui/overlay/widgets/VideoScrubWidget';
import { createProgressWidget, type ProgressWidgetConfig } from '@lib/ui/overlay/widgets/ProgressWidget';
import { createSceneViewHost, type SceneViewHostConfig } from '@lib/ui/overlay/widgets/SceneViewHost';

// ============================================================================
// Helper
// ============================================================================

function extractBinding<T>(
  bindings: UnifiedWidgetConfig['bindings'],
  target: string
): DataBinding<T> | undefined {
  if (!bindings) return undefined;
  const binding = bindings.find(b => b.target === target);
  if (!binding) return undefined;

  if (binding.kind === 'static') {
    return createBindingFromValue(target, binding.staticValue) as DataBinding<T>;
  } else if (binding.kind === 'path' && binding.path) {
    return { kind: 'path', path: binding.path, target } as DataBinding<T>;
  } else if (binding.kind === 'fn') {
    // Function bindings cannot be serialized/reconstructed from config.
    // They must be provided at runtime via widget factory options.
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[extractBinding] Function binding for "${target}" cannot be reconstructed from serialized config. ` +
        `Provide it via runtimeOptions instead.`
      );
    }
    return undefined;
  }
  return undefined;
}

// ============================================================================
// Widget Definitions
// ============================================================================

export const badgeWidget: WidgetDefinition = {
  id: 'badge',
  title: 'Badge',
  description: 'Status badge with icon or label',
  icon: 'tag',
  category: 'overlay',
  domain: 'overlay',
  tags: ['badge', 'status', 'icon', 'overlay'],
  surfaces: ['overlay', 'hud'],
  surfaceConfig: {
    overlay: {
      defaultAnchor: 'top-left',
      defaultOffset: { x: 8, y: 8 },
    },
  },
  factory: (config, runtimeOptions) => {
    const badgeConfig: BadgeWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      variant: (config.props?.variant as any) || 'icon',
      icon: config.props?.icon as string | undefined,
      labelBinding: extractBinding(config.bindings, 'label'),
      color: (config.props?.color as any) || 'gray',
      shape: (config.props?.shape as any) || 'rounded',
      pulse: config.props?.pulse as boolean | undefined,
      tooltip: config.props?.tooltip as string | undefined,
      onClick: runtimeOptions?.onClick,
      className: config.style?.className,
      priority: config.position.order,
    };
    return createBadgeWidget(badgeConfig);
  },
  defaultConfig: {
    type: 'badge',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'top-left', offset: { x: 8, y: 8 } },
    visibility: { simple: 'always' },
    props: { variant: 'icon', color: 'gray', shape: 'rounded' },
    version: 1,
  },
};

export const panelWidget: WidgetDefinition = {
  id: 'panel',
  title: 'Panel',
  description: 'Content panel overlay',
  icon: 'layout',
  category: 'display',
  domain: 'overlay',
  tags: ['panel', 'content', 'overlay'],
  surfaces: ['overlay', 'hud'],
  surfaceConfig: {
    overlay: { defaultAnchor: 'center' },
  },
  factory: (config, runtimeOptions) => {
    const panelConfig: PanelWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      titleBinding: extractBinding(config.bindings, 'title'),
      contentBinding: extractBinding(config.bindings, 'content'),
      backdrop: config.props?.backdrop as boolean | undefined,
      maxWidth: config.style?.maxWidth,
      maxHeight: config.style?.maxHeight,
      variant: (config.props?.variant as any) || 'default',
      className: config.style?.className,
      priority: config.position.order,
      onClick: runtimeOptions?.onClick,
    };
    return createPanelWidget(panelConfig);
  },
  defaultConfig: {
    type: 'panel',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'center' },
    visibility: { simple: 'hover' },
    props: { variant: 'default', backdrop: false },
    version: 1,
  },
};

export const uploadWidget: WidgetDefinition = {
  id: 'upload',
  title: 'Upload Button',
  description: 'Upload button with progress',
  icon: 'upload',
  category: 'actions',
  domain: 'overlay',
  tags: ['upload', 'button', 'action', 'overlay'],
  surfaces: ['overlay'],
  surfaceConfig: {
    overlay: {
      defaultAnchor: 'bottom-center',
      defaultOffset: { x: 0, y: -8 },
    },
  },
  factory: (config, runtimeOptions) => {
    const uploadConfig: UploadWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      stateBinding: extractBinding(config.bindings, 'state'),
      progressBinding: extractBinding(config.bindings, 'progress'),
      labels: config.props?.labels as any,
      icons: config.props?.icons as any,
      onUpload: runtimeOptions?.onUpload,
      onRetry: runtimeOptions?.onRetry,
      variant: (config.props?.variant as any) || 'secondary',
      size: (config.props?.size as any) || 'sm',
      showProgress: config.props?.showProgress !== false,
      successDuration: config.props?.successDuration as number | undefined,
      className: config.style?.className,
      priority: config.position.order,
    };
    return createUploadWidget(uploadConfig);
  },
  defaultConfig: {
    type: 'upload',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'bottom-center', offset: { x: 0, y: -8 } },
    visibility: { simple: 'always' },
    props: { variant: 'secondary', size: 'sm', showProgress: true },
    bindings: [{ kind: 'static', target: 'state', staticValue: 'idle' }],
    version: 1,
  },
};

export const buttonWidget: WidgetDefinition = {
  id: 'button',
  title: 'Button',
  description: 'Action button',
  icon: 'square',
  category: 'actions',
  domain: 'overlay',
  tags: ['button', 'action', 'overlay'],
  surfaces: ['overlay', 'hud'],
  surfaceConfig: {
    overlay: {
      defaultAnchor: 'bottom-right',
      defaultOffset: { x: -8, y: -8 },
    },
  },
  factory: (config, runtimeOptions) => {
    const buttonConfig: ButtonWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      labelBinding: extractBinding(config.bindings, 'label'),
      icon: config.props?.icon as string | undefined,
      variant: (config.props?.variant as any) || 'secondary',
      size: (config.props?.size as any) || 'sm',
      disabled: config.props?.disabled as boolean | undefined,
      onClick: runtimeOptions?.onClick,
      className: config.style?.className,
      priority: config.position.order,
    };
    return createButtonWidget(buttonConfig);
  },
  defaultConfig: {
    type: 'button',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'bottom-right', offset: { x: -8, y: -8 } },
    visibility: { simple: 'hover' },
    props: { variant: 'secondary', size: 'sm' },
    version: 1,
  },
};

export const menuWidget: WidgetDefinition = {
  id: 'menu',
  title: 'Menu',
  description: 'Dropdown menu',
  icon: 'moreVertical',
  category: 'actions',
  domain: 'overlay',
  tags: ['menu', 'dropdown', 'actions', 'overlay'],
  surfaces: ['overlay', 'hud'],
  surfaceConfig: {
    overlay: {
      defaultAnchor: 'top-right',
      defaultOffset: { x: -8, y: 8 },
    },
  },
  factory: (config, runtimeOptions) => {
    const menuConfig: MenuWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      items: config.props?.items as any || [],
      trigger: config.props?.trigger as any,
      triggerType: (config.props?.triggerType as any) || 'click',
      placement: (config.props?.placement as any) || 'bottom-right',
      closeOnClick: config.props?.closeOnClick !== false,
      className: config.style?.className,
      priority: config.position.order,
    };
    return createMenuWidget(menuConfig);
  },
  defaultConfig: {
    type: 'menu',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'top-right', offset: { x: -8, y: 8 } },
    visibility: { simple: 'always' },
    props: {
      items: [],
      trigger: { icon: 'moreVertical', variant: 'icon' },
      triggerType: 'click',
      placement: 'bottom-right',
      closeOnClick: true,
    },
    version: 1,
  },
};

export const tooltipWidget: WidgetDefinition = {
  id: 'tooltip',
  title: 'Tooltip',
  description: 'Information tooltip',
  icon: 'info',
  category: 'info',
  domain: 'overlay',
  tags: ['tooltip', 'info', 'help', 'overlay'],
  surfaces: ['overlay', 'hud'],
  surfaceConfig: {
    overlay: {
      defaultAnchor: 'top-left',
      defaultOffset: { x: 8, y: 8 },
    },
  },
  factory: (config, runtimeOptions) => {
    const tooltipConfig: TooltipWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      content: config.props?.content as any || {},
      trigger: config.props?.trigger as any,
      placement: (config.props?.placement as any) || 'auto',
      showArrow: config.props?.showArrow !== false,
      delay: config.props?.delay as number | undefined,
      maxWidth: config.props?.maxWidth as number | undefined,
      rich: config.props?.rich !== false,
      className: config.style?.className,
      priority: config.position.order,
    };
    return createTooltipWidget(tooltipConfig);
  },
  defaultConfig: {
    type: 'tooltip',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'top-left', offset: { x: 8, y: 8 } },
    visibility: { simple: 'always' },
    props: {
      content: { title: 'Tooltip', description: 'Hover for info' },
      trigger: { type: 'icon', icon: 'info' },
      placement: 'auto',
      showArrow: true,
      delay: 300,
      maxWidth: 280,
      rich: true,
    },
    version: 1,
  },
};

export const videoScrubWidget: WidgetDefinition = {
  id: 'video-scrub',
  title: 'Video Scrubber',
  description: 'Video scrub preview',
  icon: 'video',
  category: 'media',
  domain: 'overlay',
  tags: ['video', 'scrub', 'media', 'overlay'],
  surfaces: ['overlay'],
  surfaceConfig: {
    overlay: { defaultAnchor: 'center' },
  },
  factory: (config, runtimeOptions) => {
    const videoScrubConfig: VideoScrubWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      videoUrlBinding: extractBinding(config.bindings, 'videoUrl'),
      durationBinding: extractBinding(config.bindings, 'duration'),
      showTimeline: config.props?.showTimeline !== false,
      showTimestamp: config.props?.showTimestamp !== false,
      timelinePosition: (config.props?.timelinePosition as any) || 'bottom',
      throttle: config.props?.throttle as number | undefined,
      frameAccurate: config.props?.frameAccurate as boolean | undefined,
      muted: config.props?.muted !== false,
      className: config.style?.className,
      priority: config.position.order,
      onScrub: (runtimeOptions as any)?.onScrub,
    };
    return createVideoScrubWidget(videoScrubConfig);
  },
  defaultConfig: {
    type: 'video-scrub',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'center' },
    visibility: { simple: 'hover' },
    props: {
      showTimeline: true,
      showTimestamp: true,
      timelinePosition: 'bottom',
      throttle: 50,
      frameAccurate: false,
      muted: true,
    },
    bindings: [{ kind: 'static', target: 'videoUrl', staticValue: '' }],
    version: 1,
  },
};

export const progressWidget: WidgetDefinition = {
  id: 'progress',
  title: 'Progress Bar',
  description: 'Progress indicator',
  icon: 'barChart',
  category: 'status',
  domain: 'overlay',
  tags: ['progress', 'status', 'loading', 'overlay'],
  surfaces: ['overlay', 'hud'],
  surfaceConfig: {
    overlay: {
      defaultAnchor: 'bottom-center',
      defaultOffset: { x: 0, y: -8 },
    },
  },
  factory: (config, runtimeOptions) => {
    const progressConfig: ProgressWidgetConfig = {
      id: config.id,
      position: fromUnifiedPosition(config.position),
      visibility: fromUnifiedVisibility(config.visibility),
      valueBinding: extractBinding(config.bindings, 'value'),
      labelBinding: extractBinding(config.bindings, 'label'),
      max: config.props?.max as number | undefined,
      variant: (config.props?.variant as any) || 'bar',
      orientation: (config.props?.orientation as any) || 'horizontal',
      size: (config.props?.size as any) || 'md',
      color: (config.props?.color as any) || 'blue',
      showLabel: config.props?.showLabel as boolean | undefined,
      icon: config.props?.icon as string | undefined,
      animated: config.props?.animated as boolean | undefined,
      state: (config.props?.state as any) || 'normal',
      className: config.style?.className,
      priority: config.position.order,
    };
    return createProgressWidget(progressConfig);
  },
  defaultConfig: {
    type: 'progress',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'bottom-center', offset: { x: 0, y: -8 } },
    visibility: { simple: 'always' },
    props: {
      max: 100,
      variant: 'bar',
      orientation: 'horizontal',
      size: 'md',
      color: 'blue',
      showLabel: false,
      animated: false,
      state: 'normal',
    },
    bindings: [{ kind: 'static', target: 'value', staticValue: 0 }],
    version: 1,
  },
};

export const sceneViewWidget: WidgetDefinition = {
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
  defaultConfig: {
    type: 'scene-view',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'center' },
    visibility: { simple: 'always' },
    props: {
      layout: 'single',
      showCaption: true,
      sceneViewId: 'scene-view:comic-panels',
    },
    bindings: [],
    version: 1,
  },
};

// ============================================================================
// All Overlay Widgets
// ============================================================================

export const overlayWidgetDefinitions: WidgetDefinition[] = [
  badgeWidget,
  panelWidget,
  uploadWidget,
  buttonWidget,
  menuWidget,
  tooltipWidget,
  videoScrubWidget,
  progressWidget,
  sceneViewWidget,
];

/**
 * Register all overlay widgets in the unified registry.
 */
export function registerOverlayWidgets(): void {
  for (const widget of overlayWidgetDefinitions) {
    registerWidget(widget);
  }
  console.log(`[widgets] Registered ${overlayWidgetDefinitions.length} overlay widgets`);
}
