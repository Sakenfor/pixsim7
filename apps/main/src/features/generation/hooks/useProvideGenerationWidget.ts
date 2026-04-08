/**
 * useProvideGenerationWidget
 *
 * Centralizes CAP_GENERATION_WIDGET provision shared by Control Center and Viewer.
 * Internally calls useQuickGenerateController + useGenerationScopeStores,
 * builds the widget context, and provides it at both local + root scope.
 *
 * NOTE: Duration-options syncing to the gesture secondary store is handled
 * centrally by `GestureSecondaryBridge` (reads from the resolved capability),
 * NOT per-widget.  This avoids N writers fighting over the global store.
 */

import { useMemo } from 'react';

import {
  CAP_GENERATION_WIDGET,
  useProvideCapability,
  type GenerateOverrides,
  type GenerationWidgetContext,
} from '@features/contextHub';

import { useGenerationScopeStores } from './useGenerationScope';
import { useQuickGenerateController } from './useQuickGenerateController';

export interface UseProvideGenerationWidgetConfig {
  /** Unique widget identifier, e.g. 'controlCenter' or 'viewerQuickGenerate' */
  widgetId: string;
  /** Display label for the capability provider */
  label: string;
  /** Priority for capability resolution (higher wins) */
  priority: number;
  /** Whether the widget host is currently visible/open */
  isOpen: boolean;
  /** Open/close the widget host */
  setOpen: (open: boolean) => void;
  /** Skip root-scope registration (for self-contained panels that don't need cross-scope discovery). */
  localOnly?: boolean;
}

export function useProvideGenerationWidget(config: UseProvideGenerationWidgetConfig) {
  const controller = useQuickGenerateController();
  const { useInputStore, id: scopeId } = useGenerationScopeStores();
  const scopedAddInput = useInputStore((s) => s.addInput);
  const scopedAddInputs = useInputStore((s) => s.addInputs);

  // Prefer widgets that are currently visible/open when resolving CAP_GENERATION_WIDGET.
  // This avoids "closed but higher-priority" widgets (e.g. Control Center) stealing actions
  // from an active widget (e.g. Viewer Quick Generate) for things like gesture quick-generate.
  const effectivePriority = config.priority + (config.isOpen ? 1000 : 0);

  const widgetProviderId = `generation-widget:${config.widgetId}`;

  const generationWidgetValue = useMemo<GenerationWidgetContext>(
    () => ({
      isOpen: config.isOpen,
      setOpen: config.setOpen,
      scopeId,
      operationType: controller.operationType,
      providerId: controller.providerId,
      model: (controller.dynamicParams?.model as string) ?? null,
      duration: Number(controller.dynamicParams?.duration) || null,
      setOperationType: controller.setOperationType,
      generate: (overrides?: GenerateOverrides) => controller.generate(overrides),
      executeGeneration: (overrides?: GenerateOverrides) => controller.executeGeneration(overrides),
      addInput: scopedAddInput,
      addInputs: scopedAddInputs,
      widgetId: config.widgetId,
    }),
    [
      config.isOpen,
      config.setOpen,
      scopeId,
      controller.operationType,
      controller.providerId,
      controller.dynamicParams?.model,
      controller.dynamicParams?.duration,
      controller.setOperationType,
      controller.generate,
      controller.executeGeneration,
      scopedAddInput,
      scopedAddInputs,
      config.widgetId,
    ],
  );

  const generationWidgetProvider = useMemo(
    () => ({
      id: widgetProviderId,
      label: config.label,
      priority: effectivePriority,
      exposeToContextMenu: true,
      isAvailable: () => config.isOpen,
      getValue: () => generationWidgetValue,
    }),
    [generationWidgetValue, widgetProviderId, config.label, effectivePriority],
  );

  // Local: ensures this widget wins within its own scope (resolveProvider walks local → root,
  // takes first getBest — so local registration gives scope-proximity semantics).
  useProvideCapability(CAP_GENERATION_WIDGET, generationWidgetProvider, [generationWidgetValue]);
  // Root: makes the widget discoverable from sibling scopes (e.g. gallery) that don't have
  // a direct parent-chain relationship. localOnly widgets use a no-op key to skip this.
  const rootCapKey = config.localOnly ? `${CAP_GENERATION_WIDGET}:noop` : CAP_GENERATION_WIDGET;
  useProvideCapability(rootCapKey, generationWidgetProvider, [generationWidgetValue], {
    scope: 'root',
  });

  return {
    ...controller,
    scopeId,
    useInputStore,
    widgetProviderId,
  };
}
