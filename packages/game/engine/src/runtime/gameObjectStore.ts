import {
  LocationId,
  WorldId,
} from '@pixsim7/shared.types';
import type {
  GameObject,
  GameObjectCapabilityId,
  GameObjectId,
  GameObjectStore,
  GameSessionDTO,
  Transform,
} from '@pixsim7/shared.types';
import { GameObjectEntity } from './GameObjectEntity';

export const GAME_OBJECT_STORE_SCHEMA_VERSION = 1;

export interface GameObjectQuery {
  kind?: string;
  locationId?: number;
  capability?: GameObjectCapabilityId | string;
  tags?: string[];
}

export type GameObjectLookup =
  | string
  | {
      kind: string;
      id: GameObjectId;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function createFallbackTransform(session: Pick<GameSessionDTO, 'world_id'>, locationId?: number): Transform {
  const worldId = toNumber(session.world_id) ?? 0;
  const normalizedLocationId = toNumber(locationId);
  const transform: Transform = {
    worldId: WorldId(worldId),
    position: { x: 0, y: 0 },
    space: 'world_2d',
  };
  if (normalizedLocationId !== null && normalizedLocationId >= 0) {
    transform.locationId = LocationId(normalizedLocationId);
  }
  return transform;
}

function normalizeTransform(
  rawTransform: unknown,
  fallback: Transform
): Transform {
  const record = asRecord(rawTransform);
  const position = asRecord(record?.position);
  const posX = toNumber(position?.x);
  const posY = toNumber(position?.y);
  const worldId = toNumber(record?.worldId);
  if (record && position && posX !== null && posY !== null && worldId !== null) {
    const normalized: Transform = {
      ...fallback,
      ...(record as unknown as Transform),
      worldId: WorldId(worldId),
      position: {
        ...(position as unknown as Transform['position']),
        x: posX,
        y: posY,
      },
    };
    const locationId = toNumber(record.locationId);
    if (locationId !== null && locationId >= 0) {
      normalized.locationId = LocationId(locationId);
    }
    return normalized;
  }
  return fallback;
}

function normalizeCapabilityId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toGameObjectRef(kind: string, id: GameObjectId): string {
  const normalizedKind = typeof kind === 'string' ? kind.trim() : '';
  const normalizedId =
    typeof id === 'string'
      ? id.trim()
      : typeof id === 'number' && Number.isFinite(id)
      ? String(id)
      : '';
  if (!normalizedKind || !normalizedId) {
    throw new Error('Cannot build game object ref without kind and id');
  }
  return `${normalizedKind}:${normalizedId}`;
}

function normalizeGameObject(
  raw: unknown,
  fallbackRef: string,
  session: Pick<GameSessionDTO, 'world_id'>
): GameObject | null {
  const record = asRecord(raw);
  if (!record) return null;
  const kind = typeof record.kind === 'string' ? record.kind.trim() : null;
  const idValue = record.id;
  if (!kind || (typeof idValue !== 'string' && typeof idValue !== 'number')) {
    return null;
  }
  const normalizedStringId =
    typeof idValue === 'string' ? idValue.trim() : null;
  const normalizedNumericId =
    typeof idValue === 'number' && Number.isFinite(idValue) ? idValue : null;
  if (normalizedStringId !== null && normalizedStringId.length === 0) {
    return null;
  }
  if (normalizedStringId === null && normalizedNumericId === null) {
    return null;
  }
  const id = (normalizedStringId ?? normalizedNumericId) as GameObjectId;
  const ref =
    typeof record.ref === 'string' && record.ref.trim().length > 0
      ? record.ref
      : toGameObjectRef(kind, id);
  const fallback = createFallbackTransform(session);
  const transform = normalizeTransform(record.transform, fallback);
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities
        .map((entry) => {
          const capabilityRecord = asRecord(entry);
          const capabilityId = normalizeCapabilityId(capabilityRecord?.id);
          if (!capabilityId) return null;
          return {
            ...(capabilityRecord as Record<string, unknown>),
            id: capabilityId,
            enabled: capabilityRecord?.enabled !== false,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : undefined;
  const normalizedRecord: Record<string, unknown> = {
    ...record,
    kind,
    id,
    ref,
    runtimeKind:
      typeof record.runtimeKind === 'string' && record.runtimeKind.trim().length > 0
        ? record.runtimeKind
        : kind,
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : fallbackRef,
    transform,
    capabilities,
  };
  return normalizedRecord as unknown as GameObject;
}

/**
 * Build a canonical item-kind `GameObject` for an inventory item.
 */
export function buildInventoryItemObject(
  session: Pick<GameSessionDTO, 'world_id'>,
  itemId: string,
  quantity: number,
  metadata?: Record<string, unknown>
): GameObject {
  const id = itemId.trim();
  const qty = Number.isFinite(Number(quantity)) ? Math.max(0, Number(quantity)) : 0;
  const meta = asRecord(metadata) ?? {};
  const name =
    typeof meta.name === 'string' && meta.name.trim().length > 0 ? meta.name : id;
  const extraItemData = asRecord(meta.itemData) ?? {};
  const reservedMetaKeys = new Set(['name', 'itemData', 'id', 'itemId', 'qty', 'quantity']);
  const restMeta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!reservedMetaKeys.has(key)) restMeta[key] = value;
  }
  return {
    kind: 'item',
    id,
    ref: `item:${id}`,
    name,
    runtimeKind: 'item',
    transform: createFallbackTransform(session),
    capabilities: [{ id: 'inventory_item', enabled: true }],
    itemData: {
      ...restMeta,
      ...extraItemData,
      itemDefId: id,
      quantity: qty,
    },
    meta: {
      source: 'canonical.inventory',
    },
  };
}

/**
 * Build a canonical `npc`-kind `GameObject` shell (no components yet).
 *
 * Mirrors `buildInventoryItemObject` for the npc domain: narrative / ECS
 * component state lives on the object's `components[]` array, keyed by
 * component `type` (e.g. `narrative`), matching the backend's
 * `npc.components[type='stats:<def_id>']` convention.
 */
export function buildNpcObject(
  session: Pick<GameSessionDTO, 'world_id'>,
  npcId: number | string,
  metadata?: Record<string, unknown>
): GameObject {
  const id = String(npcId).trim();
  const meta = asRecord(metadata) ?? {};
  const name =
    typeof meta.name === 'string' && meta.name.trim().length > 0 ? meta.name : `npc:${id}`;
  return {
    kind: 'npc',
    id,
    ref: `npc:${id}`,
    name,
    runtimeKind: 'npc',
    transform: createFallbackTransform(session),
    capabilities: [{ id: 'narrative_participant', enabled: true }],
    components: [],
    meta: {
      source: 'canonical.npc',
    },
  };
}

function normalizeStore(
  rawStore: unknown,
  session: Pick<GameSessionDTO, 'world_id'>
): GameObjectStore | null {
  const record = asRecord(rawStore);
  const objectsRecord = asRecord(record?.objects);
  if (!record || !objectsRecord) return null;

  const objects: Record<string, GameObject> = {};
  for (const [ref, rawObject] of Object.entries(objectsRecord)) {
    const normalized = normalizeGameObject(rawObject, ref, session);
    if (!normalized) continue;
    const normalizedRef = typeof normalized.ref === 'string' ? normalized.ref : ref;
    objects[normalizedRef] = normalized;
  }

  return {
    schemaVersion: toNumber(record.schemaVersion) ?? GAME_OBJECT_STORE_SCHEMA_VERSION,
    objects,
    meta: asRecord(record.meta) ?? undefined,
  };
}

export function getSessionGameObjectStore(
  session: Pick<GameSessionDTO, 'world_id' | 'flags'>
): GameObjectStore {
  const canonical = normalizeStore(asRecord(session.flags)?.gameObjects, session);
  return (
    canonical ?? {
      schemaVersion: GAME_OBJECT_STORE_SCHEMA_VERSION,
      objects: {},
    }
  );
}

function hasCapability(object: GameObject, capability: string): boolean {
  if (!capability) return true;
  const required = capability.trim();
  if (!required) return true;
  const capabilities = object.capabilities ?? [];
  return capabilities.some((item) => item.id === required && item.enabled !== false);
}

function hasAllTags(object: GameObject, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const objectTags = new Set((object.tags ?? []).map((tag) => tag.toLowerCase()));
  return tags.every((tag) => objectTags.has(tag.toLowerCase()));
}

function matchesQuery(object: GameObject, query: GameObjectQuery): boolean {
  if (query.kind && object.kind !== query.kind) {
    return false;
  }
  if (query.locationId != null) {
    const locationId = toNumber(object.transform?.locationId);
    if (locationId !== query.locationId) {
      return false;
    }
  }
  if (query.capability && !hasCapability(object, query.capability)) {
    return false;
  }
  if (query.tags && !hasAllTags(object, query.tags)) {
    return false;
  }
  return true;
}

export function listSessionGameObjects(
  session: Pick<GameSessionDTO, 'world_id' | 'flags'>,
  query: GameObjectQuery = {}
): GameObject[] {
  const store = getSessionGameObjectStore(session);
  return Object.entries(store.objects)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, object]) => object)
    .filter((object) => matchesQuery(object, query));
}

