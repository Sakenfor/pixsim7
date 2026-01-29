/**
 * Overlay Widgets - Unified Registration
 *
 * Registers overlay widgets directly in the unified widget registry.
 * Replaces the legacy editing-core/registry/widgetRegistry registration.
 */

import type { UnifiedWidgetConfig } from '@lib/editing-core';
import { createBindingFromValue, type DataBinding } from '@lib/editing-core';
import { fromUnifiedPosition, fromUnifiedVisibility } from '@lib/ui/overlay';

// Widget creators
import { createBadgeWidget, type BadgeWidgetConfig } from '@lib/ui/overlay';
import { createPanelWidget, type PanelWidgetConfig } from '@lib/ui/overlay';
import { createUploadWidget, type UploadWidgetConfig } from '@lib/ui/overlay';
import { createButtonWidget, type ButtonWidgetConfig } from '@lib/ui/overlay';
import { createMenuWidget, type MenuWidgetConfig } from '@lib/ui/overlay';
import { createTooltipWidget, type TooltipWidgetConfig } from '@lib/ui/overlay';
import { createVideoScrubWidget, type VideoScrubWidgetConfig } from '@lib/ui/overlay';
import { createProgressWidget, type ProgressWidgetConfig } from '@lib/ui/overlay';
import { createSceneViewHost, type SceneViewHostConfig } from '@lib/ui/overlay';

import type { WidgetDefinition } from '../types';
import { registerWidget } from '../widgetRegistry';

// ============================================================================
// Settings Interfaces
// ============================================================================

/** Badge widget settings */
export interface BadgeWidgetSettings {
  variant: 'icon' | 'text' | 'pill';
  icon?: string;
  color: 'gray' | 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  shape: 'rounded' | 'circle' | 'square';
  pulse?: boolean;
  tooltip?: string;
}

/** Panel widget settings */
export interface PanelWidgetSettings {
  backdrop: boolean;
  variant: 'default' | 'glass' | 'solid';
}

/** Upload widget settings */
export interface UploadWidgetSettings {
  variant: 'primary' | 'secondary' | 'ghost';
  size: 'xs' | 'sm' | 'md';
  showProgress: boolean;
  successDuration?: number;
}

/** Button widget settings */
export interface ButtonWidgetSettings {
  icon?: string;
  variant: 'primary' | 'secondary' | 'ghost' | 'icon';
  size: 'xs' | 'sm' | 'md';
  disabled?: boolean;
}

/** Menu widget settings */
export interface MenuWidgetSettings {
  triggerType: 'click' | 'hover';
  placement: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  closeOnClick: boolean;
}

/** Tooltip widget settings */
export interface TooltipWidgetSettings {
  placement: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  showArrow: boolean;
  delay: number;
  maxWidth: number;
  rich: boolean;
}

/** Video scrub widget settings */
export interface VideoScrubWidgetSettings {
  showTimeline: boolean;
  showTimestamp: boolean;
  showExtractButton: boolean;
  timelinePosition: 'bottom' | 'top';
  throttle: number;
  frameAccurate: boolean;
  muted: boolean;
}

/** Progress widget settings */
export interface ProgressWidgetSettings {
  max: number;
  variant: 'bar' | 'ring' | 'dot';
  orientation: 'horizontal' | 'vertical';
  size: 'xs' | 'sm' | 'md' | 'lg';
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'gray';
  showLabel: boolean;
  icon?: string;
  animated: boolean;
  state: 'normal' | 'success' | 'error' | 'warning';
}

/** Scene view widget settings */
export interface SceneViewWidgetSettings {
  sceneViewId?: string;
  layout: 'single' | 'grid' | 'stack';
  showCaption: boolean;
}

const isDev = import.meta.env?.DEV;

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
    if (isDev) {
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

export const badgeWidget: WidgetDefinition<BadgeWidgetSettings> = {
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
  defaultSettings: {
    variant: 'icon',
    color: 'gray',
    shape: 'rounded',
  },
  defaultConfig: {
    type: 'badge',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'top-left', offset: { x: 8, y: 8 } },
    visibility: { simple: 'always' },
    version: 1,
  },
};

export const panelWidget: WidgetDefinition<PanelWidgetSettings> = {
  id: 'panel',
  title: 'Panel',
  description: 'Content panel overlay',
  icon: '🪟',
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
  defaultSettings: {
    backdrop: false,
    variant: 'default',
  },
  settingsSchema: {
    groups: [
      {
        id: 'appearance',
        title: 'Appearance',
        description: 'Control panel appearance.',
        fields: [
          { key: 'variant', type: 'select', label: 'Style', description: 'Visual style of panels.', options: [{ value: 'default', label: 'Default' }, { value: 'glass', label: 'Glass (Translucent)' }, { value: 'solid', label: 'Solid' }] },
          { key: 'backdrop', type: 'toggle', label: 'Show Backdrop', description: 'Dim the background when panel is visible.' },
        ],
      },
    ],
  },
  defaultConfig: {
    type: 'panel',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'center' },
    visibility: { simple: 'hover' },
    version: 1,
  },
};

