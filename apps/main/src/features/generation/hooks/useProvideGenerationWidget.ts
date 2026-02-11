/**
 * useProvideGenerationWidget
 *
 * Centralizes CAP_GENERATION_WIDGET provision shared by Control Center and Viewer.
 * Internally calls useQuickGenerateController + useGenerationScopeStores,
 * builds the widget context, and provides it at both local + root scope.
 */

import { useMemo } from 'react';

import {
  CAP_GENERATION_WIDGET,
  useProvideCapability,
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
}

export function useProvideGenerationWidget(config: UseProvideGenerationWidgetConfig) {
  const controller = useQuickGenerateController();
  const { useInputStore, id: scopeId } = useGenerationScopeStores();
  const scopedAddInput = useInputStore((s) => s.addInput);
  const scopedAddInputs = useInputStore((s) => s.addInputs);

  const widgetProviderId = `generation-widget:${config.widgetId}`;

  const generationWidgetValue = useMemo<GenerationWidgetContext>(
    () => ({
      isOpen: config.isOpen,
      setOpen: config.setOpen,
      scopeId,
      operationType: controller.operationType,
      setOperationType: controller.setOperationType,
      generate: controller.generate,
      addInput: scopedAddInput,
      addInputs: scopedAddInputs,
      widgetId: config.widgetId,
    }),
    [
      config.isOpen,
      config.setOpen,
      scopeId,
      controller.operationType,
      controller.setOperationType,
      controller.generate,
      scopedAddInput,
      scopedAddInputs,
      config.widgetId,
    ],
  );

  const generationWidgetProvider = useMemo(
    () => ({
      id: widgetProviderId,
      label: config.label,
      priority: config.priority,
      exposeToContextMenu: true,
      isAvailable: () => true,
      getValue: () => generationWidgetValue,
    }),
    [generationWidgetValue, widgetProviderId, config.label, config.priority],
  );

  useProvideCapability(CAP_GENERATION_WIDGET, generationWidgetProvider, [generationWidgetValue]);
  useProvideCapability(CAP_GENERATION_WIDGET, generationWidgetProvider, [generationWidgetValue], {
    scope: 'root',
  });

  return {
    ...controller,
    scopeId,
    useInputStore,
    widgetProviderId,
  };
}
