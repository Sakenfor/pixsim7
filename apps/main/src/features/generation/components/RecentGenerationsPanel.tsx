import { MiniGallery } from '@features/gallery/components/MiniGallery';

import type { OperationType } from '@/types/operations';

export interface RecentGenerationsPanelProps {
  operationType?: OperationType;
  generationScopeId?: string;
  sourceLabel?: string;
  context?: {
    operationType?: OperationType;
    generationScopeId?: string;
    sourceLabel?: string;
  };
}

/** Suppress default hover actions so the overlay generation button group takes over. */
const SUPPRESS_HOVER_ACTIONS = () => null;

export function RecentGenerationsPanel(props: RecentGenerationsPanelProps) {
  return (
    <MiniGallery
      initialFilters={{ sort: 'new' }}
      operationType={props.operationType}
      generationScopeId={props.generationScopeId}
      context={props.context}
      paginationMode="page"
      pageSize={20}
      renderItemActions={SUPPRESS_HOVER_ACTIONS}
    />
  );
}
