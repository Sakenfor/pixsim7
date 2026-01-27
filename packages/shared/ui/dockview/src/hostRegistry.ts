/**
 * Central registry for dockview instances with optional capabilities.
 * Single source of truth for all dockview registrations.
 */

import type { DockviewApi } from 'dockview-core';
import type { DockviewHost } from './host';

/**
 * Capabilities that can be associated with a dockview instance.
 */
export interface DockviewCapabilities {
  floatPanelHandler?: (dockviewPanelId: string, panel: any, options?: any) => void;
}

/**
 * Complete registration entry for a dockview instance.
 */
export interface DockviewRegistration {
  host: DockviewHost;
  capabilities: DockviewCapabilities;
}

const dockviewRegistry = new Map<string, DockviewRegistration>();

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribeToDockviewRegistry(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerDockviewHost(
  host: DockviewHost,
  capabilities: DockviewCapabilities = {}
): void {
  dockviewRegistry.set(host.dockviewId, { host, capabilities });
  notifyListeners();
}

export function unregisterDockviewHost(dockviewId: string): void {
  dockviewRegistry.delete(dockviewId);
  notifyListeners();
}

export function getDockviewHost(dockviewId: string): DockviewHost | undefined {
  return dockviewRegistry.get(dockviewId)?.host;
}

export function getDockviewApi(dockviewId: string): DockviewApi | undefined {
  return dockviewRegistry.get(dockviewId)?.host.api;
}

export function getDockviewCapabilities(dockviewId: string): DockviewCapabilities | undefined {
  return dockviewRegistry.get(dockviewId)?.capabilities;
}

export function getDockviewRegistration(dockviewId: string): DockviewRegistration | undefined {
  return dockviewRegistry.get(dockviewId);
}

export function getDockviewHostIds(): string[] {
  return Array.from(dockviewRegistry.keys());
}

export function getAllDockviewHosts(): DockviewHost[] {
  return Array.from(dockviewRegistry.values()).map((r) => r.host);
}
