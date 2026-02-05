/**
 * Dockview Host Registry (Framework-Agnostic)
 *
 * Central registry for tracking dockview instances.
 * Allows looking up dockview APIs by ID across the application.
 */

import type { DockviewApi } from 'dockview-core';
import type { DockviewHost } from './host';

/**
 * Capabilities that can be associated with a dockview instance
 */
export interface DockviewCapabilities {
  /** Handler for floating panels */
  floatPanelHandler?: (dockviewPanelId: string, panel: any, options?: any) => void;
  /** Custom capabilities can be added as needed */
  [key: string]: unknown;
}

/**
 * Complete registration entry for a dockview instance
 */
export interface DockviewRegistration {
  host: DockviewHost;
  capabilities: DockviewCapabilities;
}

type Listener = () => void;

const dockviewRegistry = new Map<string, DockviewRegistration>();
const listeners = new Set<Listener>();

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('[DockviewRegistry] Error in listener:', e);
    }
  });
}

/**
 * Subscribe to registry changes
 *
 * @returns Unsubscribe function
 */
export function subscribeToDockviewRegistry(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Register a dockview host
 */
export function registerDockviewHost(
  host: DockviewHost,
  capabilities: DockviewCapabilities = {},
): void {
  dockviewRegistry.set(host.dockviewId, { host, capabilities });
  notifyListeners();
}

/**
 * Unregister a dockview host
 */
export function unregisterDockviewHost(dockviewId: string): void {
  dockviewRegistry.delete(dockviewId);
  notifyListeners();
}

/**
 * Get a dockview host by ID
 */
export function getDockviewHost(dockviewId: string): DockviewHost | undefined {
  return dockviewRegistry.get(dockviewId)?.host;
}

/**
 * Get a dockview API by ID
 */
export function getDockviewApi(dockviewId: string): DockviewApi | undefined {
  return dockviewRegistry.get(dockviewId)?.host.api;
}

/**
 * Get capabilities for a dockview by ID
 */
export function getDockviewCapabilities(dockviewId: string): DockviewCapabilities | undefined {
  return dockviewRegistry.get(dockviewId)?.capabilities;
}

/**
 * Get the full registration for a dockview by ID
 */
export function getDockviewRegistration(dockviewId: string): DockviewRegistration | undefined {
  return dockviewRegistry.get(dockviewId);
}

/**
 * Get all registered dockview IDs
 */
export function getDockviewHostIds(): string[] {
  return Array.from(dockviewRegistry.keys());
}

/**
 * Get all registered dockview hosts
 */
export function getAllDockviewHosts(): DockviewHost[] {
  return Array.from(dockviewRegistry.values()).map((r) => r.host);
}

/**
 * Check if a dockview is registered
 */
export function hasDockviewHost(dockviewId: string): boolean {
  return dockviewRegistry.has(dockviewId);
}

/**
 * Clear all registrations (useful for testing)
 */
export function clearDockviewRegistry(): void {
  dockviewRegistry.clear();
  notifyListeners();
}
