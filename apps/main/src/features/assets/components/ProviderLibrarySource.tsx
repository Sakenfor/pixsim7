import type { ReactNode } from 'react';

import { ProviderLibraryPanel } from './ProviderLibraryPanel';

interface ProviderLibrarySourceProps {
  layout?: 'masonry' | 'grid';
  cardSize?: number;
  overlayPresetId?: string;
  toolbarExtra?: ReactNode;
}

export function ProviderLibrarySource({ layout, cardSize }: ProviderLibrarySourceProps) {
  return <ProviderLibraryPanel layout={layout} cardSize={cardSize} />;
}
