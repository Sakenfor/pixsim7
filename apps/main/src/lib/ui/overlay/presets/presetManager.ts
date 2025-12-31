/**
 * Overlay Preset Manager
 *
 * Extends the generic PresetManager with overlay-specific functionality.
 * Handles saving, loading, and managing overlay presets (both system and user-created)
 */

import type { OverlayPreset, OverlayConfiguration, PresetCategory } from '../types';
import type { UnifiedSurfaceConfig } from '@lib/editing-core';
import {
  PresetManager as GenericPresetManager,
  LocalStoragePresetStorage,
} from '@lib/editing-core';
import { toUnifiedSurfaceConfig, fromUnifiedSurfaceConfig } from '../overlayConfig';
import { mediaCardPresets } from './mediaCard';

const STORAGE_KEY = 'overlay_user_presets';

/**
 * Overlay-specific Preset Manager
 *
 * Extends generic PresetManager with overlay-specific features:
 * - UnifiedSurfaceConfig import/export
 * - Configuration matching
 * - Context-based suggestions
 */
export class OverlayPresetManager extends GenericPresetManager<OverlayPreset, PresetCategory> {
  constructor() {
    super({
      storage: new LocalStoragePresetStorage<OverlayPreset>(STORAGE_KEY),
    });

    // Register system presets
    this.registerSystemPresets('media', mediaCardPresets);
  }

  /**
   * Save a user-created preset from configuration + metadata
   * (Overlay-specific convenience method)
   */
  async savePresetFromConfig(
    configuration: OverlayConfiguration,
    metadata: {
      name: string;
      icon?: string;
      category: PresetCategory;
      thumbnail?: string;
    },
  ): Promise<OverlayPreset> {
    const preset: OverlayPreset = {
      id: this.generateId(),
      name: metadata.name,
      icon: metadata.icon,
      category: metadata.category,
      configuration,
      isUserCreated: true,
      thumbnail: metadata.thumbnail,
    };

    return this.savePreset(preset);
  }

  /**
   * Duplicate a preset with overlay-specific handling
   */
  override async duplicatePreset(id: string, newName?: string): Promise<OverlayPreset> {
    const source = await this.getPreset(id);
    if (!source) {
      throw new Error(`Preset ${id} not found`);
    }

    // Create a copy of the configuration with new IDs
    const configuration: OverlayConfiguration = {
      ...source.configuration,
      id: `${source.configuration.id}-copy`,
      name: `${source.configuration.name} (Copy)`,
    };

    return this.savePresetFromConfig(configuration, {
      name: newName ?? `${source.name} (Copy)`,
      icon: source.icon,
      category: source.category,
      thumbnail: source.thumbnail,
    });
  }

  /**
   * Import a preset with overlay-specific validation
   */
  async importOverlayPreset(json: string): Promise<OverlayPreset> {
    return this.importPreset(json, (preset) => {
      // Validate overlay-specific structure
      return !!(preset.configuration && preset.category);
    });
  }

  /**
   * Export a preset as UnifiedSurfaceConfig (for cross-editor compatibility)
   * This is the new unified format compatible with HUD and other editors
   */
  async exportPresetUnified(id: string): Promise<string> {
    const preset = await this.getPreset(id);
    if (!preset) {
      throw new Error(`Preset ${id} not found`);
    }

    const unified = toUnifiedSurfaceConfig(preset.configuration);
    return JSON.stringify(unified, null, 2);
  }

  /**
   * Import a preset from UnifiedSurfaceConfig JSON
   * Supports cross-editor preset sharing
   */
  async importPresetUnified(json: string, category: PresetCategory = 'custom'): Promise<OverlayPreset> {
    try {
      const unified = JSON.parse(json) as UnifiedSurfaceConfig;

      // Validate it's a unified config
      if (!unified.componentType || !unified.widgets || !unified.version) {
        throw new Error('Invalid UnifiedSurfaceConfig structure');
      }

      // Check if it's an overlay config
      if (unified.componentType !== 'overlay') {
        throw new Error(`Cannot import ${unified.componentType} config as overlay preset`);
      }

      // Convert to OverlayConfiguration (partial - needs widget render functions)
      const partialConfig = fromUnifiedSurfaceConfig(unified);

      const preset: OverlayPreset = {
        id: `imported-${Date.now()}`,
        name: unified.name || 'Imported Preset',
        category,
        configuration: partialConfig as OverlayConfiguration,
        isUserCreated: true,
      };

      // Check for ID conflict
      const exists = await this.storage.exists(preset.id);
      if (exists) {
        preset.id = `${preset.id}-${Math.random().toString(36).substr(2, 9)}`;
      }

      await this.storage.save(preset);
      return preset;
    } catch (error) {
      throw new Error(`Failed to import unified preset: ${error}`);
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

// Re-export types for backwards compatibility
export type { PresetStorage } from '@lib/editing-core';
export { LocalStoragePresetStorage } from '@lib/editing-core';

// Backwards compatible alias
export { OverlayPresetManager as PresetManager };

/**
 * Global preset manager instance
 */
export const presetManager = new OverlayPresetManager();
