/**
 * Type definitions for Local Sources & Folders Controller
 *
 * Defines a minimal "source" model and controller API that works for local folders now,
 * and can support other sources (e.g., Google Drive, cloud storage) later.
 */

import type { LocalAsset } from '../stores/localFoldersStore';

export type LocalSourceId = 'local-fs';

export interface SourceInfo {
  id: LocalSourceId;        // currently only 'local-fs'
  label: string;            // "Local Folders"
  type: 'local';            // reserved for future: 'cloud', 'drive', etc.
}

export type ViewMode = 'grid' | 'tree' | 'list';

export interface LocalFoldersController {
  // Source identity
  source: SourceInfo;             // always 'local-fs' for now

  // Data from localFoldersStore
  folders: Array<{ id: string; name: string }>;
  assets: LocalAsset[];           // flattened, sorted asset list
  filteredAssets: LocalAsset[];   // filtered by selected folder when in tree mode

  // Folder management
  loadPersisted: () => void;
  addFolder: () => void;
  removeFolder: (id: string) => void;
  refreshFolder: (id: string) => void;

  // View state
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedFolderPath: string | null;
  setSelectedFolderPath: (path: string | null) => void;

  // Previews & viewer
  previews: Record<string, string>;
  loadPreview: (asset: LocalAsset | string) => Promise<void>;
  revokePreview: (assetKey: string) => void;  // Cleanup blob URL when no longer visible
  viewerAsset: LocalAsset | null;
  openViewer: (asset: LocalAsset) => void;
  closeViewer: () => void;
  navigateViewer: (direction: 'prev' | 'next') => void;

  // Uploads
  providerId?: string;
  setProviderId: (id: string | undefined) => void;
  uploadStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'>;
  uploadNotes: Record<string, string | undefined>;
  uploadOne: (asset: LocalAsset | string) => Promise<void>;

  // Errors / state from useLocalFolders
  supported: boolean;
  adding: boolean;
  scanning: {
    folderId: string;
    scanned: number;
    found: number;
    currentPath: string;
  } | null;
  error: string | null;
}