export const uploadWidget: WidgetDefinition<UploadWidgetSettings> = {
  id: 'upload',
  title: 'Upload Button',
  description: 'Upload button with progress',
  icon: '📤',
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
  defaultSettings: {
    variant: 'secondary',
    size: 'sm',
    showProgress: true,
  },
  settingsSchema: {
    groups: [
      {
        id: 'appearance',
        title: 'Appearance',
        description: 'Customize the upload button appearance.',
        fields: [
          { key: 'variant', type: 'select', label: 'Button Style', description: 'Visual style of the upload button.', options: [{ value: 'primary', label: 'Primary (Blue)' }, { value: 'secondary', label: 'Secondary (Gray)' }, { value: 'ghost', label: 'Ghost (Transparent)' }] },
          { key: 'size', type: 'select', label: 'Button Size', description: 'Size of the upload button.', options: [{ value: 'xs', label: 'Extra Small' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }] },
        ],
      },
      {
        id: 'behavior',
        title: 'Behavior',
        description: 'Control upload button behavior.',
        fields: [
          { key: 'showProgress', type: 'toggle', label: 'Show Progress', description: 'Display upload progress indicator.' },
          { key: 'successDuration', type: 'number', label: 'Success Display (ms)', description: 'How long to show success state after upload completes.', min: 500, max: 5000, step: 500 },
        ],
      },
    ],
  },
  defaultConfig: {
    type: 'upload',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'bottom-center', offset: { x: 0, y: -8 } },
    visibility: { simple: 'always' },
    bindings: [{ kind: 'static', target: 'state', staticValue: 'idle' }],
    version: 1,
  },
};

export const buttonWidget: WidgetDefinition<ButtonWidgetSettings> = {
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
  defaultSettings: {
    variant: 'secondary',
    size: 'sm',
  },
  defaultConfig: {
    type: 'button',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'bottom-right', offset: { x: -8, y: -8 } },
    visibility: { simple: 'hover' },
    version: 1,
  },
};

export const menuWidget: WidgetDefinition<MenuWidgetSettings> = {
  id: 'menu',
  title: 'Menu',
  description: 'Dropdown menu',
  icon: '📋',
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
  factory: (config) => {
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
  defaultSettings: {
    triggerType: 'click',
    placement: 'bottom-right',
    closeOnClick: true,
  },
  settingsSchema: {
    groups: [
      {
        id: 'behavior',
        title: 'Behavior',
        description: 'Control how menus behave.',
        fields: [
          { key: 'triggerType', type: 'select', label: 'Trigger Type', description: 'How to open the menu.', options: [{ value: 'click', label: 'Click' }, { value: 'hover', label: 'Hover' }] },
          { key: 'placement', type: 'select', label: 'Placement', description: 'Where the menu appears.', options: [{ value: 'bottom-right', label: 'Bottom Right' }, { value: 'bottom-left', label: 'Bottom Left' }, { value: 'top-right', label: 'Top Right' }, { value: 'top-left', label: 'Top Left' }] },
          { key: 'closeOnClick', type: 'toggle', label: 'Close on Click', description: 'Close menu when an item is clicked.' },
        ],
      },
    ],
  },
  defaultConfig: {
    type: 'menu',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'top-right', offset: { x: -8, y: 8 } },
    visibility: { simple: 'always' },
    // items and trigger are data, not settings - keep in defaultConfig.props
    props: {
      items: [],
      trigger: { icon: 'moreVertical', variant: 'icon' },
    },
    version: 1,
  },
};

