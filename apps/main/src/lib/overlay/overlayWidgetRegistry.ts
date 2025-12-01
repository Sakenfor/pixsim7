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
}
