import {
  LocationId,
  NpcId,
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
import { getInventory } from '../session/state';

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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseNpcNumericId(rawKey: string): number | null {
  if (!rawKey) return null;
  if (rawKey.startsWith('npc:')) {
    return toNumber(rawKey.slice(4));
  }
  return toNumber(rawKey);
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

function hydrateLegacyNpcObjects(
  session: Pick<GameSessionDTO, 'world_id' | 'flags'>
): Record<string, GameObject> {
  const flags = asRecord(session.flags);
  const npcs = asRecord(flags?.npcs);
  if (!npcs) return {};

  const objects: Record<string, GameObject> = {};
  for (const [key, value] of Object.entries(npcs)) {
    const npcId = parseNpcNumericId(key);
    if (npcId === null) continue;
    const npc = asRecord(value);
    const ref = `npc:${npcId}`;
    const locationId = toNumber(npc?.locationId ?? npc?.currentLocationId);
    const role = typeof npc?.role === 'string' ? npc.role : undefined;
    const expressionState = typeof npc?.expressionState === 'string' ? npc.expressionState : undefined;
    const tags = toStringArray(npc?.tags);
    const object: GameObject = {
      kind: 'npc',
      id: NpcId(npcId),
      ref,
      name:
        typeof npc?.name === 'string' && npc.name.trim().length > 0
          ? npc.name
          : `NPC ${npcId}`,
      runtimeKind: 'npc',
      transform: createFallbackTransform(session, locationId ?? undefined),
      tags: tags.length > 0 ? tags : undefined,
      capabilities: [
        { id: 'interactable', enabled: true },
        { id: 'dialogue_target', enabled: true },
      ],
      npcData: {
        role,
        expressionState,
      },
      meta: {
        source: 'legacy.flags.npcs',
      },
    };
    objects[ref] = object;
  }
  return objects;
}

function hydrateLegacyInventoryObjects(
  session: Pick<GameSessionDTO, 'world_id' | 'flags'>
): Record<string, GameObject> {
  const objects: Record<string, GameObject> = {};
  const inventory = getInventory(session as GameSessionDTO);
  for (const rawItem of inventory) {
    const itemIdRaw = rawItem.id ?? rawItem.itemId;
    if (typeof itemIdRaw !== 'string' || itemIdRaw.trim().length === 0) continue;
    const itemId = itemIdRaw.trim();
    const qty = toNumber(rawItem.qty ?? rawItem.quantity) ?? 1;
    const ref = `item:${itemId}`;
    const object: GameObject = {
      kind: 'item',
      id: itemId,
      ref,
      name:
        typeof rawItem.name === 'string' && rawItem.name.trim().length > 0
          ? rawItem.name
          : itemId,
      runtimeKind: 'item',
      transform: createFallbackTransform(session),
      capabilities: [{ id: 'inventory_item', enabled: true }],
      itemData: {
        itemDefId: itemId,
        quantity: Math.max(0, qty),
      },
      meta: {
        source: 'legacy.flags.inventory',
      },
    };
    objects[ref] = object;
  }
  return objects;
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
  session: Pick<GameSessionDTO, 'world_id' | 'flags'>,
  options: { hydrateLegacy?: boolean } = {}
): GameObjectStore {
  const { hydrateLegacy = true } = options;
  const canonical = normalizeStore(asRecord(session.flags)?.gameObjects, session);
  const base: GameObjectStore = canonical ?? {
    schemaVersion: GAME_OBJECT_STORE_SCHEMA_VERSION,
    objects: {},
  };

  if (!hydrateLegacy) return base;

  const legacyNpcObjects = hydrateLegacyNpcObjects(session);
  const legacyInventoryObjects = hydrateLegacyInventoryObjects(session);

  const merged: Record<string, GameObject> = { ...legacyNpcObjects, ...legacyInventoryObjects };
  for (const [ref, object] of Object.entries(base.objects)) {
    merged[ref] = object;
  }

  return {
    ...base,
    schemaVersion: base.schemaVersion ?? GAME_OBJECT_STORE_SCHEMA_VERSION,
    objects: merged,
  };
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

  const currentFlags = asRecord(session.flags) ?? {};
  const nextStore: GameObjectStore = {
    schemaVersion: GAME_OBJECT_STORE_SCHEMA_VERSION,
    objects: mergedObjects,
    meta: {
      ...(asRecord(baseStore.meta) ?? {}),
      updatedAt: new Date().toISOString(),
    },
  };

  const mirrorInventoryItems = Object.values(mergedObjects)
    .filter((object) => object.kind === 'item')
    .map((object) => {
      const fallbackQuantity = 1;
      const rawQuantity =
        object.kind === 'item'
          ? object.itemData?.quantity
          : fallbackQuantity;
      const quantity = Number.isFinite(Number(rawQuantity))
        ? Math.max(0, Number(rawQuantity))
        : fallbackQuantity;
      const itemId = typeof object.id === 'string' ? object.id : String(object.id);
      return {
        id: itemId,
        qty: quantity,
        itemId,
        quantity,
      };
    })
    .filter((entry) => entry.id.length > 0);

  const currentInventory = asRecord(currentFlags.inventory) ?? {};
  const nextFlags: Record<string, unknown> = {
    ...currentFlags,
    gameObjects: nextStore,
  };
  if (mirrorInventoryItems.length > 0 || objects.some((object) => object.kind === 'item')) {
    nextFlags.inventory = {
      ...currentInventory,
      items: mirrorInventoryItems,
    };
  }

  return {
    ...session,
    flags: nextFlags,
  };
}
