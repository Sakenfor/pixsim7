/**
 * Preset Manager
 *
 * Handles saving, loading, and managing overlay presets (both system and user-created)
 */

import type { OverlayPreset, OverlayConfiguration, PresetCategory } from '../types';
import { mediaCardPresets } from './mediaCard';

const STORAGE_KEY = 'overlay_user_presets';

/**
 * Preset storage interface
 */
export interface PresetStorage {
  save(preset: OverlayPreset): Promise<void>;
  load(id: string): Promise<OverlayPreset | null>;
  loadAll(): Promise<OverlayPreset[]>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}

/**
 * LocalStorage-based preset storage
 */
export class LocalStoragePresetStorage implements PresetStorage {
  async save(preset: OverlayPreset): Promise<void> {
    const presets = await this.loadAll();
    const existing = presets.findIndex((p) => p.id === preset.id);

    if (existing !== -1) {
      presets[existing] = preset;
    } else {
      presets.push(preset);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }

  async load(id: string): Promise<OverlayPreset | null> {
    const presets = await this.loadAll();
    return presets.find((p) => p.id === id) ?? null;
  }

  async loadAll(): Promise<OverlayPreset[]> {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to parse user presets:', error);
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    const presets = await this.loadAll();
    const filtered = presets.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  async exists(id: string): Promise<boolean> {
    const preset = await this.load(id);
    return preset !== null;
  }
}

/**
 * Preset Manager
 *
 * Central management for all overlay presets (system + user)
 */
export class PresetManager {
  private storage: PresetStorage;
  private systemPresets: Map<PresetCategory, OverlayPreset[]>;

  constructor(storage?: PresetStorage) {
    this.storage = storage ?? new LocalStoragePresetStorage();
    this.systemPresets = new Map();

    // Register system presets
    this.registerSystemPresets('media', mediaCardPresets);
  }

  /**
   * Register system presets for a category
   */
  registerSystemPresets(category: PresetCategory, presets: OverlayPreset[]): void {
    this.systemPresets.set(category, presets);
  }

  /**
   * Get all presets for a category (system + user)
   */
  async getAllPresets(category?: PresetCategory): Promise<OverlayPreset[]> {
    const systemPresets = category
      ? this.systemPresets.get(category) ?? []
      : Array.from(this.systemPresets.values()).flat();

    const userPresets = await this.storage.loadAll();

    const filteredUserPresets = category
      ? userPresets.filter((p) => p.category === category)
      : userPresets;

    return [...systemPresets, ...filteredUserPresets];
  }

  /**
   * Get a specific preset by ID
   */
  async getPreset(id: string): Promise<OverlayPreset | null> {
    // Check system presets first
    for (const presets of this.systemPresets.values()) {
      const preset = presets.find((p) => p.id === id);
      if (preset) return preset;
    }

    // Check user presets
    return this.storage.load(id);
  }

  /**
   * Save a user-created preset
   */
  async savePreset(
    configuration: OverlayConfiguration,
    metadata: {
      name: string;
      icon?: string;
      category: PresetCategory;
      thumbnail?: string;
    },
  ): Promise<OverlayPreset> {
    const preset: OverlayPreset = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: metadata.name,
      icon: metadata.icon,
      category: metadata.category,
      configuration,
      isUserCreated: true,
      thumbnail: metadata.thumbnail,
    };

    await this.storage.save(preset);
    return preset;
  }

  /**
   * Update an existing user preset
   */
  async updatePreset(id: string, updates: Partial<OverlayPreset>): Promise<void> {
    const existing = await this.storage.load(id);
    if (!existing) {
      throw new Error(`Preset ${id} not found`);
    }

    if (!existing.isUserCreated) {
      throw new Error(`Cannot update system preset ${id}`);
    }

    const updated: OverlayPreset = {
      ...existing,
      ...updates,
      id, // Preserve ID
      isUserCreated: true, // Ensure flag is set
    };

    await this.storage.save(updated);
  }

  /**
   * Delete a user preset
   */
  async deletePreset(id: string): Promise<void> {
    const preset = await this.storage.load(id);
    if (!preset) {
      throw new Error(`Preset ${id} not found`);
    }

    if (!preset.isUserCreated) {
      throw new Error(`Cannot delete system preset ${id}`);
    }

    await this.storage.delete(id);
  }

  /**
   * Duplicate a preset (system or user)
   */
  async duplicatePreset(id: string, newName?: string): Promise<OverlayPreset> {
    const source = await this.getPreset(id);
    if (!source) {
      throw new Error(`Preset ${id} not found`);
    }

    const configuration: OverlayConfiguration = {
      ...source.configuration,
      id: `${source.configuration.id}-copy`,
      name: `${source.configuration.name} (Copy)`,
    };

    return this.savePreset(configuration, {
      name: newName ?? `${source.name} (Copy)`,
      icon: source.icon,
      category: source.category,
      thumbnail: source.thumbnail,
    });
  }

  /**
   * Export a preset as JSON
   */
  async exportPreset(id: string): Promise<string> {
    const preset = await this.getPreset(id);
    if (!preset) {
      throw new Error(`Preset ${id} not found`);
    }

    return JSON.stringify(preset, null, 2);
  }

  /**
   * Import a preset from JSON
   */
  async importPreset(json: string): Promise<OverlayPreset> {
    try {
      const preset = JSON.parse(json) as OverlayPreset;

      // Validate basic structure
      if (!preset.id || !preset.name || !preset.configuration) {
        throw new Error('Invalid preset structure');
      }

      // Generate new ID if it conflicts
      const exists = await this.storage.exists(preset.id);
      if (exists) {
        preset.id = `${preset.id}-imported-${Date.now()}`;
        preset.name = `${preset.name} (Imported)`;
      }

      // Mark as user-created
      preset.isUserCreated = true;

      await this.storage.save(preset);
      return preset;
    } catch (error) {
      throw new Error(`Failed to import preset: ${error}`);
    }
  }

  /**
   * Find presets matching a configuration
   */
  async findMatchingPreset(
    config: OverlayConfiguration,
  ): Promise<OverlayPreset | null> {
    const allPresets = await this.getAllPresets();

    // Simple matching based on widget count and IDs
    for (const preset of allPresets) {
      const presetWidgetIds = preset.configuration.widgets.map((w) => w.id).sort();
      const configWidgetIds = config.widgets.map((w) => w.id).sort();

      if (JSON.stringify(presetWidgetIds) === JSON.stringify(configWidgetIds)) {
        return preset;
      }
    }

    return null;
  }

  /**
   * Get preset suggestions based on usage context
   */
  async getSuggestedPresets(
    category: PresetCategory,
    context?: {
      hasGeneration?: boolean;
      isReview?: boolean;
      preferMinimal?: boolean;
    },
  ): Promise<OverlayPreset[]> {
    const allPresets = await this.getAllPresets(category);

    // Simple filtering based on context
    if (context?.hasGeneration) {
      const generationPreset = allPresets.find((p) => p.id.includes('generation'));
      if (generationPreset) return [generationPreset];
    }

    if (context?.isReview) {
      const reviewPreset = allPresets.find((p) => p.id.includes('review'));
      if (reviewPreset) return [reviewPreset];
    }

    if (context?.preferMinimal) {
      const minimalPreset = allPresets.find((p) => p.id.includes('minimal'));
      if (minimalPreset) return [minimalPreset];
    }

    // Return default suggestions
    return allPresets.slice(0, 3);
  }
}

/**
 * Global preset manager instance
 */
export const presetManager = new PresetManager();