export function getSessionGameObject(
  session: Pick<GameSessionDTO, 'world_id' | 'flags'>,
  lookup: GameObjectLookup
): GameObject | null {
  const store = getSessionGameObjectStore(session);
  const ref =
    typeof lookup === 'string'
      ? lookup
      : toGameObjectRef(lookup.kind, lookup.id);
  return store.objects[ref] ?? null;
}

/**
 * Hydration -> object-core seam (migration_rollout_v1 / hydration-entry).
 *
 * The single place canonical session state (`flags.gameObjects`) is projected
 * into runtime `GameObjectEntity` instances. Runtime callers should consume
 * entities via these (or the
 * `GameRuntime` accessors that delegate here); the plain-POJO functions stay
 * the persistence/API edge per the POJO-boundary policy.
 */
export function listSessionGameObjectEntities(
  session: Pick<GameSessionDTO, 'world_id' | 'flags'>,
  query: GameObjectQuery = {}
): GameObjectEntity[] {
  return GameObjectEntity.fromPOJOs(listSessionGameObjects(session, query));
}

export function getSessionGameObjectEntity(
  session: Pick<GameSessionDTO, 'world_id' | 'flags'>,
  lookup: GameObjectLookup
): GameObjectEntity | null {
  const pojo = getSessionGameObject(session, lookup);
  return pojo ? GameObjectEntity.fromPOJO(pojo) : null;
}