export const tooltipWidget: WidgetDefinition<TooltipWidgetSettings> = {
  id: 'tooltip',
  title: 'Tooltip',
  description: 'Information tooltip',
  icon: '💬',
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
  factory: (config) => {
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
  defaultSettings: {
    placement: 'auto',
    showArrow: true,
    delay: 300,
    maxWidth: 280,
    rich: true,
  },
  settingsSchema: {
    groups: [
      {
        id: 'appearance',
        title: 'Appearance',
        description: 'Customize tooltip appearance.',
        fields: [
          { key: 'placement', type: 'select', label: 'Default Placement', description: 'Where tooltips appear relative to their trigger.', options: [{ value: 'auto', label: 'Auto' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
          { key: 'showArrow', type: 'toggle', label: 'Show Arrow', description: 'Display arrow pointing to trigger element.' },
          { key: 'maxWidth', type: 'number', label: 'Max Width (px)', description: 'Maximum width of tooltip content.', min: 150, max: 500, step: 10 },
          { key: 'rich', type: 'toggle', label: 'Rich Content', description: 'Enable rich formatting in tooltips.' },
        ],
      },
      {
        id: 'timing',
        title: 'Timing',
        description: 'Control tooltip timing.',
        fields: [
          { key: 'delay', type: 'number', label: 'Show Delay (ms)', description: 'Delay before tooltip appears.', min: 0, max: 1000, step: 50 },
        ],
      },
    ],
  },
  defaultConfig: {
    type: 'tooltip',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'top-left', offset: { x: 8, y: 8 } },
    visibility: { simple: 'always' },
    // content and trigger are data, not settings - keep in defaultConfig.props
    props: {
      content: { title: 'Tooltip', description: 'Hover for info' },
      trigger: { type: 'icon', icon: 'info' },
    },
    version: 1,
  },
};

export const videoScrubWidget: WidgetDefinition<VideoScrubWidgetSettings> = {
  id: 'video-scrub',
  title: 'Video Scrubber',
  description: 'Video scrub preview',
  icon: '🎬',
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
      showExtractButton: config.props?.showExtractButton !== false,
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
  defaultSettings: {
    showTimeline: true,
    showTimestamp: true,
    showExtractButton: true,
    timelinePosition: 'bottom',
    throttle: 50,
    frameAccurate: false,
    muted: true,
  },
  settingsSchema: {
    groups: [
      {
        id: 'display',
        title: 'Display',
        description: 'Control what elements are shown when scrubbing videos.',
        fields: [
          { key: 'showTimeline', type: 'toggle', label: 'Show Timeline', description: 'Display the scrub timeline bar at the bottom of the video.' },
          { key: 'showTimestamp', type: 'toggle', label: 'Show Timestamp', description: 'Display the current timestamp near the cursor.' },
          { key: 'showExtractButton', type: 'toggle', label: 'Show Extract Button', description: 'Show the scrub dot that can be clicked to extract frames.' },
          { key: 'timelinePosition', type: 'select', label: 'Timeline Position', description: 'Where to show the timeline bar.', options: [{ value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' }] },
        ],
      },
      {
        id: 'behavior',
        title: 'Behavior',
        description: 'Control how the video scrubber behaves.',
        fields: [
          { key: 'muted', type: 'toggle', label: 'Mute During Scrub', description: 'Keep video muted while scrubbing.' },
          { key: 'frameAccurate', type: 'toggle', label: 'Frame Accurate Seeking', description: 'Enable precise frame seeking (slower but more accurate).' },
          { key: 'throttle', type: 'number', label: 'Update Throttle (ms)', description: 'Minimum time between scrub updates. Lower = smoother but more CPU.', min: 16, max: 200, step: 10 },
        ],
      },
    ],
  },
  defaultConfig: {
    type: 'video-scrub',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'center' },
    visibility: { simple: 'hover' },
    bindings: [{ kind: 'static', target: 'videoUrl', staticValue: '' }],
    version: 1,
  },
};

export const progressWidget: WidgetDefinition<ProgressWidgetSettings> = {
  id: 'progress',
  title: 'Progress Bar',
  description: 'Progress indicator',
  icon: '📊',
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
  factory: (config) => {
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
  defaultSettings: {
    max: 100,
    variant: 'bar',
    orientation: 'horizontal',
    size: 'md',
    color: 'blue',
    showLabel: false,
    animated: false,
    state: 'normal',
  },
  settingsSchema: {
    groups: [
      {
        id: 'appearance',
        title: 'Appearance',
        description: 'Customize progress indicator appearance.',
        fields: [
          { key: 'variant', type: 'select', label: 'Style', description: 'Visual style of progress indicators.', options: [{ value: 'bar', label: 'Bar' }, { value: 'ring', label: 'Ring' }, { value: 'dot', label: 'Dot' }] },
          { key: 'size', type: 'select', label: 'Size', description: 'Size of progress indicators.', options: [{ value: 'xs', label: 'Extra Small' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
          { key: 'color', type: 'select', label: 'Color', description: 'Default color for progress indicators.', options: [{ value: 'blue', label: 'Blue' }, { value: 'green', label: 'Green' }, { value: 'red', label: 'Red' }, { value: 'yellow', label: 'Yellow' }, { value: 'purple', label: 'Purple' }, { value: 'gray', label: 'Gray' }] },
        ],
      },
      {
        id: 'behavior',
        title: 'Behavior',
        description: 'Control progress indicator behavior.',
        fields: [
          { key: 'showLabel', type: 'toggle', label: 'Show Label', description: 'Display progress percentage label.' },
          { key: 'animated', type: 'toggle', label: 'Animated', description: 'Enable animation effects.' },
        ],
      },
    ],
  },
  defaultConfig: {
    type: 'progress',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'bottom-center', offset: { x: 0, y: -8 } },
    visibility: { simple: 'always' },
    bindings: [{ kind: 'static', target: 'value', staticValue: 0 }],
    version: 1,
  },
};

export const sceneViewWidget: WidgetDefinition<SceneViewWidgetSettings> = {
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
  defaultConfig: {
    type: 'scene-view',
    componentType: 'overlay',
    position: { mode: 'anchor', anchor: 'center' },
    visibility: { simple: 'always' },
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
