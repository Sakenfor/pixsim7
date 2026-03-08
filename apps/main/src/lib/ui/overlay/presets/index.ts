/**
 * Overlay Presets
 *
 * Pre-configured overlay presets for common use cases
 */

export {
  mediaCardPresets,
  defaultPreset,
  compactPreset,
  detailedPreset,
  minimalPreset,
  generationPreset,
  reviewPreset,
  focusPreset,
  localFoldersPreset,
  getMediaCardPreset,
  getDefaultMediaCardConfig,
} from './mediaCard';
export { getOverlayPresetMetadata } from './presetMetadata';

export {
  OverlayPresetManager,
  PresetManager,
  LocalStoragePresetStorage,
  presetManager,
} from './presetManager';
export type { PresetStorage } from './presetManager';

export { APIPresetStorage, IndexedDBPresetStorage } from './storage';
export type { APIStorageConfig } from './storage';
