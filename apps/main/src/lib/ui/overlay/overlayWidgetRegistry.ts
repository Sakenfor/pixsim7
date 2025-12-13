/**
 * Overlay Widget Registry
 *
 * Registers all overlay widget types with the unified widget registry,
 * providing factories that can reconstruct fully functional OverlayWidget
 * instances from UnifiedWidgetConfig.
 */

import {
  registerWidget,
  type WidgetFactory,
  type WidgetRuntimeOptions,
} from '@/lib/editing-core/registry/widgetRegistry';
import type { UnifiedWidgetConfig } from '@/lib/editing-core';
import type { OverlayWidget } from './types';
import { fromUnifiedPosition, fromUnifiedVisibility, fromUnifiedStyle } from './overlayConfig';
import { createBadgeWidget, type BadgeWidgetConfig } from './widgets/BadgeWidget';
import { createPanelWidget, type PanelWidgetConfig } from './widgets/PanelWidget';
import { createUploadWidget, type UploadWidgetConfig } from './widgets/UploadWidget';
import { createButtonWidget, type ButtonWidgetConfig } from './widgets/ButtonWidget';
import { createMenuWidget, type MenuWidgetConfig } from './widgets/MenuWidget';
import { createTooltipWidget, type TooltipWidgetConfig } from './widgets/TooltipWidget';
import { createVideoScrubWidget, type VideoScrubWidgetConfig } from './widgets/VideoScrubWidget';
import { createProgressWidget, type ProgressWidgetConfig } from './widgets/ProgressWidget';
import { createComicPanelWidget, type ComicPanelWidgetConfig } from './widgets/ComicPanelWidget';
import { createBindingFromValue, type DataBinding } from '@/lib/editing-core';

/**
 * Helper to extract DataBinding from unified config bindings array
 */
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
    return {
      kind: 'path',
      path: binding.path,
    } as DataBinding<T>;
  }

  return undefined;
}

/**
 * Badge widget factory
 */
const badgeFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
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
};

/**
 * Panel widget factory
 */
const panelFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
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
};

/**
 * Upload widget factory
 */
const uploadFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
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
};

/**
 * Button widget factory
 */
const buttonFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
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
};

/**
 * Menu widget factory
 */
const menuFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
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
};

/**
 * Tooltip widget factory
 */
const tooltipFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
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
};

/**
 * Video scrub widget factory
 */
const videoScrubFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
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
    onScrub: runtimeOptions?.onScrub,
  };

  return createVideoScrubWidget(videoScrubConfig);
};

/**
 * Progress widget factory
 */
const progressFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
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
};

/**
 * Comic panel widget factory
 */
const comicPanelFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
  const comicPanelConfig: ComicPanelWidgetConfig = {
    id: config.id,
    position: fromUnifiedPosition(config.position),
    visibility: fromUnifiedVisibility(config.visibility),
    panelIdsBinding: extractBinding(config.bindings, 'panelIds'),
    assetIdsBinding: extractBinding(config.bindings, 'assetIds'),
    panelsBinding: extractBinding(config.bindings, 'panels'),
    layout: (config.props?.layout as any) || 'single',
    showCaption: config.props?.showCaption !== false,
    className: config.style?.className,
    priority: config.position.order,
    onClick: runtimeOptions?.onClick,
  };

  return createComicPanelWidget(comicPanelConfig);
};

/**
 * Register all overlay widget types
 */
export function registerOverlayWidgets(): void {
  registerWidget({
    type: 'badge',
    displayName: 'Badge',
    icon: 'tag',
    factory: badgeFactory,
    defaultConfig: {
      type: 'badge',
      componentType: 'overlay',
      position: { mode: 'anchor', anchor: 'top-left', offset: { x: 8, y: 8 } },
      visibility: { simple: 'always' },
      props: {
        variant: 'icon',
        color: 'gray',
        shape: 'rounded',
      },
      version: 1,
    },
  });

  registerWidget({
    type: 'panel',
    displayName: 'Panel',
    icon: 'layout',
    factory: panelFactory,
    defaultConfig: {
      type: 'panel',
      componentType: 'overlay',
      position: { mode: 'anchor', anchor: 'center' },
      visibility: { simple: 'hover' },
      props: {
        variant: 'default',
        backdrop: false,
      },
      version: 1,
    },
  });

  registerWidget({
    type: 'upload',
    displayName: 'Upload Button',
    icon: 'upload',
    factory: uploadFactory,
    defaultConfig: {
      type: 'upload',
      componentType: 'overlay',
      position: { mode: 'anchor', anchor: 'bottom-center', offset: { x: 0, y: -8 } },
      visibility: { simple: 'always' },
      props: {
        variant: 'secondary',
        size: 'sm',
        showProgress: true,
      },
      bindings: [
        { kind: 'static', target: 'state', staticValue: 'idle' },
      ],
      version: 1,
    },
  });

  registerWidget({
    type: 'button',
    displayName: 'Button',
    icon: 'square',
    factory: buttonFactory,
    defaultConfig: {
      type: 'button',
      componentType: 'overlay',
      position: { mode: 'anchor', anchor: 'bottom-right', offset: { x: -8, y: -8 } },
      visibility: { simple: 'hover' },
      props: {
        variant: 'secondary',
        size: 'sm',
      },
      version: 1,
    },
  });

  registerWidget({
    type: 'menu',
    displayName: 'Menu',
    icon: 'moreVertical',
    factory: menuFactory,
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
  });

  registerWidget({
    type: 'tooltip',
    displayName: 'Tooltip',
    icon: 'info',
    factory: tooltipFactory,
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
  });

  registerWidget({
    type: 'video-scrub',
    displayName: 'Video Scrubber',
    icon: 'video',
    factory: videoScrubFactory,
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
      bindings: [
        { kind: 'static', target: 'videoUrl', staticValue: '' },
      ],
      version: 1,
    },
  });

  registerWidget({
    type: 'progress',
    displayName: 'Progress Bar',
    icon: 'barChart',
    factory: progressFactory,
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
      bindings: [
        { kind: 'static', target: 'value', staticValue: 0 },
      ],
      version: 1,
    },
  });

  registerWidget({
    type: 'comic-panel',
    displayName: 'Comic Panel',
    icon: 'image',
    factory: comicPanelFactory,
    defaultConfig: {
      type: 'comic-panel',
      componentType: 'overlay',
      position: { mode: 'anchor', anchor: 'center' },
      visibility: { simple: 'always' },
      props: {
        layout: 'single',
        showCaption: true,
      },
      bindings: [],
      version: 1,
    },
  });
}
