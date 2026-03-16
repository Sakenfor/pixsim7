interface WorldWithIdentity {
  id: number;
  name?: string | null;
}

function normalizeWorldName(name: string): string {
  return name.trim().toLowerCase();
}

function getWorldBaseName(world: WorldWithIdentity): string {
  const name = typeof world.name === 'string' ? world.name.trim() : '';
  return name.length > 0 ? name : `World ${world.id}`;
}

/**
 * Build stable labels for world selectors.
 * Duplicate names are disambiguated with the world ID.
 */
export function buildWorldLabelMap<T extends WorldWithIdentity>(
  worlds: readonly T[],
): Map<number, string> {
  const nameCounts = new Map<string, number>();

  for (const world of worlds) {
    const baseName = getWorldBaseName(world);
    const key = normalizeWorldName(baseName);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const labels = new Map<number, string>();
  for (const world of worlds) {
    const baseName = getWorldBaseName(world);
    const key = normalizeWorldName(baseName);
    const hasDuplicates = (nameCounts.get(key) ?? 0) > 1;
    labels.set(world.id, hasDuplicates ? `${baseName} (#${world.id})` : baseName);
  }

  return labels;
}
