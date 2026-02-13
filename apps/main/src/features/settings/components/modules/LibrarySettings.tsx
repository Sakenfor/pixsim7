/**
 * Library Settings Module
 *
 * Unified settings for library/media functionality including:
 * - Display settings (gallery quality, local folder previews, caching)
 * - Download settings (auto-ingest, quality, limits)
 * - Storage settings (cache control, deletion)
 * - Hashing settings (local folder SHA-256 automation)
 * - Maintenance tools (SHA, storage sync)
 * - Provider sync tools (library scan, import, lineage)
 */
import { settingsRegistry } from '../../lib/core/registry';
import { registerLibrarySettings } from '../../lib/schemas/library.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

import { LibrarySyncSection } from './LibrarySyncSection';

// Auto-register schema-based settings when module loads
registerLibrarySettings();

/** Display settings tab */
function LibraryDisplaySettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="library" tabId="display" />
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

/** Hashing settings tab */
function LibraryHashingSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="library" tabId="hashing" />
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

/** Default component - shows display settings */
export function LibrarySettings() {
  return <LibraryDisplaySettings />;
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
      id: 'display',
      label: 'Display',
      icon: '🖼️',
      component: LibraryDisplaySettings,
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
      id: 'hashing',
      label: 'Hashing',
      icon: '#️⃣',
      component: LibraryHashingSettings,
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
