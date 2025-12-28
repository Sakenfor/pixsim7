/**
 * Library Settings Module
 *
 * Unified settings for library/media functionality including:
 * - Browser settings (cache, quality)
 * - Download settings (auto-ingest, limits)
 * - Storage settings (quality, deletion)
 * - Maintenance tools (SHA, storage sync)
 * - Provider sync tools (library scan, import, lineage)
 *
 * Replaces the separate Assets, Media, and Gallery settings modules.
 */
import { useState } from 'react';
import { settingsRegistry } from '../../lib/core/registry';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { registerLibrarySettings } from '../../lib/schemas/library.settings';
import { LibrarySyncSection } from './LibrarySyncSection';

// Auto-register schema-based settings when module loads
registerLibrarySettings();

type LibraryView = 'settings' | 'sync';

export function LibrarySettings() {
  const [view, setView] = useState<LibraryView>('settings');

  return (
    <div className="flex flex-col h-full">
      {/* View toggle */}
      <div className="flex gap-2 px-4 pt-4 pb-2">
        <button
          onClick={() => setView('settings')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            view === 'settings'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
          }`}
        >
          Settings
        </button>
        <button
          onClick={() => setView('sync')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            view === 'sync'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
          }`}
        >
          Provider Sync
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === 'settings' ? (
          <DynamicSettingsPanel categoryId="library" />
        ) : (
          <LibrarySyncSection />
        )}
      </div>
    </div>
  );
}

// Register this module
settingsRegistry.register({
  id: 'library',
  label: 'Library',
  icon: '📚',
  component: LibrarySettings,
  order: 35,
});