/**
 * Write a merged object set back into the session as the canonical
 * `flags.gameObjects` store. As of the canonical cutover, the legacy
 * `flags.inventory.items` mirror is no longer maintained — both sides read
 * canonical item GameObjects directly.
 */
function writeStoreObjects(
  session: GameSessionDTO,
  mergedObjects: Record<string, GameObject>,
  baseStore: GameObjectStore
): GameSessionDTO {
  const currentFlags = asRecord(session.flags) ?? {};
  const nextStore: GameObjectStore = {
    schemaVersion: GAME_OBJECT_STORE_SCHEMA_VERSION,
    objects: mergedObjects,
    meta: {
      ...(asRecord(baseStore.meta) ?? {}),
      updatedAt: new Date().toISOString(),
    },
  };

  return {
    ...session,
    flags: {
      ...currentFlags,
      gameObjects: nextStore,
    },
  };
}

export function upsertSessionGameObjects(
  session: GameSessionDTO,
  objects: GameObject[]
): GameSessionDTO {
  if (!Array.isArray(objects) || objects.length === 0) {
    return session;
  }

  const baseStore = getSessionGameObjectStore(session);
  const mergedObjects: Record<string, GameObject> = { ...baseStore.objects };
  for (const object of objects) {
    const fallbackRef = toGameObjectRef(object.kind, object.id);
    const normalized = normalizeGameObject(object, fallbackRef, session);
    if (!normalized) continue;
    const key = typeof normalized.ref === 'string' ? normalized.ref : fallbackRef;
    mergedObjects[key] = normalized;
  }

  return writeStoreObjects(session, mergedObjects, baseStore);
}

/**
 * Remove canonical game objects by ref from the `flags.gameObjects` store.
 */
export function removeSessionGameObjects(
  session: GameSessionDTO,
  refs: string[]
): GameSessionDTO {
  if (!Array.isArray(refs) || refs.length === 0) {
    return session;
  }

  const baseStore = getSessionGameObjectStore(session);
  const mergedObjects: Record<string, GameObject> = { ...baseStore.objects };
  let changed = false;
  for (const ref of refs) {
    if (ref in mergedObjects) {
      delete mergedObjects[ref];
      changed = true;
    }
  }

  if (!changed) {
    return session;
  }

  return writeStoreObjects(session, mergedObjects, baseStore);
}

// =============================================================================
// NPC component accessors (canonical npc-kind GameObject `components[]`)
// =============================================================================
//
// NPC component state (narrative runtime state, ad-hoc ECS components from
// narrative effects) lives on the canonical npc GameObject's `components[]`
// array, keyed by component `type`. These helpers are the single read/write
// seam; legacy `flags.npcs[*].components` is no longer written.

/** Read an npc component's `data` payload (canonical). Returns null if absent. */
export function getNpcComponentData(
  session: Pick<GameSessionDTO, 'world_id' | 'flags'>,
  npcId: number | string,
  type: string
): Record<string, unknown> | null {
  const object = getSessionGameObject(session, `npc:${String(npcId)}`);
  if (!object) return null;
  const component = (object.components ?? []).find(
    (comp) => comp.type === type && comp.enabled !== false
  );
  return asRecord(component?.data);
}

/**
 * Upsert an npc component's `data` (immutable). Creates the npc GameObject if it
 * does not exist, then replaces (by `type`) or appends the component entry.
 */
export function upsertNpcComponent(
  session: GameSessionDTO,
  npcId: number | string,
  type: string,
  data: Record<string, unknown>
): GameSessionDTO {
  const ref = `npc:${String(npcId)}`;
  const existing = getSessionGameObject(session, ref);
  const base = existing ?? buildNpcObject(session, npcId);
  const components = [...(base.components ?? [])];
  const index = components.findIndex((comp) => comp.type === type);
  const nextComponent = { type, enabled: true, data };
  if (index >= 0) {
    components[index] = { ...components[index], ...nextComponent };
  } else {
    components.push(nextComponent);
  }
  return upsertSessionGameObjects(session, [{ ...base, components }]);
}

/**
 * Remove an npc component by `type` (immutable). The npc GameObject itself is
 * left in place even if it becomes component-less.
 */
export function removeNpcComponent(
  session: GameSessionDTO,
  npcId: number | string,
  type: string
): GameSessionDTO {
  const ref = `npc:${String(npcId)}`;
  const existing = getSessionGameObject(session, ref);
  if (!existing) return session;
  const components = (existing.components ?? []).filter((comp) => comp.type !== type);
  if (components.length === (existing.components ?? []).length) {
    return session;
  }
  return upsertSessionGameObjects(session, [{ ...existing, components }]);
}
