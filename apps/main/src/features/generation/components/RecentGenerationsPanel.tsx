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

export function RecentGenerationsPanel(props: RecentGenerationsPanelProps) {
  return (
    <MiniGallery
      initialFilters={{ sort: 'new' }}
      operationType={props.operationType}
      generationScopeId={props.generationScopeId}
      context={props.context}
    />
  );
}
