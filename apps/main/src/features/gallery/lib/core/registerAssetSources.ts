import { registerAssetSource } from './assetSources';
import { registerSourceType, getDefaultInstanceId } from './sourceTypes';
import { RemoteGallerySource } from '@features/assets';
import { LocalFoldersSource } from '@features/assets';

/**
 * Register all available asset sources
 * Called once at app startup
 *
 * Phase 2: Define source types, then create one static instance per type
 * Phase 3: Users will create their own instances via settings UI
 */
export function registerAssetSources() {
  // Step 1: Register source types (templates)
  registerSourceTypes();

  // Step 2: Create static instances (one per type for now)
  createStaticInstances();
}

/**
 * Register all available source types
 */
function registerSourceTypes() {
  // Remote gallery type
  registerSourceType({
    typeId: 'remote-gallery',
    name: 'Remote Gallery',
    icon: 'globe',
    category: 'remote',
    description: 'Database-backed remote assets with multiple viewing surfaces',
    component: RemoteGallerySource,
  });

  // Local filesystem type
  registerSourceType({
    typeId: 'local-fs',
    name: 'Local Folders',
    icon: 'folder',
    category: 'local',
    description: 'Assets from local filesystem folders',
    component: LocalFoldersSource,
  });

  // Future types will be registered here in Phase 3:
  // registerSourceType({
  //   typeId: 'google-drive',
  //   name: 'Google Drive',
  //   icon: 'google-drive',
  //   category: 'cloud',
  //   description: 'Assets from Google Drive folders',
  //   component: GoogleDriveSource,
  //   configSchema: { ... },
  //   createController: (config) => new GoogleDriveController(config)
  // });
}

/**
 * Create static instances for each source type
 * Phase 2: Hard-coded, one instance per type
 * Phase 3: Will be replaced by user-created instances from DB
 */
function createStaticInstances() {
  // Remote gallery instance: "PixSim Assets"
  registerAssetSource({
    id: getDefaultInstanceId('remote-gallery'),
    label: 'Remote Gallery',
    icon: 'globe',
    kind: 'remote',
    component: RemoteGallerySource,
  });

  // Local folders instance: "Local Folders"
  registerAssetSource({
    id: getDefaultInstanceId('local-fs'),
    label: 'Local Folders',
    icon: 'folder',
    kind: 'local',
    component: LocalFoldersSource,
  });
}
