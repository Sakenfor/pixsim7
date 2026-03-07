import type { GameProjectBundle } from '@lib/api';

export interface ProjectInventoryRow {
  key: string;
  label: string;
  count: number;
  detail?: string;
}

export interface ProjectInventoryEntityCategory {
  key: string;
  label: string;
  source: 'core' | 'extension';
  count: number;
  sample: string[];
  panelId?: string;
  panelLabel?: string;
}

export interface ProjectInventorySummary {
  core: ProjectInventoryRow[];
  extensions: ProjectInventoryRow[];
  entityCategories: ProjectInventoryEntityCategory[];
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

const PANEL_LINK_HINTS: Array<{ pattern: RegExp; panelId: string; panelLabel: string }> = [
  { pattern: /(character|characters|npc|npcs)/i, panelId: 'character-creator', panelLabel: 'Character Creator' },
  { pattern: /(template|templates|block|blocks|pack|packs)/i, panelId: 'prompt-library-inspector', panelLabel: 'Prompt Library Inspector' },
  { pattern: /(scene|scenes|node|nodes|edge|edges)/i, panelId: 'scene-management', panelLabel: 'Scene Management' },
  { pattern: /(location|locations|world|hotspot|hotspots)/i, panelId: 'game-world', panelLabel: 'Game World' },
  { pattern: /(item|items)/i, panelId: 'template-library', panelLabel: 'Template Library' },
];

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

function titleCase(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getStringField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

interface InventoryEntityEntry {
  id: string;
  label: string;
}

function toEntriesFromRows(rows: Record<string, unknown>[], prefix: string): InventoryEntityEntry[] {
  const entries: InventoryEntityEntry[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? {};
    const id = getStringField(row, ['id', 'source_id', 'key', 'slug']) ?? `${prefix}-${index + 1}`;
    const label =
      getStringField(row, ['name', 'title', 'display_name', 'label', 'slug', 'id', 'source_id']) ??
      `${titleCase(prefix)} ${index + 1}`;
    entries.push({ id, label });
  }
  return entries;
}

function toCategory(
  key: string,
  source: 'core' | 'extension',
  entries: InventoryEntityEntry[],
): ProjectInventoryEntityCategory {
  const link = PANEL_LINK_HINTS.find((candidate) => candidate.pattern.test(key));
  return {
    key,
    label: titleCase(key),
    source,
    count: entries.length,
    sample: entries.slice(0, 3).map((entry) => entry.label),
    panelId: link?.panelId,
    panelLabel: link?.panelLabel,
  };
}

function extractExtensionEntries(payload: unknown, key: string): InventoryEntityEntry[] {
  if (Array.isArray(payload)) {
    const rows = toRows(payload);
    if (rows.length > 0) {
      return toEntriesFromRows(rows, key);
    }
    return payload.map((value, index) => ({
      id: `${key}-${index + 1}`,
      label: String(value),
    }));
  }
  if (!isRecord(payload)) {
    if (payload == null) return [];
    return [{ id: key, label: String(payload) }];
  }

  for (const listKey of EXTENSION_LIST_KEYS) {
    const nested = payload[listKey];
    if (!Array.isArray(nested)) {
      continue;
    }
    const rows = toRows(nested);
    if (rows.length > 0) {
      return toEntriesFromRows(rows, `${key}-${listKey}`);
    }
    return nested.map((value, index) => ({
      id: `${key}-${listKey}-${index + 1}`,
      label: String(value),
    }));
  }

  return Object.keys(payload).map((objectKey) => ({
    id: objectKey,
    label: objectKey,
  }));
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
  const hotspots = locations.flatMap((location) => {
    const locationName =
      getStringField(location, ['name', 'title', 'id', 'source_id']) ?? 'location';
    const nested = toRows(location.hotspots);
    return nested.map((hotspot, index) => {
      const hotspotLabel =
        getStringField(hotspot, ['hotspot_id', 'id', 'label', 'title']) ?? `hotspot-${index + 1}`;
      return {
        id: getStringField(hotspot, ['hotspot_id', 'id']) ?? `${locationName}-${index + 1}`,
        label: `${locationName} / ${hotspotLabel}`,
      };
    });
  });

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

  const entityCategories: ProjectInventoryEntityCategory[] = [
    toCategory('characters', 'core', toEntriesFromRows(npcs, 'character')),
    toCategory('locations', 'core', toEntriesFromRows(locations, 'location')),
    toCategory('scenes', 'core', toEntriesFromRows(scenes, 'scene')),
    toCategory('items', 'core', toEntriesFromRows(items, 'item')),
    toCategory('hotspots', 'core', hotspots),
    ...extensionKeys.map((key) => toCategory(key, 'extension', extractExtensionEntries(extensionsRecord[key], key))),
  ].filter((category) => category.count > 0);

  return { core, extensions, entityCategories };
}
