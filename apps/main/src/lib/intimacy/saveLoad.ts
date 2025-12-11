/**
 * Save/Load Utilities for Intimacy Scenes and Progression Arcs
 *
 * Provides import/export functionality for scene configurations and progression arcs.
 * Supports JSON file export/import and local storage persistence.
 *
 * @see docs/INTIMACY_SCENE_COMPOSER.md - Phase 4 documentation
 */

import type {
  IntimacySceneConfig,
  RelationshipProgressionArc,
} from '@/types';
import type { SimulatedRelationshipState } from './gateChecking';

/**
 * Export package for scenes
 */
export interface IntimacySceneExport {
  version: string;
  exportedAt: string;
  scenes: IntimacySceneConfig[];
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    tags?: string[];
  };
}

/**
 * Export package for progression arcs
 */
export interface ProgressionArcExport {
  version: string;
  exportedAt: string;
  arcs: RelationshipProgressionArc[];
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    tags?: string[];
  };
}

/**
 * Simulated state save data
 */
export interface SimulatedStateSave {
  name: string;
  description?: string;
  state: SimulatedRelationshipState;
  savedAt: string;
}

const EXPORT_VERSION = '1.0.0';
const STORAGE_PREFIX = 'pixsim7_intimacy_';

// ============================================================================
// Scene Export/Import
// ============================================================================

/**
 * Export scenes to JSON
 *
 * @param scenes - Scene configs to export
 * @param metadata - Optional metadata for the export
 * @returns JSON string ready for download
 */
export function exportScenesToJSON(
  scenes: IntimacySceneConfig[],
  metadata?: IntimacySceneExport['metadata']
): string {
  const exportData: IntimacySceneExport = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scenes,
    metadata,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import scenes from JSON
 *
 * @param jsonString - JSON string from file
 * @returns Parsed scene configs and metadata
 * @throws Error if JSON is invalid or version incompatible
 */
export function importScenesFromJSON(jsonString: string): IntimacySceneExport {
  try {
    const data = JSON.parse(jsonString) as IntimacySceneExport;

    // Validate structure
    if (!data.version || !data.scenes || !Array.isArray(data.scenes)) {
      throw new Error('Invalid scene export format');
    }

    // Check version compatibility
    if (data.version !== EXPORT_VERSION) {
      console.warn(
        `Import version ${data.version} differs from current version ${EXPORT_VERSION}`
      );
    }

    return data;
  } catch (err: any) {
    throw new Error(`Failed to import scenes: ${err.message}`);
  }
}

/**
 * Download scenes as JSON file
 *
 * @param scenes - Scenes to download
 * @param filename - Filename (default: 'intimacy-scenes.json')
 * @param metadata - Optional metadata
 */
export function downloadScenesAsFile(
  scenes: IntimacySceneConfig[],
  filename: string = 'intimacy-scenes.json',
  metadata?: IntimacySceneExport['metadata']
): void {
  const json = exportScenesToJSON(scenes, metadata);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Upload scenes from file
 *
 * @returns Promise that resolves with imported scenes
 */
export function uploadScenesFromFile(): Promise<IntimacySceneExport> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      try {
        const text = await file.text();
        const data = importScenesFromJSON(text);
        resolve(data);
      } catch (err: any) {
        reject(err);
      }
    };

    input.click();
  });
}

// ============================================================================
// Progression Arc Export/Import
// ============================================================================

/**
 * Export progression arcs to JSON
 *
 * @param arcs - Arcs to export
 * @param metadata - Optional metadata
 * @returns JSON string
 */
export function exportArcsToJSON(
  arcs: RelationshipProgressionArc[],
  metadata?: ProgressionArcExport['metadata']
): string {
  const exportData: ProgressionArcExport = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    arcs,
    metadata,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import progression arcs from JSON
 *
 * @param jsonString - JSON string
 * @returns Parsed arcs and metadata
 * @throws Error if invalid
 */
export function importArcsFromJSON(jsonString: string): ProgressionArcExport {
  try {
    const data = JSON.parse(jsonString) as ProgressionArcExport;

    if (!data.version || !data.arcs || !Array.isArray(data.arcs)) {
      throw new Error('Invalid arc export format');
    }

    if (data.version !== EXPORT_VERSION) {
      console.warn(
        `Import version ${data.version} differs from current version ${EXPORT_VERSION}`
      );
    }

    return data;
  } catch (err: any) {
    throw new Error(`Failed to import arcs: ${err.message}`);
  }
}

/**
 * Download arcs as JSON file
 *
 * @param arcs - Arcs to download
 * @param filename - Filename (default: 'progression-arcs.json')
 * @param metadata - Optional metadata
 */
export function downloadArcsAsFile(
  arcs: RelationshipProgressionArc[],
  filename: string = 'progression-arcs.json',
  metadata?: ProgressionArcExport['metadata']
): void {
  const json = exportArcsToJSON(arcs, metadata);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Upload arcs from file
 *
 * @returns Promise that resolves with imported arcs
 */
export function uploadArcsFromFile(): Promise<ProgressionArcExport> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      try {
        const text = await file.text();
        const data = importArcsFromJSON(text);
        resolve(data);
      } catch (err: any) {
        reject(err);
      }
    };

    input.click();
  });
}

