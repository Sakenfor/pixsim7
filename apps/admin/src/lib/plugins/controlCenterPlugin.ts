/**
 * Control Center Plugin System
 *
 * Allows different control center implementations to be swapped as plugins.
 * Each control center plugin provides the same functionality through different UIs.
 */

import type { PluginManifest } from './types';

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

  /**
   * Register a control center plugin
   */
  register(manifest: ControlCenterPluginManifest, plugin: ControlCenterPlugin) {
    this.controlCenters.set(manifest.controlCenter.id, { manifest, plugin });

    if (manifest.controlCenter.default && !this.defaultId) {
      this.defaultId = manifest.controlCenter.id;
    }

    console.log(`[ControlCenter] Registered: ${manifest.controlCenter.displayName}`);
  }

  /**
   * Unregister a control center plugin
   */
  unregister(id: string) {
    const entry = this.controlCenters.get(id);
    if (entry) {
      entry.plugin.cleanup?.();
      this.controlCenters.delete(id);

      if (this.activeId === id) {
        this.activeId = this.defaultId;
      }
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

    // Cleanup previous
    if (this.activeId) {
      const prev = this.controlCenters.get(this.activeId);
      prev?.plugin.cleanup?.();
    }

    this.activeId = id;

    // Save preference
    localStorage.setItem('control-center-preference', id);

    console.log(`[ControlCenter] Activated: ${id}`);
    return true;
  }

  /**
   * Get the active control center plugin
   */
  getActive(): ControlCenterPlugin | null {
    const id = this.activeId || this.defaultId;
    if (!id) return null;

    return this.controlCenters.get(id)?.plugin || null;
  }

  /**
   * Get the active control center ID
   */
  getActiveId(): string | null {
    return this.activeId || this.defaultId;
  }

  /**
   * Get all registered control centers
   */
  getAll() {
    return Array.from(this.controlCenters.values()).map(({ manifest }) => ({
      id: manifest.controlCenter.id,
      displayName: manifest.controlCenter.displayName,
      description: manifest.controlCenter.description,
      preview: manifest.controlCenter.preview,
      features: manifest.controlCenter.features || [],
      default: manifest.controlCenter.default || false,
    }));
  }

  /**
   * Load user preference from storage
   */
  loadPreference() {
    const saved = localStorage.getItem('control-center-preference');
    if (saved && this.controlCenters.has(saved)) {
      this.activeId = saved;
    } else {
      this.activeId = this.defaultId;
    }
  }
}

export const controlCenterRegistry = new ControlCenterRegistry();
