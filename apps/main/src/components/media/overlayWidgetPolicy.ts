/* eslint-disable react-refresh/only-export-components */
import { isOverlayPosition, type OverlayPolicyStep, type OverlayWidget } from '@lib/ui/overlay';
import {
  CONFIGURABLE_WIDGET_IDS,
  type ConfigurableWidgetId,
  type OverlayContextId,
  type WidgetVisibilityMode,
} from '@lib/widgets/overlayWidgetSettingsStore';

interface CompactWidgetOverride {
  offset?: { x: number; y: number };
  className?: string;
}

const COMPACT_WIDGET_OVERRIDES: Partial<Record<ConfigurableWidgetId, CompactWidgetOverride>> = {
  'favorite-toggle': { offset: { x: -4, y: 4 } },
  'generation-button-group': { offset: { x: 0, y: -6 } },
};

function isConfigurableWidgetId(widgetId: string): widgetId is ConfigurableWidgetId {
  return (CONFIGURABLE_WIDGET_IDS as readonly string[]).includes(widgetId);
}

function toOverlayTrigger(mode: WidgetVisibilityMode): 'always' | 'hover-container' {
  return mode === 'always' ? 'always' : 'hover-container';
}

export interface ApplyConfigurableOverlayPolicyOptions {
  context: OverlayContextId;
  getVisibility: (context: OverlayContextId, widgetId: ConfigurableWidgetId) => WidgetVisibilityMode;
  useCompactPositions?: boolean;
  skipInfoPopoverInCompact?: boolean;
  suppressGenerationButtonGroup?: boolean;
}

export const CONFIGURABLE_WIDGET_POLICY_ID = 'configurable-widgets' as const;

export interface ConfigurableWidgetPolicyParams {
  useCompactPositions?: boolean;
  skipInfoPopoverInCompact?: boolean;
  suppressGenerationButtonGroup?: boolean;
}

export interface MediaOverlayPolicyDefinition {
  id: string;
  name: string;
  description?: string;
}

export const DEFAULT_MEDIA_OVERLAY_POLICY_CHAIN: OverlayPolicyStep[] = [
  { policyId: CONFIGURABLE_WIDGET_POLICY_ID, enabled: true },
];

function resolveConfigurablePolicyParams(
  defaults: ConfigurableWidgetPolicyParams | undefined,
  rawParams: Record<string, unknown> | undefined,
): ConfigurableWidgetPolicyParams {
  if (!rawParams) {
    return { ...(defaults ?? {}) };
  }
  const next: ConfigurableWidgetPolicyParams = { ...(defaults ?? {}) };
  if (typeof rawParams.useCompactPositions === 'boolean') {
    next.useCompactPositions = rawParams.useCompactPositions;
  }
  if (typeof rawParams.skipInfoPopoverInCompact === 'boolean') {
    next.skipInfoPopoverInCompact = rawParams.skipInfoPopoverInCompact;
  }
  if (typeof rawParams.suppressGenerationButtonGroup === 'boolean') {
    next.suppressGenerationButtonGroup = rawParams.suppressGenerationButtonGroup;
  }
  return next;
}

export interface ApplyMediaOverlayPolicyChainOptions {
  context: OverlayContextId;
  getVisibility: (context: OverlayContextId, widgetId: ConfigurableWidgetId) => WidgetVisibilityMode;
  chain?: OverlayPolicyStep[];
  configurableDefaults?: ConfigurableWidgetPolicyParams;
}

interface MediaOverlayPolicyRuntimeContext {
  context: OverlayContextId;
  getVisibility: (context: OverlayContextId, widgetId: ConfigurableWidgetId) => WidgetVisibilityMode;
  configurableDefaults?: ConfigurableWidgetPolicyParams;
}

type MediaOverlayPolicyApply = <TData>(
  widgets: OverlayWidget<TData>[],
  step: OverlayPolicyStep,
  runtime: MediaOverlayPolicyRuntimeContext,
) => OverlayWidget<TData>[];

interface MediaOverlayPolicyRegistration {
  definition: MediaOverlayPolicyDefinition;
  apply: MediaOverlayPolicyApply;
}

const mediaOverlayPolicyRegistry = new Map<string, MediaOverlayPolicyRegistration>();

