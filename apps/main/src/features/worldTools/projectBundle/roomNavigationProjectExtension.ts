import {
  IDs,
  ROOM_NAVIGATION_META_KEY,
  validateRoomNavigation,
} from '@pixsim7/shared.types';

import { BaseAuthoringProjectBundleContributor } from '../../../lib/game/projectBundle/contributorClass';
import type {
  AuthoringProjectBundleContributor,
  ProjectBundleExportContext,
  ProjectBundleExtensionImportOutcome,
  ProjectBundleImportContext,
} from '../../../lib/game/projectBundle/types';

export const ROOM_NAVIGATION_PROJECT_EXTENSION_KEY = 'authoring.room_navigation';
const ROOM_NAVIGATION_PROJECT_EXTENSION_VERSION = 1;
const ROOM_NAVIGATION_INVALID_PAYLOAD_WARNING =
  'authoring.room_navigation payload is invalid and was ignored';
const ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY = 'room_navigation_transition_cache';

type RoomNavigationData = Extract<
  ReturnType<typeof validateRoomNavigation>,
  { ok: true }
>['data'];

interface RoomNavigationMetaClient {
  readLocationMeta(locationId: number): Promise<Record<string, unknown>>;
  writeLocationRoomNavigation(
    locationId: number,
    roomNavigation: RoomNavigationData,
  ): Promise<void>;
  writeLocationTransitionCache(
    locationId: number,
    transitionCache: Record<string, unknown>,
  ): Promise<void>;
}

let roomNavigationMetaClientForTests: RoomNavigationMetaClient | null = null;

export function __setRoomNavigationProjectExtensionMetaClientForTests(
  client: RoomNavigationMetaClient | null,
): void {
  roomNavigationMetaClientForTests = client;
}

async function getRoomNavigationMetaClient(): Promise<RoomNavigationMetaClient> {
  if (roomNavigationMetaClientForTests) {
    return roomNavigationMetaClientForTests;
  }

  const api = await import('../../../lib/api/game');
  return {
    readLocationMeta: async (locationId: number) => {
      const location = await api.getGameLocation(locationId as IDs.LocationId);
      return isObjectRecord(location.meta) ? cloneJson(location.meta) : {};
    },
    writeLocationRoomNavigation: async (
      locationId: number,
      roomNavigation: RoomNavigationData,
    ) => {
      await api.saveGameLocationRoomNavigation(
        locationId as IDs.LocationId,
        cloneJson(roomNavigation),
      );
    },
    writeLocationTransitionCache: async (
      locationId: number,
      transitionCache: Record<string, unknown>,
    ) => {
      await api.saveGameLocationRoomNavigationTransitionCache(
        locationId as IDs.LocationId,
        cloneJson(transitionCache),
      );
    },
  };
}

interface RoomNavigationInventorySnapshot {
  location_source_id: number;
  location_name: string | null;
  room_id: string;
  start_checkpoint_id: string | null;
  checkpoint_count: number;
  edge_count: number;
  transition_cache_entries: number;
  transition_cache_completed: number;
  transition_cache_pending: number;
  transition_cache_failed: number;
  room_navigation?: RoomNavigationData;
  transition_cache?: Record<string, unknown>;
}

