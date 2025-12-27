/**
 * Settings Registry
 *
 * Allows modules to register settings tabs that appear in the Settings panel.
 * Each module provides its own component to render settings UI.
 *
 * Extends BaseRegistry for standard CRUD operations and listener support.
 */
import { type ComponentType, type ReactNode } from 'react';

import { BaseRegistry, type Identifiable } from '@lib/core/BaseRegistry';

export interface SettingsModule extends Identifiable {
  /** Unique identifier for the settings module */
  id: string;
  /** Display label for the tab */
  label: string;
  /** Optional icon (React node) */
  icon?: ReactNode;
  /** React component to render the settings content */
  component: ComponentType;
  /** Sort order (lower = earlier) */
  order?: number;
}

class SettingsRegistry extends BaseRegistry<SettingsModule> {
  /**
   * Register a settings module.
   * Overwrites if a module with the same ID already exists (for hot-reload compatibility).
   *
   * @param module - The settings module to register
   */
  register(module: SettingsModule): boolean {
    // Use forceRegister to maintain backward compatibility (always overwrite)
    this.forceRegister(module);
    return true;
  }

  /**
   * Get all registered modules, sorted by order.
   * Lower order values appear first.
   */
  getAll(): SettingsModule[] {
    return super.getAll().sort((a, b) => {
      const orderA = a.order ?? 100;
      const orderB = b.order ?? 100;
      return orderA - orderB;
    });
  }
}

export const settingsRegistry = new SettingsRegistry();
