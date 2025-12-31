/**
 * Generic Preset Manager
 *
 * Reusable preset management for any editor surface (overlay, HUD, widgets, etc.)
 * Handles system presets (built-in) and user presets (saved to storage).
 */

/**
 * Base preset interface - all presets must have these fields
 */
export interface BasePreset<TConfig = unknown> {
  id: string;
  name: string;
  description?: string;
  category: string;
  isUserCreated?: boolean;
  icon?: string;
  thumbnail?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Preset with configuration data
 */
export interface ConfigPreset<TConfig, TCategory extends string = string> extends BasePreset<TConfig> {
  category: TCategory;
  configuration: TConfig;
}

/**
 * Generic preset storage interface
 */
export interface PresetStorage<TPreset extends BasePreset> {
  save(preset: TPreset): Promise<void>;
  load(id: string): Promise<TPreset | null>;
  loadAll(): Promise<TPreset[]>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}

/**
 * LocalStorage-based preset storage (generic)
 */
export class LocalStoragePresetStorage<TPreset extends BasePreset> implements PresetStorage<TPreset> {
  constructor(private storageKey: string) {}

  async save(preset: TPreset): Promise<void> {
    const presets = await this.loadAll();
    const existing = presets.findIndex((p) => p.id === preset.id);

    const updated: TPreset = {
      ...preset,
      updatedAt: Date.now(),
    };

    if (existing !== -1) {
      presets[existing] = updated;
    } else {
      (updated as BasePreset).createdAt = Date.now();
      presets.push(updated);
    }

    localStorage.setItem(this.storageKey, JSON.stringify(presets));
  }

  async load(id: string): Promise<TPreset | null> {
    const presets = await this.loadAll();
    return presets.find((p) => p.id === id) ?? null;
  }

  async loadAll(): Promise<TPreset[]> {
    const data = localStorage.getItem(this.storageKey);
    if (!data) return [];

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error(`Failed to parse presets from ${this.storageKey}:`, error);
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    const presets = await this.loadAll();
    const filtered = presets.filter((p) => p.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(filtered));
  }

  async exists(id: string): Promise<boolean> {
    const preset = await this.load(id);
    return preset !== null;
  }
}

/**
 * Options for creating a PresetManager
 */
export interface PresetManagerOptions<TPreset extends BasePreset, TCategory extends string> {
  /** Storage implementation */
  storage: PresetStorage<TPreset>;
  /** System presets organized by category */
  systemPresets?: Map<TCategory, TPreset[]>;
  /** Generate a unique ID for new presets */
  generateId?: () => string;
}

/**
 * Generic Preset Manager
 *
 * Central management for presets (system + user).
 * Works with any preset type that extends BasePreset.
 */
export class PresetManager<
  TPreset extends BasePreset,
  TCategory extends string = string,
> {
  protected storage: PresetStorage<TPreset>;
  protected systemPresets: Map<TCategory, TPreset[]>;
  protected generateId: () => string;

  constructor(options: PresetManagerOptions<TPreset, TCategory>) {
    this.storage = options.storage;
    this.systemPresets = options.systemPresets ?? new Map();
    this.generateId = options.generateId ?? (() => `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }

  /**
   * Register system presets for a category
   */
  registerSystemPresets(category: TCategory, presets: TPreset[]): void {
    this.systemPresets.set(category, presets);
  }

  /**
   * Get all system presets for a category
   */
  getSystemPresets(category?: TCategory): TPreset[] {
    if (category) {
      return this.systemPresets.get(category) ?? [];
    }
    return Array.from(this.systemPresets.values()).flat();
  }

  /**
   * Get all presets for a category (system + user)
   */
  async getAllPresets(category?: TCategory): Promise<TPreset[]> {
    const systemPresets = this.getSystemPresets(category);
    const userPresets = await this.storage.loadAll();

    const filteredUserPresets = category
      ? userPresets.filter((p) => p.category === category)
      : userPresets;

    return [...systemPresets, ...filteredUserPresets];
  }

  /**
   * Get a specific preset by ID
   */
  async getPreset(id: string): Promise<TPreset | null> {
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
  async savePreset(preset: TPreset): Promise<TPreset> {
    const toSave: TPreset = {
      ...preset,
      id: preset.id || this.generateId(),
      isUserCreated: true,
    };

    await this.storage.save(toSave);
    return toSave;
  }

  /**
   * Update an existing user preset
   */
  async updatePreset(id: string, updates: Partial<TPreset>): Promise<void> {
    const existing = await this.storage.load(id);
    if (!existing) {
      throw new Error(`Preset ${id} not found`);
    }

    if (!existing.isUserCreated) {
      throw new Error(`Cannot update system preset ${id}`);
    }

    const updated: TPreset = {
      ...existing,
      ...updates,
      id, // Preserve ID
      isUserCreated: true,
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
  async duplicatePreset(id: string, newName?: string): Promise<TPreset> {
    const source = await this.getPreset(id);
    if (!source) {
      throw new Error(`Preset ${id} not found`);
    }

    const duplicate: TPreset = {
      ...source,
      id: this.generateId(),
      name: newName ?? `${source.name} (Copy)`,
      isUserCreated: true,
    };

    return this.savePreset(duplicate);
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
  async importPreset(json: string, validate?: (preset: TPreset) => boolean): Promise<TPreset> {
    try {
      const preset = JSON.parse(json) as TPreset;

      // Basic validation
      if (!preset.id || !preset.name) {
        throw new Error('Invalid preset structure: missing id or name');
      }

      // Custom validation
      if (validate && !validate(preset)) {
        throw new Error('Preset failed validation');
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
   * Check if a preset exists
   */
  async exists(id: string): Promise<boolean> {
    const preset = await this.getPreset(id);
    return preset !== null;
  }

  /**
   * Get all available categories
   */
  getCategories(): TCategory[] {
    return Array.from(this.systemPresets.keys());
  }
}

/**
 * Create a preset manager with localStorage backend
 */
export function createPresetManager<
  TPreset extends BasePreset,
  TCategory extends string = string,
>(
  storageKey: string,
  systemPresets?: Map<TCategory, TPreset[]>,
): PresetManager<TPreset, TCategory> {
  return new PresetManager<TPreset, TCategory>({
    storage: new LocalStoragePresetStorage<TPreset>(storageKey),
    systemPresets,
  });
}
