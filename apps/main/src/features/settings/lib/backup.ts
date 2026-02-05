/**
 * Settings Backup Utilities
 *
 * Export and import all user settings as a JSON file.
 * Supports both localStorage-only stores and backend-synced stores.
 */

/**
 * All localStorage keys to include in backup.
 *
 * localStorage-based stores (13 stores):
 * - Panel interaction and UI settings
 * - Context hub settings
 * - Component/icon/media settings
 * - Prompt settings
 * - Generation history
 * - Asset selection/viewer
 * - Panel instance settings
 *
 * Backend-synced stores (5 stores) - stored as `{key}_local`:
 * - Generation settings/presets
 * - Cube settings
 * - Control center
 * - Panel config
 */
export const SETTINGS_KEYS = [
  // localStorage-based stores
  'panel-interaction-settings',
  'panel-settings-ui',
  'settings-ui',
  'context_hub_settings_v2',
  'context_hub_overrides_v1',
  'component_settings_v1',
  'icon_settings_v1',
  'pixsim7:promptSettings',
  'media_settings_v1',
  'generation-history-store',
  'asset_selection_v1',
  'asset_viewer_v2',
  'panel_instance_settings_v1',

  // Backend-synced stores (local copies)
  'generationSettings_local',
  'generationPresets_local',
  'cubeSettings_local',
  'controlCenter_local',
  'panel-config_local',
] as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

/** Export format version for forward compatibility */
export const EXPORT_VERSION = '1.0' as const;

/** Type discriminator for exported files */
export const EXPORT_TYPE = 'settings-backup' as const;

/**
 * Structure of an exported settings file.
 */
export interface SettingsExport {
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  type: typeof EXPORT_TYPE;
  appVersion?: string;
  data: {
    localStorage: Record<string, unknown>;
    metadata: {
      storeCount: number;
      exportedKeys: string[];
    };
  };
}

/**
 * Collect all settings from localStorage and return as export object.
 */
export function exportSettings(): SettingsExport {
  const localStorage: Record<string, unknown> = {};
  const exportedKeys: string[] = [];

  for (const key of SETTINGS_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      try {
        // Parse JSON values to ensure clean export
        localStorage[key] = JSON.parse(value);
        exportedKeys.push(key);
      } catch {
        // If not valid JSON, store as raw string
        localStorage[key] = value;
        exportedKeys.push(key);
      }
    }
  }

  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    type: EXPORT_TYPE,
    data: {
      localStorage,
      metadata: {
        storeCount: exportedKeys.length,
        exportedKeys,
      },
    },
  };
}

/**
 * Convert export object to JSON string.
 */
export function exportSettingsToJson(): string {
  const exportData = exportSettings();
  return JSON.stringify(exportData, null, 2);
}

/**
 * Validation result for import operations.
 */
export interface ImportValidationResult {
  valid: boolean;
  error?: string;
  data?: SettingsExport;
}

/**
 * Validate an imported settings object.
 */
export function validateSettingsImport(data: unknown): ImportValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid file format: expected JSON object' };
  }

  const obj = data as Record<string, unknown>;

  if (obj.type !== EXPORT_TYPE) {
    return { valid: false, error: `Invalid file type: expected "${EXPORT_TYPE}"` };
  }

  if (typeof obj.version !== 'string') {
    return { valid: false, error: 'Missing version field' };
  }

  // Version check - we can add migration logic here later
  if (obj.version !== EXPORT_VERSION) {
    return {
      valid: false,
      error: `Unsupported version: ${obj.version}. Expected ${EXPORT_VERSION}`,
    };
  }

  if (!obj.data || typeof obj.data !== 'object') {
    return { valid: false, error: 'Missing data field' };
  }

  const dataObj = obj.data as Record<string, unknown>;

  if (!dataObj.localStorage || typeof dataObj.localStorage !== 'object') {
    return { valid: false, error: 'Missing localStorage data' };
  }

  return { valid: true, data: obj as SettingsExport };
}

/**
 * Import result with details about what was restored.
 */
export interface ImportResult {
  success: boolean;
  error?: string;
  imported: string[];
  skipped: string[];
}

/**
 * Import settings from a validated export object.
 * Writes each key back to localStorage.
 */
export function importSettings(exportData: SettingsExport): ImportResult {
  const imported: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of Object.entries(exportData.data.localStorage)) {
    // Only import keys that are in our known list
    if (!SETTINGS_KEYS.includes(key as SettingsKey)) {
      skipped.push(key);
      continue;
    }

    try {
      const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
      window.localStorage.setItem(key, jsonValue);
      imported.push(key);
    } catch (err) {
      console.error(`Failed to import setting "${key}":`, err);
      skipped.push(key);
    }
  }

  return {
    success: true,
    imported,
    skipped,
  };
}

/**
 * Parse JSON string and import settings.
 */
export function importSettingsFromJson(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      success: false,
      error: 'Invalid JSON format',
      imported: [],
      skipped: [],
    };
  }

  const validation = validateSettingsImport(parsed);
  if (!validation.valid || !validation.data) {
    return {
      success: false,
      error: validation.error,
      imported: [],
      skipped: [],
    };
  }

  return importSettings(validation.data);
}

/**
 * Generate filename for settings backup.
 */
function generateBackupFilename(): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `pixsim7-settings-${date}.json`;
}

/**
 * Trigger browser download of settings backup.
 */
export function downloadSettingsBackup(): void {
  const json = exportSettingsToJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = generateBackupFilename();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Open file picker and read selected JSON file.
 * Returns Promise that resolves with file contents or rejects on error/cancel.
 */
export function uploadSettingsBackup(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      reader.readAsText(file);
    };

    // Handle cancel (no file selected)
    input.oncancel = () => {
      reject(new Error('File selection cancelled'));
    };

    input.click();
  });
}
