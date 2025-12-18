/**
 * Settings Schema Registry
 *
 * Central registry for schema-driven settings.
 * Modules register their settings here and the Settings UI renders them automatically.
 */

import type {
  SettingCategory,
  SettingTab,
  SettingGroup,
  SettingStoreAdapter,
  SettingRegistration,
} from './types';

type RegistryListener = () => void;

interface RegisteredCategory {
  id: string;
  label: string;
  icon?: string | React.ReactNode;
  order: number;
  tabs: Map<string, SettingTab>;
  groups: SettingGroup[];
  useStore: () => SettingStoreAdapter;
}

class SettingsSchemaRegistry {
  private categories: Map<string, RegisteredCategory> = new Map();
  private listeners: Set<RegistryListener> = new Set();

  /**
   * Register settings from a module.
   * Can add a new category, add tabs to existing category, or add groups.
   */
  register(registration: SettingRegistration): () => void {
    const { categoryId, category, tab, groups, useStore } = registration;

    let cat = this.categories.get(categoryId);

    // Create category if doesn't exist
    if (!cat) {
      cat = {
        id: categoryId,
        label: category?.label ?? categoryId,
        icon: category?.icon,
        order: category?.order ?? 100,
        tabs: new Map(),
        groups: [],
        useStore,
      };
      this.categories.set(categoryId, cat);
    }

    // Add tab if provided (tabs use Map, so duplicates are automatically replaced)
    if (tab) {
      cat.tabs.set(tab.id, tab);
    }

    // Add groups if provided (check for duplicates first)
    if (groups) {
      groups.forEach((newGroup) => {
        // Remove existing group with same ID if present
        const existingIndex = cat!.groups.findIndex((g) => g.id === newGroup.id);
        if (existingIndex >= 0) {
          cat!.groups[existingIndex] = newGroup; // Replace existing
        } else {
          cat!.groups.push(newGroup); // Add new
        }
      });
    }

    this.notify();

    // Return unregister function
    return () => {
      const existingCat = this.categories.get(categoryId);
      if (!existingCat) return;

      if (tab) {
        existingCat.tabs.delete(tab.id);
      }

      if (groups) {
        existingCat.groups = existingCat.groups.filter(
          (g) => !groups.some((rg) => rg.id === g.id)
        );
      }

      // Remove category if empty
      if (existingCat.tabs.size === 0 && existingCat.groups.length === 0) {
        this.categories.delete(categoryId);
      }

      this.notify();
    };
  }

  /**
   * Get all registered categories, sorted by order.
   */
  getCategories(): RegisteredCategory[] {
    return Array.from(this.categories.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * Get a specific category by ID.
   */
  getCategory(id: string): RegisteredCategory | undefined {
    return this.categories.get(id);
  }

  /**
   * Subscribe to registry changes.
   */
  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const settingsSchemaRegistry = new SettingsSchemaRegistry();

// Re-export types for convenience
export type { SettingCategory, SettingTab, SettingGroup, SettingStoreAdapter, SettingRegistration };
