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
import { settingsRegistry } from '../../lib/core/registry';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { registerLibrarySettings } from '../../lib/schemas/library.settings';
import { LibrarySyncSection } from './LibrarySyncSection';

// Auto-register schema-based settings when module loads
registerLibrarySettings();

/** Browser settings tab */
function LibraryBrowserSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="library" tabId="browser" />
    </div>
  );
}

/** Downloads settings tab */
function LibraryDownloadsSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="library" tabId="downloads" />
    </div>
  );
}

/** Storage settings tab */
function LibraryStorageSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="library" tabId="storage" />
    </div>
  );
}

/** Maintenance settings tab */
function LibraryMaintenanceSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="library" tabId="maintenance" />
    </div>
  );
}

/** Default component - shows browser settings */
export function LibrarySettings() {
  return <LibraryBrowserSettings />;
}

// Register this module with sub-sections for each tab
settingsRegistry.register({
  id: 'library',
  label: 'Library',
  icon: '📚',
  component: LibrarySettings,
  order: 35,
  subSections: [
    {
      id: 'browser',
      label: 'Browser',
      icon: '🌐',
      component: LibraryBrowserSettings,
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: '📥',
      component: LibraryDownloadsSettings,
    },
    {
      id: 'storage',
      label: 'Storage',
      icon: '💾',
      component: LibraryStorageSettings,
    },
    {
      id: 'maintenance',
      label: 'Maintenance',
      icon: '🔧',
      component: LibraryMaintenanceSettings,
    },
    {
      id: 'sync',
      label: 'Provider Sync',
      icon: '🔄',
      component: LibrarySyncSection,
    },
  ],
});
