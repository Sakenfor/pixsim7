import type { DockviewHost } from './host';

const dockviewHosts = new Map<string, DockviewHost>();

export function registerDockviewHost(host: DockviewHost): void {
  dockviewHosts.set(host.dockviewId, host);
}

export function unregisterDockviewHost(dockviewId: string): void {
  dockviewHosts.delete(dockviewId);
}

export function getDockviewHost(dockviewId: string): DockviewHost | undefined {
  return dockviewHosts.get(dockviewId);
}

export function getDockviewHostIds(): string[] {
  return Array.from(dockviewHosts.keys());
}
