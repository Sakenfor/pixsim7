/**
 * Preset Management
 *
 * Generic preset system for editor surfaces.
 */

export {
  // Types
  type BasePreset,
  type ConfigPreset,
  type PresetStorage,
  type PresetManagerOptions,
  // Classes
  PresetManager,
  LocalStoragePresetStorage,
  // Factory
  createPresetManager,
} from './PresetManager';
