/**
 * GenerationCapableHost
 *
 * Lightweight wrapper that provides CAP_GENERATION_WIDGET within a
 * generation scope. Use this for panels that declare
 * `consumesCapabilities: ['generation:scope']` and need generation
 * capability without the full QuickGenWidget layout system.
 *
 * Handles:
 * - Capability bridge (registers CAP_GENERATION_WIDGET locally)
 * - Generation controller (useQuickGenerateController)
 *
 * Does NOT handle:
 * - Generation scope provider (comes from `consumesCapabilities: ['generation:scope']` on panel definition)
 * - Panel layout (the consumer renders its own PanelHostDockview or content)
 * - Generate UI (consumer adds quickgen-settings panel or builds custom UI)
 *
 * @example
 * ```tsx
 * // Panel definition:
 * definePanel({ id: 'my-panel', consumesCapabilities: ['generation:scope'], ... })
 *
 * // Panel component:
 * function MyPanel() {
 *   return (
 *     <GenerationCapableHost widgetId="my-panel" label="My Panel">
 *       <PanelHostDockview ... />
 *     </GenerationCapableHost>
 *   );
 * }
 * ```
 */

import type { ReactNode } from 'react';

import { useProvideGenerationWidget } from '../hooks/useProvideGenerationWidget';

const NOOP_SET_OPEN = () => {};

export interface GenerationCapableHostProps {
  /** Unique widget identifier for capability registration. */
  widgetId: string;
  /** Display label shown in the generator dropdown. */
  label: string;
  /**
   * Priority for capability resolution (higher wins when multiple widgets
   * are available). Default: 5 (below CC and viewer).
   */
  priority?: number;
  children: ReactNode;
}

export function GenerationCapableHost({
  widgetId,
  label,
  priority = 5,
  children,
}: GenerationCapableHostProps) {
  useProvideGenerationWidget({
    widgetId,
    label,
    priority,
    isOpen: true,
    setOpen: NOOP_SET_OPEN,
    localOnly: true,
  });

  return <>{children}</>;
}
