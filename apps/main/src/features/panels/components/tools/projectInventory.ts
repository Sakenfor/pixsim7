import type { GameProjectBundle } from '@lib/api';
import type {
  ProjectBundleInventoryCategorySchema,
  ProjectBundleInventorySchema,
} from '@lib/game/projectBundle/types';

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

export interface BuildProjectInventoryOptions {
  extensionSchemas?: Record<string, ProjectBundleInventorySchema | undefined>;
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

interface ToEntriesFromRowsOptions {
  idFields?: string[];
  labelFields?: string[];
}

interface CategoryOptions {
  label?: string;
  panelId?: string;
  panelLabel?: string;
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

function mergeFieldKeys(primary: string[] | undefined, fallback: string[]): string[] {
  const merged: string[] = [];
  const add = (value: string) => {
    const normalized = value.trim();
    if (!normalized || merged.includes(normalized)) return;
    merged.push(normalized);
  };

  for (const key of primary ?? []) add(key);
  for (const key of fallback) add(key);
  return merged;
}

function toEntriesFromRows(
  rows: Record<string, unknown>[],
  prefix: string,
  options?: ToEntriesFromRowsOptions,
): InventoryEntityEntry[] {
  const idFields = mergeFieldKeys(options?.idFields, ['id', 'source_id', 'key', 'slug']);
  const labelFields = mergeFieldKeys(options?.labelFields, [
    'name',
    'title',
    'display_name',
    'label',
    'slug',
    'id',
    'source_id',
  ]);

  const entries: InventoryEntityEntry[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? {};
    const id = getStringField(row, idFields) ?? `${prefix}-${index + 1}`;
    const label = getStringField(row, labelFields) ?? `${titleCase(prefix)} ${index + 1}`;
    entries.push({ id, label });
  }
  return entries;
}

function toCategory(
  key: string,
  source: 'core' | 'extension',
  entries: InventoryEntityEntry[],
  options?: CategoryOptions,
): ProjectInventoryEntityCategory {
  const explicitPanelId = options?.panelId?.trim();
  const explicitPanelLabel = options?.panelLabel?.trim();
  const link = PANEL_LINK_HINTS.find((candidate) => {
    if (candidate.pattern.test(key)) {
      return true;
    }
    if (options?.label && candidate.pattern.test(options.label)) {
      return true;
    }
    return false;
  });

  return {
    key,
    label: options?.label?.trim() || titleCase(key),
    source,
    count: entries.length,
    sample: entries.slice(0, 3).map((entry) => entry.label),
    panelId: explicitPanelId || link?.panelId,
    panelLabel: explicitPanelLabel || link?.panelLabel,
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

function resolvePath(value: unknown, path: string | undefined): unknown {
  const normalizedPath = path?.trim();
  if (!normalizedPath) {
    return value;
  }

  const segments = normalizedPath.split('.').map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function toRowsFromRecordMap(value: Record<string, unknown>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (isRecord(entry)) {
      rows.push({
        __inventory_key: key,
        ...entry,
      });
    }
  }
  return rows;
}

function extractEntriesBySchema(
  payload: unknown,
  extensionKey: string,
  categorySchema: ProjectBundleInventoryCategorySchema,
): InventoryEntityEntry[] {
  const source = resolvePath(payload, categorySchema.path);
  const rowPrefix = `${extensionKey}-${categorySchema.key}`;

  if (Array.isArray(source)) {
    const rows = toRows(source);
    if (rows.length > 0) {
      return toEntriesFromRows(rows, rowPrefix, {
        idFields: categorySchema.idFields,
        labelFields: categorySchema.labelFields,
      });
    }
    return source.map((entry, index) => ({
      id: `${rowPrefix}-${index + 1}`,
      label: String(entry),
    }));
  }

  if (isRecord(source)) {
    const objectRows = toRowsFromRecordMap(source);
    if (objectRows.length > 0) {
      return toEntriesFromRows(objectRows, rowPrefix, {
        idFields: mergeFieldKeys(categorySchema.idFields, ['__inventory_key']),
        labelFields: mergeFieldKeys(categorySchema.labelFields, ['__inventory_key']),
      });
    }

    return Object.entries(source).map(([key, entry]) => ({
      id: key,
      label: isRecord(entry) ? key : String(entry),
    }));
  }

  if (source == null) {
    return [];
  }

  return [{ id: rowPrefix, label: String(source) }];
}

function normalizeSchemaCategories(
  schema: ProjectBundleInventorySchema | undefined,
): ProjectBundleInventoryCategorySchema[] {
  if (!schema?.categories || !Array.isArray(schema.categories)) {
    return [];
  }
  return schema.categories.filter((candidate) => {
    if (!isRecord(candidate)) return false;
    return typeof candidate.key === 'string' && candidate.key.trim().length > 0;
  }) as ProjectBundleInventoryCategorySchema[];
}

function toCategoryKey(
  extensionKey: string,
  schemaKey: string,
  seenCategoryKeys: Set<string>,
): string {
  const normalizedSchemaKey = schemaKey.trim();
  const baseKey = normalizedSchemaKey || extensionKey;

  if (!seenCategoryKeys.has(baseKey)) {
    seenCategoryKeys.add(baseKey);
    return baseKey;
  }

  const prefixedKey = `${extensionKey}.${baseKey}`;
  if (!seenCategoryKeys.has(prefixedKey)) {
    seenCategoryKeys.add(prefixedKey);
    return prefixedKey;
  }

  let index = 2;
  while (seenCategoryKeys.has(`${prefixedKey}.${index}`)) {
    index += 1;
  }
  const indexedKey = `${prefixedKey}.${index}`;
  seenCategoryKeys.add(indexedKey);
  return indexedKey;
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

/**
 * Known nested sub-entities within core array entries.
 * key = core field, nestedKey = array field inside each row,
 * label/idFields describe how to display them.
 */
const CORE_NESTED_ENTITIES: Array<{
  parentKey: string;
  nestedKey: string;
  label: string;
  parentLabelFields?: string[];
  idFields?: string[];
  labelFields?: string[];
  /** When true, label is formatted as "parentLabel / nestedLabel" */
  qualifyWithParent?: boolean;
}> = [
  {
    parentKey: 'locations',
    nestedKey: 'hotspots',
    label: 'Hotspots',
    parentLabelFields: ['name', 'title', 'id', 'source_id'],
    idFields: ['hotspot_id', 'id'],
    labelFields: ['hotspot_id', 'id', 'label', 'title'],
    qualifyWithParent: true,
  },
  {
    parentKey: 'npcs',
    nestedKey: 'schedules',
    label: 'Character Schedules',
  },
  {
    parentKey: 'npcs',
    nestedKey: 'expressions',
    label: 'Character Expressions',
  },
  {
    parentKey: 'scenes',
    nestedKey: 'nodes',
    label: 'Scene Nodes',
  },
  {
    parentKey: 'scenes',
    nestedKey: 'edges',
    label: 'Scene Edges',
  },
];

/** Label override for known core keys (npcs → Characters, etc.) */
const CORE_KEY_LABELS: Record<string, string> = {
  npcs: 'Characters',
};

function extractNestedEntries(
  parentRows: Record<string, unknown>[],
  def: (typeof CORE_NESTED_ENTITIES)[number],
): InventoryEntityEntry[] {
  if (def.qualifyWithParent) {
    return parentRows.flatMap((parent) => {
      const parentLabel =
        getStringField(parent, def.parentLabelFields ?? ['name', 'title', 'id', 'source_id']) ?? def.parentKey;
      const nested = toRows(parent[def.nestedKey]);
      return nested.map((row, index) => {
        const nestedLabel =
          getStringField(row, def.labelFields ?? ['id', 'label', 'title']) ?? `${def.nestedKey}-${index + 1}`;
        return {
          id: getStringField(row, def.idFields ?? ['id']) ?? `${parentLabel}-${index + 1}`,
          label: `${parentLabel} / ${nestedLabel}`,
        };
      });
    });
  }
  return parentRows.flatMap((parent) => {
    const nested = toRows(parent[def.nestedKey]);
    return toEntriesFromRows(nested, def.nestedKey, {
      idFields: def.idFields,
      labelFields: def.labelFields,
    });
  });
}

export function buildProjectInventory(
  bundle: GameProjectBundle,
  options?: BuildProjectInventoryOptions,
): ProjectInventorySummary {
  const coreRecord = isRecord(bundle.core) ? bundle.core : {};

  // ── Dynamically discover all core keys ────────────────────────────────
  const coreKeys = Object.keys(coreRecord).sort((a, b) => a.localeCompare(b));

  // Build a lookup of parent rows for nested entity extraction
  const coreRowCache = new Map<string, Record<string, unknown>[]>();
  function getCoreRows(key: string): Record<string, unknown>[] {
    let rows = coreRowCache.get(key);
    if (rows === undefined) {
      rows = toRows(coreRecord[key]);
      coreRowCache.set(key, rows);
    }
    return rows;
  }

  // Build nested entity defs indexed by parent key
  const nestedByParent = new Map<string, (typeof CORE_NESTED_ENTITIES)[number][]>();
  for (const def of CORE_NESTED_ENTITIES) {
    const existing = nestedByParent.get(def.parentKey);
    if (existing) {
      existing.push(def);
    } else {
      nestedByParent.set(def.parentKey, [def]);
    }
  }

  const core: ProjectInventoryRow[] = [];
  const entityCategories: ProjectInventoryEntityCategory[] = [];

  for (const key of coreKeys) {
    const value = coreRecord[key];

    if (isRecord(value) && !Array.isArray(value)) {
      // Singular object (like "world") — count as 1
      core.push({ key, label: CORE_KEY_LABELS[key] ?? titleCase(key), count: 1 });
      continue;
    }

    const rows = getCoreRows(key);
    const label = CORE_KEY_LABELS[key] ?? titleCase(key);

    // Primary row
    core.push({ key, label, count: rows.length });

    // Entity category for this core key
    if (rows.length > 0) {
      entityCategories.push(
        toCategory(key, 'core', toEntriesFromRows(rows, key)),
      );
    }

    // Known nested sub-entities (hotspots in locations, nodes in scenes, etc.)
    const nestedDefs = nestedByParent.get(key);
    if (nestedDefs) {
      for (const def of nestedDefs) {
        const nestedCount = countNestedRows(rows, def.nestedKey);
        core.push({ key: def.nestedKey, label: def.label, count: nestedCount });

        if (nestedCount > 0) {
          entityCategories.push(
            toCategory(def.nestedKey, 'core', extractNestedEntries(rows, def)),
          );
        }
      }
    }
  }

  const seenCategoryKeys = new Set(entityCategories.map((category) => category.key));

  // ── Extensions (unchanged — already dynamic) ─────────────────────────
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

  for (const extensionKey of extensionKeys) {
    const payload = extensionsRecord[extensionKey];
    const schemaCategories = normalizeSchemaCategories(
      options?.extensionSchemas?.[extensionKey],
    );
    if (schemaCategories.length === 0) {
      entityCategories.push(
        toCategory(
          toCategoryKey(extensionKey, extensionKey, seenCategoryKeys),
          'extension',
          extractExtensionEntries(payload, extensionKey),
        ),
      );
      continue;
    }

    for (const schemaCategory of schemaCategories) {
      const categoryKey = toCategoryKey(
        extensionKey,
        schemaCategory.key,
        seenCategoryKeys,
      );
      entityCategories.push(
        toCategory(
          categoryKey,
          'extension',
          extractEntriesBySchema(payload, extensionKey, schemaCategory),
          {
            label: schemaCategory.label,
            panelId: schemaCategory.panelId,
            panelLabel: schemaCategory.panelLabel,
          },
        ),
      );
    }
  }

  return {
    core,
    extensions,
    entityCategories: entityCategories.filter((category) => category.count > 0),
  };
}
