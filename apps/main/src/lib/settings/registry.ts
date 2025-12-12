/**
 * Settings Registry
 *
 * Allows modules to register settings tabs that appear in the Settings panel.
 * Each module provides its own component to render settings UI.
 */
import { type ComponentType, type ReactNode } from 'react';

export interface SettingsModule {
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

type SettingsListener = () => void;

class SettingsRegistry {
  private modules: Map<string, SettingsModule> = new Map();
  private listeners: Set<SettingsListener> = new Set();

  /**
   * Register a settings module
   */
  register(module: SettingsModule): void {
    this.modules.set(module.id, module);
    this.notify();
  }

  /**
   * Unregister a settings module
   */
  unregister(id: string): void {
    this.modules.delete(id);
    this.notify();
  }

  /**
   * Get all registered modules, sorted by order
   */
  getAll(): SettingsModule[] {
    return Array.from(this.modules.values()).sort((a, b) => {
      const orderA = a.order ?? 100;
      const orderB = b.order ?? 100;
      return orderA - orderB;
    });
  }

  /**
   * Get a specific module by ID
   */
  get(id: string): SettingsModule | undefined {
    return this.modules.get(id);
  }

  /**
   * Subscribe to registry changes
   */
  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }
}

export const settingsRegistry = new SettingsRegistry();
