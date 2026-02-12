/**
 * Plugin Settings Registry
 *
 * Simple registry for plugin settings schemas. Plugins register their
 * SettingGroup[] at registration time, and the Plugin Manager UI reads
 * them to render inline settings.
 */

import type { SettingGroup } from '@lib/settingsSchema/types';

class PluginSettingsRegistry {
  private schemas = new Map<string, SettingGroup[]>();
  private listeners = new Set<() => void>();

  /** Register settings schema for a plugin. Returns an unregister function. */
  register(pluginId: string, groups: SettingGroup[]): () => void {
    this.schemas.set(pluginId, groups);
    this.notify();
    return () => {
      this.schemas.delete(pluginId);
      this.notify();
    };
  }

  /** Get settings schema for a plugin */
  get(pluginId: string): SettingGroup[] | undefined {
    return this.schemas.get(pluginId);
  }

  /** Check if a plugin has registered settings */
  has(pluginId: string): boolean {
    return this.schemas.has(pluginId);
  }

  /** Subscribe to registry changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Get a snapshot version (increments on every change) for useSyncExternalStore */
  getSnapshot(): ReadonlyMap<string, SettingGroup[]> {
    return this.schemas;
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const pluginSettingsRegistry = new PluginSettingsRegistry();
