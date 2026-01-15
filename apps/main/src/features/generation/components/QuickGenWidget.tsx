/**
 * QuickGenWidget
 *
 * Convenience wrapper that scopes QuickGenPanelHost with GenerationScopeProvider.
 * Lets widgets mount quick gen panels with minimal wiring.
 */

import type { ReactNode } from 'react';

import { GenerationScopeProvider } from '../hooks/useGenerationScope';

import {
  QuickGenPanelHost,
  type QuickGenPanelHostProps,
} from './QuickGenPanelHost';

export interface QuickGenWidgetProps extends QuickGenPanelHostProps {
  /** Scope id for generation stores (defaults to global scope). */
  scopeId?: string;
  /** Optional scope label override. */
  scopeLabel?: string;
  /** Optional chrome rendered above the panels inside the scope. */
  chrome?: ReactNode;
}

export function QuickGenWidget({
  scopeId = 'global',
  scopeLabel,
  chrome,
  ...panelProps
}: QuickGenWidgetProps) {
  return (
    <GenerationScopeProvider scopeId={scopeId} label={scopeLabel}>
      {chrome}
      <QuickGenPanelHost {...panelProps} />
    </GenerationScopeProvider>
  );
}
