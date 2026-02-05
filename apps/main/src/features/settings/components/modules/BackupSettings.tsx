/**
 * Backup Settings Module
 *
 * Provides UI for exporting and importing user settings as JSON files.
 * Uses the bridge pattern - registers in settingsRegistry for sidebar navigation.
 */
import { useState } from 'react';

import {
  downloadSettingsBackup,
  uploadSettingsBackup,
  importSettingsFromJson,
  type ImportResult,
} from '../../lib/backup';
import { settingsRegistry } from '../../lib/core/registry';

type ImportStatus = 'idle' | 'success' | 'error';

interface ImportState {
  status: ImportStatus;
  result?: ImportResult;
}

export function BackupSettings() {
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });
  const [isImporting, setIsImporting] = useState(false);

  const handleExport = () => {
    downloadSettingsBackup();
  };

  const handleImport = async () => {
    setIsImporting(true);
    setImportState({ status: 'idle' });

    try {
      const json = await uploadSettingsBackup();
      const result = importSettingsFromJson(json);

      if (result.success) {
        setImportState({ status: 'success', result });
      } else {
        setImportState({ status: 'error', result });
      }
    } catch (err) {
      // User cancelled file picker or file read failed
      if (err instanceof Error && err.message !== 'File selection cancelled') {
        setImportState({
          status: 'error',
          result: {
            success: false,
            error: err.message,
            imported: [],
            skipped: [],
          },
        });
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6 text-xs text-neutral-800 dark:text-neutral-100">
      {/* Export Section */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Export Settings
        </h2>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
          Download all your settings as a JSON file. This includes panel layouts,
          generation preferences, and UI customizations.
        </p>
        <button
          onClick={handleExport}
          className="px-4 py-2 text-[11px] font-medium rounded-md bg-blue-500 hover:bg-blue-600 text-white transition-colors"
        >
          Export Settings
        </button>
      </section>

      {/* Import Section */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Import Settings
        </h2>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
          Restore settings from a previously exported JSON file.
          After import, reload the page for changes to take effect.
        </p>
        <button
          onClick={handleImport}
          disabled={isImporting}
          className="px-4 py-2 text-[11px] font-medium rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImporting ? 'Importing...' : 'Import Settings'}
        </button>

        {/* Import Result Message */}
        {importState.status === 'success' && importState.result && (
          <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-[11px] font-medium text-green-800 dark:text-green-200">
              Settings imported successfully!
            </p>
            <p className="text-[10px] text-green-700 dark:text-green-300 mt-1">
              Restored {importState.result.imported.length} settings.
              {importState.result.skipped.length > 0 && (
                <> Skipped {importState.result.skipped.length} unknown keys.</>
              )}
            </p>
            <p className="text-[10px] text-green-700 dark:text-green-300 mt-2 font-medium">
              Please reload the page for changes to take effect.
            </p>
          </div>
        )}

        {importState.status === 'error' && importState.result && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-[11px] font-medium text-red-800 dark:text-red-200">
              Import failed
            </p>
            <p className="text-[10px] text-red-700 dark:text-red-300 mt-1">
              {importState.result.error || 'Unknown error occurred'}
            </p>
          </div>
        )}
      </section>

      {/* Info Section */}
      <section className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <h3 className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
          What gets backed up?
        </h3>
        <ul className="text-[10px] text-neutral-600 dark:text-neutral-400 space-y-1 list-disc list-inside">
          <li>Panel layouts and interaction settings</li>
          <li>Generation settings and presets</li>
          <li>Context hub configuration</li>
          <li>UI preferences and icon settings</li>
          <li>Prompt settings</li>
          <li>Generation history</li>
        </ul>
      </section>
    </div>
  );
}

// Register this module in the settings sidebar
settingsRegistry.register({
  id: 'backup',
  label: 'Backup & Restore',
  icon: '💾',
  component: BackupSettings,
  order: 85, // Near the end, before Debug (90)
});
