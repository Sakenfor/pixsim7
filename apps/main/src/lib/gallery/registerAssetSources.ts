import { registerAssetSource } from './assetSources';
import { RemoteGallerySource } from '@/components/assets/RemoteGallerySource';
import { LocalFoldersSource } from '@/components/assets/LocalFoldersSource';

/**
 * Register all available asset sources
 * Called once at app startup
 */
export function registerAssetSources() {
  // Remote gallery (DB-backed assets with surface support)
  registerAssetSource({
    id: 'remote-gallery',
    label: 'Remote Gallery',
    icon: 'database',
    kind: 'remote',
    component: RemoteGallerySource,
    description: 'Database-backed remote assets with multiple viewing surfaces',
  });

  // Local filesystem folders
  registerAssetSource({
    id: 'local-fs',
    label: 'Local Folders',
    icon: 'folder',
    kind: 'local',
    component: LocalFoldersSource,
    description: 'Assets from local filesystem folders',
  });

  // Future sources can be registered here:
  // - Google Drive
  // - Pinterest
  // - Dropbox
  // etc.
}
