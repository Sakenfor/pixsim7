/**
 * QuickGeneratePanel
 *
 * Generation panel for the asset viewer.
 * Wraps the existing ViewerQuickGenerate component.
 */

import { ViewerQuickGenerate } from '../../ViewerQuickGenerate';
import type { ViewerPanelContext } from '../types';

import { useViewerContext } from './hooks';

interface QuickGeneratePanelProps {
  context: ViewerPanelContext;
  panelId: string;
}

export function QuickGeneratePanel({ context }: QuickGeneratePanelProps) {
  const { resolvedContext } = useViewerContext({ context });
  const { asset } = resolvedContext;

  if (!asset) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
        No asset selected
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2">
      <ViewerQuickGenerate asset={asset} alwaysExpanded />
    </div>
  );
}
