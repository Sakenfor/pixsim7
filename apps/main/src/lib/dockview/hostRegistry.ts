import type { DockviewApi } from 'dockview-core';
import type { DockviewHost } from './host';

/**
 * Capabilities that can be associated with a dockview instance.
 * These are per-dockview features that context menu actions may need.
 */
export interface DockviewCapabilities {
  /** Handler for floating panels out of the dockview */
  floatPanelHandler?: (dockviewPanelId: string, panel: any, options?: any) => void;
}

/**
 * Complete registration entry for a dockview instance.
 * Combines the host (with API and helpers) and per-dockview capabilities.
 */
export interface DockviewRegistration {
  host: DockviewHost;
  capabilities: DockviewCapabilities;
}

// Single source of truth for all dockview registrations
const dockviewRegistry = new Map<string, DockviewRegistration>();

// Subscription support for reactive updates
type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

/**
 * Subscribe to registry changes.
 * Returns unsubscribe function.
 */
export function subscribeToDockviewRegistry(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Register a dockview host with optional capabilities.
 * This is the single registration point - all systems should use this.
 */
export function registerDockviewHost(
  host: DockviewHost,
  capabilities: DockviewCapabilities = {}
): void {
  dockviewRegistry.set(host.dockviewId, { host, capabilities });
  notifyListeners();
}

/**
 * Unregister a dockview host.
 */
export function unregisterDockviewHost(dockviewId: string): void {
  dockviewRegistry.delete(dockviewId);
  notifyListeners();
}

/**
 * Get a dockview host by ID.
 */
export function getDockviewHost(dockviewId: string): DockviewHost | undefined {
  return dockviewRegistry.get(dockviewId)?.host;
}

/**
 * Get a dockview API by ID.
 * Convenience method - equivalent to getDockviewHost(id)?.api
 */
export function getDockviewApi(dockviewId: string): DockviewApi | undefined {
  return dockviewRegistry.get(dockviewId)?.host.api;
}

/**
 * Get capabilities for a dockview by ID.
 */
export function getDockviewCapabilities(dockviewId: string): DockviewCapabilities | undefined {
  return dockviewRegistry.get(dockviewId)?.capabilities;
}

/**
 * Get the full registration entry for a dockview.
 */
export function getDockviewRegistration(dockviewId: string): DockviewRegistration | undefined {
  return dockviewRegistry.get(dockviewId);
}

/**
 * Get all registered dockview IDs.
 */
export function getDockviewHostIds(): string[] {
  return Array.from(dockviewRegistry.keys());
}

/**
 * Get all registered dockview hosts.
 */
export function getAllDockviewHosts(): DockviewHost[] {
  return Array.from(dockviewRegistry.values()).map((r) => r.host);
}
