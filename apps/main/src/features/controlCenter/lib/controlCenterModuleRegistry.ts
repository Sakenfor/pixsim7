/**
 * Control Center Module Registry
 *
 * Registry system for Control Center modules (tabs/sections within a CC).
 * Allows plugins to register new modules and users to enable/disable them.
 *
 * Similar pattern to PanelRegistry, WidgetRegistry, etc.
 */

import type { ComponentType } from 'react';
import { BaseRegistry } from '@lib/core/BaseRegistry';
import { debugFlags } from '@lib/utils/debugFlags';

/**
 * Control Center Module Definition
 */
export interface ControlCenterModule {
  /** Unique identifier */
  id: string;

  /** Display label */
  label: string;

  /** Icon (emoji or icon name) */
  icon: string;

  /** Module component */
  component: ComponentType<ControlCenterModuleProps>;

  /** Category for organization */
  category?: 'core' | 'system' | 'tools' | 'custom';

  /** Display order (lower = earlier) */
  order?: number;

  /** Whether module is enabled by default */
  enabledByDefault?: boolean;

  /** Required features/capabilities */
  requiredFeatures?: string[];

  /** Short description */
  description?: string;

  /** Tags for search/filtering */
  tags?: string[];

  /** Whether module is built-in (core) */
  builtin?: boolean;

  /**
   * Scope IDs this module participates in.
   * Modules declaring a scope will be automatically wrapped with the corresponding
   * scope provider (e.g., "generation" scope wraps with GenerationScopeProvider).
   *
   * This enables automatic per-instance scoping without manual wiring.
   *
   * @example scopes: ["generation"] - Module uses generation stores
   */
  scopes?: string[];
}

/**
 * Props passed to module components
 */
export interface ControlCenterModuleProps {
  /** Whether module is currently active */
  isActive?: boolean;

  /** Callback when module wants to switch to another module */
  onSwitchModule?: (moduleId: string) => void;
}

/**
 * Module Registry Class
 */
class ControlCenterModuleRegistry extends BaseRegistry<ControlCenterModule> {
  /**
   * Register a module
   * Note: Unlike other registries, this does NOT overwrite existing modules.
   */
  register(module: ControlCenterModule): void {
    if (this.items.has(module.id)) {
      console.warn(`[CC Module Registry] Module already registered: ${module.id}`);
      return;
    }

    this.items.set(module.id, module);
    debugFlags.log('registry', `[CC Module Registry] Registered: ${module.label} (${module.id})`);
    this.notifyListeners();
  }

  /**
   * Unregister a module
   */
  unregister(id: string): boolean {
    const wasDeleted = super.unregister(id);
    if (wasDeleted) {
      debugFlags.log('registry', `[CC Module Registry] Unregistered: ${id}`);
    }
    return wasDeleted;
  }

  /**
   * Get modules sorted by order and category
   */
  getSorted(): ControlCenterModule[] {
    return this.getAll().sort((a, b) => {
      // First by order (if specified)
      const orderA = a.order ?? 50;
      const orderB = b.order ?? 50;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Then by category
      const categoryOrder = { core: 0, system: 1, tools: 2, custom: 3 };
      const catA = categoryOrder[a.category || 'custom'];
      const catB = categoryOrder[b.category || 'custom'];
      if (catA !== catB) {
        return catA - catB;
      }

      // Finally by label
      return a.label.localeCompare(b.label);
    });
  }

  /**
   * Get enabled modules (respects user preferences)
   */
  getEnabled(userPreferences?: Record<string, boolean>): ControlCenterModule[] {
    return this.getSorted().filter(module => {
      // Check user preference
      if (userPreferences && module.id in userPreferences) {
        return userPreferences[module.id];
      }

      // Fall back to default
      return module.enabledByDefault !== false;
    });
  }

  /**
   * Search modules by query
   */
  search(query: string): ControlCenterModule[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(module => {
      return (
        module.label.toLowerCase().includes(lowerQuery) ||
        module.description?.toLowerCase().includes(lowerQuery) ||
        module.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    });
  }

  /**
   * Get modules by category
   */
  getByCategory(category: ControlCenterModule['category']): ControlCenterModule[] {
    return this.getAll().filter(m => m.category === category);
  }

  /**
   * Check if a module is available (all required features present)
   */
  isAvailable(moduleId: string, availableFeatures: string[] = []): boolean {
    const module = this.get(moduleId);
    if (!module) return false;

    if (!module.requiredFeatures || module.requiredFeatures.length === 0) {
      return true;
    }

    return module.requiredFeatures.every(feature =>
      availableFeatures.includes(feature)
    );
  }
}

/**
 * Global registry instance
 */
export const controlCenterModuleRegistry = new ControlCenterModuleRegistry();
