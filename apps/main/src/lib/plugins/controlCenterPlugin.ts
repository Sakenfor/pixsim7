/**
 * Control Center Plugin System
 *
 * Allows different control center implementations to be swapped as plugins.
 * Each control center plugin provides the same functionality through different UIs.
 */

import type { PluginManifest } from './types';
import { type UnifiedPluginOrigin } from './types';

/**
 * Extended manifest for control center plugins
 */
export interface ControlCenterPluginManifest extends PluginManifest {
  type: 'ui-overlay';
  controlCenter: {
    /** Unique identifier for this control center implementation */
    id: string;
    /** Display name shown in selector */
    displayName: string;
    /** Short description */
    description: string;
    /** Preview image or icon */
    preview?: string;
    /** Whether this should be the default */
    default?: boolean;
    /** Features this control center supports */
    features?: string[];
  };
}

/**
 * Control Center Plugin Interface
 * All control center plugins must implement this
 */
export interface ControlCenterPlugin {
  /** Render the control center UI */
  render: () => React.ReactElement;

  /** Open/show the control center */
  open?: () => void;

  /** Close/hide the control center */
  close?: () => void;

  /** Toggle control center visibility */
  toggle?: () => void;

  /** Set the active module (if applicable) */
  setModule?: (module: string) => void;

  /** Cleanup when switching to another control center */
  cleanup?: () => void;
}

/**
 * Control Center Registry
 * Manages available control center plugins
 */
class ControlCenterRegistry {
  private controlCenters = new Map<string, {
    manifest: ControlCenterPluginManifest;
    plugin: ControlCenterPlugin;
  }>();

  private activeId: string | null = null;
  private defaultId: string | null = null;
  private preferredId: string | null = null;
  private listeners = new Set<() => void>();

  private static readonly PREFERENCE_KEY = 'control-center-preference';

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[ControlCenter] Listener error', err);
      }
    }
  }

  private getStoredPreference(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return localStorage.getItem(ControlCenterRegistry.PREFERENCE_KEY);
    } catch {
      return null;
    }
  }

  private setStoredPreference(id: string | null): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (id) {
        localStorage.setItem(ControlCenterRegistry.PREFERENCE_KEY, id);
      } else {
        localStorage.removeItem(ControlCenterRegistry.PREFERENCE_KEY);
      }
    } catch {
      // Ignore storage write errors; runtime state still updates.
    }
  }

  private recomputeDefaultId(): void {
    const defaultIds = Array.from(this.controlCenters.values())
      .filter(({ manifest }) => manifest.controlCenter.default === true)
      .map(({ manifest }) => manifest.controlCenter.id)
      .sort((a, b) => a.localeCompare(b));
    this.defaultId = defaultIds[0] ?? null;
  }

  private resolveFallbackId(): string | null {
    if (this.controlCenters.size === 0) {
      return null;
    }
    return Array.from(this.controlCenters.keys()).sort((a, b) => a.localeCompare(b))[0] ?? null;
  }

  private resolveActiveId(preferredCandidate?: string | null): string | null {
    const preferred = preferredCandidate ?? this.preferredId;
    if (preferred && this.controlCenters.has(preferred)) {
      return preferred;
    }

    if (this.defaultId && this.controlCenters.has(this.defaultId)) {
      return this.defaultId;
    }

    return this.resolveFallbackId();
  }

  private reconcileActiveId(preferredCandidate?: string | null): void {
    const previousActiveId = this.resolveActiveId(this.activeId);
    const nextActiveId = this.resolveActiveId(preferredCandidate ?? this.activeId);

    if (previousActiveId && previousActiveId !== nextActiveId) {
      this.controlCenters.get(previousActiveId)?.plugin.cleanup?.();
    }

    this.activeId = nextActiveId;
  }

  /**
   * Subscribe to registry changes (register/unregister/active change)
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Register a control center plugin
   */
  register(
    manifest: ControlCenterPluginManifest,
    plugin: ControlCenterPlugin,
    options: { origin?: UnifiedPluginOrigin } = {}
  ) {
    this.controlCenters.set(manifest.controlCenter.id, { manifest, plugin });
    this.recomputeDefaultId();
    this.reconcileActiveId();

    void options;
    console.log(`[ControlCenter] Registered: ${manifest.controlCenter.displayName}`);
    this.notify();
  }

  /**
   * Unregister a control center plugin
   */
  unregister(id: string) {
    const entry = this.controlCenters.get(id);
    if (entry) {
      entry.plugin.cleanup?.();
      this.controlCenters.delete(id);
      this.recomputeDefaultId();
      this.reconcileActiveId();
      this.notify();
    }
  }

  /**
   * Set the active control center
   */
  setActive(id: string) {
    if (!this.controlCenters.has(id)) {
      console.error(`[ControlCenter] Cannot activate unknown control center: ${id}`);
      return false;
    }

    const previousActiveId = this.resolveActiveId(this.activeId);
    if (previousActiveId === id) {
      this.preferredId = id;
      this.setStoredPreference(id);
      return true;
    }

    // Cleanup previous
    if (previousActiveId) {
      const prev = this.controlCenters.get(previousActiveId);
      prev?.plugin.cleanup?.();
    }

    this.activeId = id;
    this.preferredId = id;

    // Save preference
    this.setStoredPreference(id);

    console.log(`[ControlCenter] Activated: ${id}`);
    this.notify();
    return true;
  }

  /**
   * Get the active control center plugin
   */
  getActive(): ControlCenterPlugin | null {
    const id = this.resolveActiveId(this.activeId);
    if (!id) return null;

    return this.controlCenters.get(id)?.plugin || null;
  }

  /**
   * Get the active control center ID
   */
  getActiveId(): string | null {
    return this.resolveActiveId(this.activeId);
  }

  /**
   * Get all registered control centers
   */
  getAll() {
    return Array.from(this.controlCenters.values())
      .map(({ manifest }) => ({
        id: manifest.controlCenter.id,
        displayName: manifest.controlCenter.displayName,
        description: manifest.controlCenter.description,
        preview: manifest.controlCenter.preview,
        features: manifest.controlCenter.features || [],
        default: manifest.controlCenter.default || false,
      }))
      .sort((a, b) => {
        const byName = a.displayName.localeCompare(b.displayName);
        if (byName !== 0) {
          return byName;
        }
        return a.id.localeCompare(b.id);
      });
  }

  /**
   * Load user preference from storage
   */
  loadPreference() {
    this.preferredId = this.getStoredPreference();
    this.recomputeDefaultId();
    this.reconcileActiveId(this.preferredId);

    // If there is no preferred ID and no control centers left, clear storage
    // to avoid stale values lingering across sessions.
    if (!this.activeId && !this.preferredId) {
      this.setStoredPreference(null);
    }

    this.notify();
  }
}

export const controlCenterRegistry = new ControlCenterRegistry();