// ============================================================================
// Local Storage Persistence
// ============================================================================

/**
 * Save scene to local storage
 *
 * @param sceneId - Unique scene ID
 * @param scene - Scene config to save
 */
export function saveSceneToLocalStorage(
  sceneId: string,
  scene: IntimacySceneConfig
): void {
  const key = `${STORAGE_PREFIX}scene_${sceneId}`;
  const data = {
    scene,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Load scene from local storage
 *
 * @param sceneId - Scene ID
 * @returns Scene config or null if not found
 */
export function loadSceneFromLocalStorage(sceneId: string): IntimacySceneConfig | null {
  const key = `${STORAGE_PREFIX}scene_${sceneId}`;
  const data = localStorage.getItem(key);

  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    return parsed.scene;
  } catch {
    return null;
  }
}

/**
 * List all saved scenes in local storage
 *
 * @returns Array of scene IDs
 */
export function listSavedScenes(): string[] {
  const keys: string[] = [];
  const prefix = `${STORAGE_PREFIX}scene_`;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key.substring(prefix.length));
    }
  }

  return keys;
}

/**
 * Delete scene from local storage
 *
 * @param sceneId - Scene ID
 */
export function deleteSceneFromLocalStorage(sceneId: string): void {
  const key = `${STORAGE_PREFIX}scene_${sceneId}`;
  localStorage.removeItem(key);
}

/**
 * Save arc to local storage
 *
 * @param arcId - Unique arc ID
 * @param arc - Arc to save
 */
export function saveArcToLocalStorage(
  arcId: string,
  arc: RelationshipProgressionArc
): void {
  const key = `${STORAGE_PREFIX}arc_${arcId}`;
  const data = {
    arc,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Load arc from local storage
 *
 * @param arcId - Arc ID
 * @returns Arc or null if not found
 */
export function loadArcFromLocalStorage(arcId: string): RelationshipProgressionArc | null {
  const key = `${STORAGE_PREFIX}arc_${arcId}`;
  const data = localStorage.getItem(key);

  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    return parsed.arc;
  } catch {
    return null;
  }
}

/**
 * List all saved arcs in local storage
 *
 * @returns Array of arc IDs
 */
export function listSavedArcs(): string[] {
  const keys: string[] = [];
  const prefix = `${STORAGE_PREFIX}arc_`;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key.substring(prefix.length));
    }
  }

  return keys;
}

/**
 * Delete arc from local storage
 *
 * @param arcId - Arc ID
 */
export function deleteArcFromLocalStorage(arcId: string): void {
  const key = `${STORAGE_PREFIX}arc_${arcId}`;
  localStorage.removeItem(key);
}

// ============================================================================
// Simulated State Saves
// ============================================================================

/**
 * Save simulated relationship state
 *
 * @param save - State save data
 */
export function saveSimulatedState(save: Omit<SimulatedStateSave, 'savedAt'>): void {
  const key = `${STORAGE_PREFIX}state_${save.name}`;
  const data: SimulatedStateSave = {
    ...save,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Load simulated relationship state
 *
 * @param name - State name
 * @returns State save or null
 */
export function loadSimulatedState(name: string): SimulatedStateSave | null {
  const key = `${STORAGE_PREFIX}state_${name}`;
  const data = localStorage.getItem(key);

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as SimulatedStateSave;
  } catch {
    return null;
  }
}

/**
 * List all saved simulated states
 *
 * @returns Array of state saves
 */
export function listSavedStates(): SimulatedStateSave[] {
  const states: SimulatedStateSave[] = [];
  const prefix = `${STORAGE_PREFIX}state_`;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const data = localStorage.getItem(key);
      if (data) {
        try {
          states.push(JSON.parse(data) as SimulatedStateSave);
        } catch {
          // Skip invalid data
        }
      }
    }
  }

  return states.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Delete simulated state
 *
 * @param name - State name
 */
export function deleteSimulatedState(name: string): void {
  const key = `${STORAGE_PREFIX}state_${name}`;
  localStorage.removeItem(key);
}

/**
 * Clear all saved data (scenes, arcs, states)
 *
 * @param type - Type to clear ('scenes' | 'arcs' | 'states' | 'all')
 */
export function clearSavedData(
  type: 'scenes' | 'arcs' | 'states' | 'all' = 'all'
): void {
  const prefixes: string[] = [];

  switch (type) {
    case 'scenes':
      prefixes.push(`${STORAGE_PREFIX}scene_`);
      break;
    case 'arcs':
      prefixes.push(`${STORAGE_PREFIX}arc_`);
      break;
    case 'states':
      prefixes.push(`${STORAGE_PREFIX}state_`);
      break;
    case 'all':
      prefixes.push(`${STORAGE_PREFIX}scene_`);
      prefixes.push(`${STORAGE_PREFIX}arc_`);
      prefixes.push(`${STORAGE_PREFIX}state_`);
      break;
  }

  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      for (const prefix of prefixes) {
        if (key.startsWith(prefix)) {
          keysToRemove.push(key);
          break;
        }
      }
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