export function registerMediaOverlayPolicy(policy: MediaOverlayPolicyRegistration): void {
  mediaOverlayPolicyRegistry.set(policy.definition.id, policy);
}

export function getMediaOverlayPolicyDefinitions(): MediaOverlayPolicyDefinition[] {
  return Array.from(mediaOverlayPolicyRegistry.values()).map((p) => p.definition);
}

/**
 * Apply shared policy for configurable overlay widgets:
 * - per-context visibility (always/hover/hidden)
 * - compact-position overrides for smaller cards
 * - optional conflict suppression (e.g. custom hover actions vs generation bar)
 */
export function applyConfigurableOverlayPolicy<TData>(
  widgets: OverlayWidget<TData>[],
  {
    context,
    getVisibility,
    useCompactPositions = false,
    skipInfoPopoverInCompact = false,
    suppressGenerationButtonGroup = false,
  }: ApplyConfigurableOverlayPolicyOptions,
): OverlayWidget<TData>[] {
  const isCompact = context === 'compact' || useCompactPositions;

  return widgets
    .filter((widget) => {
      if (suppressGenerationButtonGroup && widget.id === 'generation-button-group') {
        return false;
      }
      if (skipInfoPopoverInCompact && isCompact && widget.id === 'info-popover') {
        return false;
      }
      if (!isConfigurableWidgetId(widget.id)) {
        return true;
      }
      return getVisibility(context, widget.id) !== 'hidden';
    })
    .map((widget) => {
      if (!isConfigurableWidgetId(widget.id)) {
        return widget;
      }

      const configuredMode = getVisibility(context, widget.id);
      const mode =
        isCompact && widget.id === 'favorite-toggle' && configuredMode === 'always'
          ? 'hover'
          : configuredMode;
      const remapped: OverlayWidget<TData> = {
        ...widget,
        visibility: { ...widget.visibility, trigger: toOverlayTrigger(mode) },
      };

      if (!isCompact) {
        return remapped;
      }

      const compactOverride = COMPACT_WIDGET_OVERRIDES[widget.id];
      if (!compactOverride) {
        return remapped;
      }

      let next = remapped;
      if (compactOverride.offset && isOverlayPosition(remapped.position)) {
        next = {
          ...next,
          position: { ...remapped.position, offset: compactOverride.offset },
        };
      }

      if (compactOverride.className) {
        const mergedClassName = [next.style?.className, compactOverride.className]
          .filter(Boolean)
          .join(' ')
          .trim();
        next = {
          ...next,
          style: {
            ...next.style,
            className: mergedClassName || undefined,
          },
        };
      }

      return next;
    });
}

export function applyMediaOverlayPolicyChain<TData>(
  widgets: OverlayWidget<TData>[],
  {
    context,
    getVisibility,
    chain,
    configurableDefaults,
  }: ApplyMediaOverlayPolicyChainOptions,
): OverlayWidget<TData>[] {
  const effectiveChain = chain && chain.length > 0
    ? chain
    : DEFAULT_MEDIA_OVERLAY_POLICY_CHAIN;

  const runtime: MediaOverlayPolicyRuntimeContext = {
    context,
    getVisibility,
    configurableDefaults,
  };

  return effectiveChain.reduce((current, step) => {
    if (step.enabled === false) {
      return current;
    }

    const registration = mediaOverlayPolicyRegistry.get(step.policyId);
    if (!registration) {
      return current;
    }

    return registration.apply(current, step, runtime);
  }, widgets);
}

registerMediaOverlayPolicy({
  definition: {
    id: CONFIGURABLE_WIDGET_POLICY_ID,
    name: 'Configurable Widgets',
    description: 'Applies per-context visibility rules and compact layout overrides.',
  },
  apply: (widgets, step, runtime) => {
    const params = resolveConfigurablePolicyParams(runtime.configurableDefaults, step.params);
    return applyConfigurableOverlayPolicy(widgets, {
      context: runtime.context,
      getVisibility: runtime.getVisibility,
      useCompactPositions: params.useCompactPositions,
      skipInfoPopoverInCompact: params.skipInfoPopoverInCompact,
      suppressGenerationButtonGroup: params.suppressGenerationButtonGroup,
    });
  },
});
