import { LocalFoldersPanel } from './LocalFoldersPanel';

/**
 * Local Folders Asset Source
 *
 * Thin wrapper around LocalFoldersPanel to fit the asset source pattern.
 * The actual logic lives in useLocalFoldersController which already implements
 * the source controller pattern from types/localSources.ts
 */
export function LocalFoldersSource() {
  return <LocalFoldersPanel />;
}
