/**
 * GestureSecondaryBridge
 *
 * Single subscriber that syncs the gesture secondary store (duration options)
 * from the resolved CAP_GENERATION_WIDGET capability.
 *
 * By reading from `useCapability` the bridge automatically follows:
 * - Priority-based resolution (open widgets win via +1000 boost)
 * - Explicit targeting via contextHub overrides store
 * - Local-scope proximity (nearest widget wins)
 *
 * Mount once at the app level (e.g. inside ContextHubRootProviders).
 * Replaces the old per-widget sync that caused N writers to fight over
 * a global singleton.
 */

import { useEffect } from 'react';

import { getDurationOptions } from '@lib/generation-ui/utils/parameterUtils';

import {
  CAP_GENERATION_WIDGET,
  useCapability,
  type GenerationWidgetContext,
} from '@features/contextHub';
import { providerCapabilityRegistry } from '@features/providers';

import { useGestureSecondaryStore } from './useGestureSecondaryStore';

export function GestureSecondaryBridge() {
  const { value: widget } = useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);

  const operationType = widget?.operationType;
  const providerId = widget?.providerId;
  const model = widget?.model;
  const widgetDuration = widget?.duration;

  // Derive duration options from the resolved widget's operation spec
  const opSpec = operationType && providerId
    ? providerCapabilityRegistry.getOperationSpec(providerId, operationType)
    : null;
  const durationOpts = getDurationOptions(opSpec?.parameters ?? [], model);
  const durationOptions = durationOpts?.options ?? [];
  const durationOptsKey = durationOptions.join(',');
  const currentDuration = widgetDuration || durationOptions[0] || 0;

  useEffect(() => {
    if (!widget) {
      useGestureSecondaryStore.getState().clear();
      return;
    }
    if (durationOptsKey) {
      const options = durationOptsKey.split(',').map(Number);
      useGestureSecondaryStore.getState().setDurationOptions(options, currentDuration);
    } else {
      useGestureSecondaryStore.getState().clear();
    }
    return () => useGestureSecondaryStore.getState().clear();
  }, [widget, durationOptsKey, currentDuration]);

  return null;
}
