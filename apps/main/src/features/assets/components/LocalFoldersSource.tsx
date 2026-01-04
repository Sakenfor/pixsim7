import { LocalFoldersPanel } from './LocalFoldersPanel';

interface LocalFoldersSourceProps {
  layout?: 'masonry' | 'grid';
  cardSize?: number;
  overlayPresetId?: string;
}

/**
 * Local Folders Asset Source
 *
 * Thin wrapper around LocalFoldersPanel to fit the asset source pattern.
 * The actual logic lives in useLocalFoldersController which already implements
 * the source controller pattern from types/localSources.ts
 */
export function LocalFoldersSource({ layout, cardSize }: LocalFoldersSourceProps) {
  return <LocalFoldersPanel layout={layout} cardSize={cardSize} />;
}
