/**
 * Floating Panel ID Utilities
 *
 * Multi-instance floating panels use IDs like `panelId::1`, `panelId::2`.
 * These helpers resolve the base definition ID and generate unique instance IDs.
 */

import type { FloatingPanelState } from '../stores/workspaceStore';

/** Separator between definition ID and instance counter in floating panel IDs */
export const FLOATING_INSTANCE_SEP = '::';

/**
 * Extract the panel definition ID from a floating panel ID.
 * Strips the `::N` suffix if present, returns the raw ID otherwise.
 */
export function getFloatingDefinitionId(floatingId: string): string {
  const sepIndex = floatingId.lastIndexOf(FLOATING_INSTANCE_SEP);
  if (sepIndex === -1) return floatingId;
  return floatingId.slice(0, sepIndex);
}

/**
 * Generate a unique floating instance ID for a multi-instance panel.
 * Scans existing floating panels to find the next available counter.
 */
export function createFloatingInstanceId(
  panelId: string,
  existingPanels: FloatingPanelState[],
): string {
  const prefix = `${panelId}${FLOATING_INSTANCE_SEP}`;
  const usedCounters = new Set<number>();
  for (const p of existingPanels) {
    if (p.id.startsWith(prefix)) {
      const n = parseInt(p.id.slice(prefix.length), 10);
      if (!isNaN(n)) usedCounters.add(n);
    }
  }
  let counter = 1;
  while (usedCounters.has(counter)) counter++;
  return `${panelId}${FLOATING_INSTANCE_SEP}${counter}`;
}