interface RoomNavigationProjectExtensionPayloadV1 {
  version: number;
  items: RoomNavigationInventorySnapshot[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseTransitionCachePayload(value: unknown): Record<string, unknown> | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  if (value.entries !== undefined && !isObjectRecord(value.entries)) {
    return null;
  }
  return cloneJson(value);
}

function parseTransitionCacheCountsFromPayload(payload: Record<string, unknown> | null): {
  entries: number;
  completed: number;
  pending: number;
  failed: number;
} {
  if (!isObjectRecord(payload)) {
    return {
      entries: 0,
      completed: 0,
      pending: 0,
      failed: 0,
    };
  }

  const entriesRaw = payload.entries;
  if (!isObjectRecord(entriesRaw)) {
    return {
      entries: 0,
      completed: 0,
      pending: 0,
      failed: 0,
    };
  }

  const entryValues = Object.values(entriesRaw).filter(isObjectRecord);
  let completed = 0;
  let pending = 0;
  let failed = 0;
  for (const entry of entryValues) {
    const status = entry.status;
    if (status === 'completed') {
      completed += 1;
    } else if (status === 'pending') {
      pending += 1;
    } else if (status === 'failed') {
      failed += 1;
    }
  }

  return {
    entries: entryValues.length,
    completed,
    pending,
    failed,
  };
}

function parseTransitionCacheCounts(meta: Record<string, unknown>): {
  entries: number;
  completed: number;
  pending: number;
  failed: number;
} {
  return parseTransitionCacheCountsFromPayload(
    parseTransitionCachePayload(meta[ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY]),
  );
}

function parsePayload(raw: unknown): RoomNavigationProjectExtensionPayloadV1 | null {
  if (!isObjectRecord(raw)) {
    return null;
  }

  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw)) {
    return null;
  }

  const items: RoomNavigationInventorySnapshot[] = [];
  for (const row of itemsRaw) {
    if (!isObjectRecord(row)) {
      continue;
    }

    const locationSourceId = toFiniteNumber(row.location_source_id);
    const roomId = typeof row.room_id === 'string' ? row.room_id.trim() : '';
    if (locationSourceId === null || !roomId) {
      continue;
    }

    const roomNavigationRaw = row.room_navigation;
    let roomNavigation: RoomNavigationData | undefined;
    if (roomNavigationRaw !== undefined) {
      const parsedNavigation = validateRoomNavigation(roomNavigationRaw);
      if (parsedNavigation.ok) {
        roomNavigation = cloneJson(parsedNavigation.data);
      }
    }

    const transitionCache = parseTransitionCachePayload(row.transition_cache);

    items.push({
      location_source_id: locationSourceId,
      location_name:
        typeof row.location_name === 'string' ? row.location_name : null,
      room_id: roomId,
      start_checkpoint_id:
        typeof row.start_checkpoint_id === 'string'
          ? row.start_checkpoint_id
          : null,
      checkpoint_count: Math.max(0, toFiniteNumber(row.checkpoint_count) ?? 0),
      edge_count: Math.max(0, toFiniteNumber(row.edge_count) ?? 0),
      transition_cache_entries: Math.max(
        0,
        toFiniteNumber(row.transition_cache_entries) ?? 0,
      ),
      transition_cache_completed: Math.max(
        0,
        toFiniteNumber(row.transition_cache_completed) ?? 0,
      ),
      transition_cache_pending: Math.max(
        0,
        toFiniteNumber(row.transition_cache_pending) ?? 0,
      ),
      transition_cache_failed: Math.max(
        0,
        toFiniteNumber(row.transition_cache_failed) ?? 0,
      ),
      room_navigation: roomNavigation,
      transition_cache: transitionCache ? cloneJson(transitionCache) : undefined,
    });
  }

  const parsedVersion = toFiniteNumber(raw.version);
  return {
    version:
      parsedVersion === null
        ? ROOM_NAVIGATION_PROJECT_EXTENSION_VERSION
        : parsedVersion,
    items,
  };
}

class RoomNavigationAuthoringProjectBundleContributor extends BaseAuthoringProjectBundleContributor<RoomNavigationProjectExtensionPayloadV1> {
  key = ROOM_NAVIGATION_PROJECT_EXTENSION_KEY;
  version = ROOM_NAVIGATION_PROJECT_EXTENSION_VERSION;
  inventory = {
    categories: [
      {
        key: 'room_navigation_locations',
        label: 'Room Navigation Locations',
        path: 'items',
        idFields: ['location_source_id'],
        labelFields: ['location_name', 'room_id', 'location_source_id'],
        panelId: 'game-world',
        panelLabel: 'GameWorld',
      },
    ],
  };

