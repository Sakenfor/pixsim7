import { SourceControllerProvider } from '../context/SourceControllerContext';
import { useLocalFoldersController } from '../hooks/useLocalFoldersController';

import { LocalFoldersPanel } from './LocalFoldersPanel';

interface LocalFoldersSourceProps {
  layout?: 'masonry' | 'grid';
  cardSize?: number;
  overlayPresetId?: string;
}

/**
 * Local Folders Asset Source
 *
 * Wraps LocalFoldersPanel with SourceControllerProvider to enable context-based
 * access to the controller. Components inside can use useSourceController() or
 * useFolderSourceController() to access the controller without prop drilling.
 *
 * The actual logic lives in useLocalFoldersController which implements
 * FolderSourceController<LocalAsset> from types/sourceController.ts
 */
export function LocalFoldersSource({ layout, cardSize }: LocalFoldersSourceProps) {
  const controller = useLocalFoldersController();

  return (
    <SourceControllerProvider controller={controller} controllerType="folder">
      <LocalFoldersPanel layout={layout} cardSize={cardSize} />
    </SourceControllerProvider>
  );
}
