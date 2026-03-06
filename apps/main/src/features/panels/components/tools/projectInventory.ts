import type { GameProjectBundle } from '@lib/api';

export interface ProjectInventoryRow {
  key: string;
  label: string;
  count: number;
  detail?: string;
}

export interface ProjectInventorySummary {
  core: ProjectInventoryRow[];
  extensions: ProjectInventoryRow[];
}

export type ProjectInventorySource =
  | { kind: 'active_world'; worldId: number }
  | { kind: 'saved_project'; projectId: number }
  | { kind: 'none' };

interface SelectProjectInventorySourceInput {
  worldId: number | null;
  currentProjectId: number | null;
  selectedProjectId: number | null;
}

const EXTENSION_LIST_KEYS = [
  'items',
  'entries',
  'records',
  'templates',
  'blocks',
  'characters',
  'npcs',
  'locations',
  'scenes',
  'nodes',
  'edges',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

function toCountLabel(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function countNestedRows(rows: Record<string, unknown>[], key: string): number {
  let total = 0;
  for (const row of rows) {
    const nested = row[key];
    if (Array.isArray(nested)) {
      total += nested.length;
    }
  }
  return total;
}

function inferExtensionSummary(payload: unknown): { count: number; detail?: string } {
  if (Array.isArray(payload)) {
    return { count: payload.length, detail: toCountLabel(payload.length, 'entry') };
  }

  if (isRecord(payload)) {
    for (const key of EXTENSION_LIST_KEYS) {
      const nested = payload[key];
      if (Array.isArray(nested)) {
        const count = nested.length;
        return {
          count,
          detail: `${toCountLabel(count, 'entry')} via "${key}"`,
        };
      }
    }

    const numericCountEntry = Object.entries(payload).find(([key, value]) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return false;
      }
      return key === 'count' || key.endsWith('_count');
    });
    if (numericCountEntry) {
      const [key, value] = numericCountEntry;
      const count = Math.max(0, Math.trunc(value));
      return { count, detail: `${toCountLabel(count, 'entry')} via "${key}"` };
    }

    const topLevelKeys = Object.keys(payload).length;
    return { count: topLevelKeys, detail: `${toCountLabel(topLevelKeys, 'top-level key')}` };
  }

  if (payload == null) {
    return { count: 0, detail: 'empty payload' };
  }

  return { count: 1, detail: `${typeof payload} payload` };
}

export function selectProjectInventorySource(
  input: SelectProjectInventorySourceInput,
): ProjectInventorySource {
  if (input.currentProjectId != null && input.worldId != null) {
    return { kind: 'active_world', worldId: input.worldId };
  }
  if (input.selectedProjectId != null) {
    return { kind: 'saved_project', projectId: input.selectedProjectId };
  }
  if (input.worldId != null) {
    return { kind: 'active_world', worldId: input.worldId };
  }
  return { kind: 'none' };
}

export function buildProjectInventory(bundle: GameProjectBundle): ProjectInventorySummary {
  const coreRecord = isRecord(bundle.core) ? bundle.core : {};
  const locations = toRows(coreRecord.locations);
  const npcs = toRows(coreRecord.npcs);
  const scenes = toRows(coreRecord.scenes);
  const items = toRows(coreRecord.items);

  const core: ProjectInventoryRow[] = [
    { key: 'world', label: 'World', count: isRecord(coreRecord.world) ? 1 : 0 },
    { key: 'locations', label: 'Locations', count: locations.length },
    { key: 'hotspots', label: 'Hotspots', count: countNestedRows(locations, 'hotspots') },
    { key: 'characters', label: 'Characters', count: npcs.length },
    { key: 'schedules', label: 'Character Schedules', count: countNestedRows(npcs, 'schedules') },
    { key: 'expressions', label: 'Character Expressions', count: countNestedRows(npcs, 'expressions') },
    { key: 'scenes', label: 'Scenes', count: scenes.length },
    { key: 'nodes', label: 'Scene Nodes', count: countNestedRows(scenes, 'nodes') },
    { key: 'edges', label: 'Scene Edges', count: countNestedRows(scenes, 'edges') },
    { key: 'items', label: 'Items', count: items.length },
  ];

  const extensionsRecord = isRecord(bundle.extensions) ? bundle.extensions : {};
  const extensionKeys = Object.keys(extensionsRecord).sort((a, b) => a.localeCompare(b));
  const extensions = extensionKeys.map((key) => {
    const payload = extensionsRecord[key];
    const summary = inferExtensionSummary(payload);
    return {
      key,
      label: key,
      count: summary.count,
      detail: summary.detail,
    };
  });

  return { core, extensions };
}