  protected onExport(context: ProjectBundleExportContext) {
    const bundle = context.bundle;
    if (!isObjectRecord(bundle)) {
      return null;
    }

    const core = bundle.core;
    if (!isObjectRecord(core) || !Array.isArray(core.locations)) {
      return null;
    }

    const items: RoomNavigationInventorySnapshot[] = [];
    for (const location of core.locations) {
      if (!isObjectRecord(location)) {
        continue;
      }

      const sourceId = toFiniteNumber(location.source_id);
      if (sourceId === null) {
        continue;
      }

      const meta = isObjectRecord(location.meta) ? location.meta : null;
      if (!meta) {
        continue;
      }

      const parsedNavigation = validateRoomNavigation(meta[ROOM_NAVIGATION_META_KEY]);
      if (!parsedNavigation.ok) {
        continue;
      }

      const transitionCachePayload = parseTransitionCachePayload(
        meta[ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY],
      );
      const transitionCache = parseTransitionCacheCounts(meta);
      items.push({
        location_source_id: sourceId,
        location_name:
          typeof location.name === 'string' && location.name.trim().length > 0
            ? location.name
            : null,
        room_id: parsedNavigation.data.room_id,
        start_checkpoint_id: parsedNavigation.data.start_checkpoint_id ?? null,
        checkpoint_count: parsedNavigation.data.checkpoints.length,
        edge_count: parsedNavigation.data.edges.length,
        transition_cache_entries: transitionCache.entries,
        transition_cache_completed: transitionCache.completed,
        transition_cache_pending: transitionCache.pending,
        transition_cache_failed: transitionCache.failed,
        room_navigation: cloneJson(parsedNavigation.data),
        transition_cache: transitionCachePayload
          ? cloneJson(transitionCachePayload)
          : undefined,
      });
    }

    if (items.length === 0) {
      return null;
    }

    return {
      version: ROOM_NAVIGATION_PROJECT_EXTENSION_VERSION,
      items,
    } satisfies RoomNavigationProjectExtensionPayloadV1;
  }

  protected async onImport(
    payload: RoomNavigationProjectExtensionPayloadV1,
    context: ProjectBundleImportContext,
  ): Promise<ProjectBundleExtensionImportOutcome> {
    const parsed = parsePayload(payload);
    if (!parsed) {
      return {
        warnings: [ROOM_NAVIGATION_INVALID_PAYLOAD_WARNING],
      };
    }

    const warnings: string[] = [];
    const locationIdMap = context.response.id_maps?.locations ?? {};
    const metaClient = await getRoomNavigationMetaClient();

    for (const item of parsed.items) {
      const mappedLocationId = locationIdMap[String(item.location_source_id)];
      if (typeof mappedLocationId !== 'number' || !Number.isFinite(mappedLocationId)) {
        warnings.push(
          `authoring.room_navigation import skipped source location ${item.location_source_id}: id map missing`,
        );
        continue;
      }

      if (!item.room_navigation && !item.transition_cache) {
        continue;
      }

      let existingMeta: Record<string, unknown>;
      try {
        existingMeta = await metaClient.readLocationMeta(mappedLocationId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(
          `authoring.room_navigation import read location ${item.location_source_id}: ${message}`,
        );
        continue;
      }

      const existingRoomNavigation = validateRoomNavigation(
        existingMeta[ROOM_NAVIGATION_META_KEY],
      );
      const shouldWriteRoomNavigation =
        Boolean(item.room_navigation) && !existingRoomNavigation.ok;

      const existingTransitionCache = parseTransitionCachePayload(
        existingMeta[ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY],
      );
      const shouldWriteTransitionCache =
        Boolean(item.transition_cache) && !existingTransitionCache;

      if (!shouldWriteRoomNavigation && !shouldWriteTransitionCache) {
        continue;
      }

      if (shouldWriteRoomNavigation && item.room_navigation) {
        try {
          await metaClient.writeLocationRoomNavigation(
            mappedLocationId,
            cloneJson(item.room_navigation),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(
            `authoring.room_navigation import write location ${item.location_source_id}: ${message}`,
          );
        }
      }

      if (shouldWriteTransitionCache && item.transition_cache) {
        try {
          await metaClient.writeLocationTransitionCache(
            mappedLocationId,
            cloneJson(item.transition_cache),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(
            `authoring.room_navigation import write location ${item.location_source_id}: ${message}`,
          );
        }
      }
    }

    return warnings.length > 0 ? { warnings } : {};
  }
}

const contributor = new RoomNavigationAuthoringProjectBundleContributor();

export const authoringProjectBundleContributor: AuthoringProjectBundleContributor<unknown> =
  contributor.toContributor();
