import {
  listGameLocations,
  listGameNpcs,
  listGameWorlds,
  type GameLocationSummary,
  type GameNpcSummary,
  type GameWorldSummary,
} from '@lib/api';

import { resolverRegistry } from './resolverRegistry';

const RESOLVER_ID_WORLDS = 'game.catalog.worlds';
const RESOLVER_ID_LOCATIONS = 'game.catalog.locations';
const RESOLVER_ID_NPCS = 'game.catalog.npcs';

interface WorldScopedInput {
  worldId?: number | null;
}

interface ResolverConsumerOptions {
  consumerId?: string;
  bypassCache?: boolean;
}

function normalizeWorldId(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.trunc(value);
}

function readWorldIdFromRow(row: unknown): number | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const raw = record.world_id ?? record.worldId;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

let initialized = false;

export function initializeGameCatalogResolvers(): void {
  if (initialized) return;
  initialized = true;

  resolverRegistry.register({
    id: RESOLVER_ID_WORLDS,
    label: 'Game Worlds Catalog Resolver',
    owner: 'game',
    tags: ['catalog', 'worlds'],
    cachePolicy: 'memory_ttl',
    cacheTtlMs: 20_000,
    getCacheKey: () => '__all__',
    run: async () => listGameWorlds(),
  });

  resolverRegistry.register({
    id: RESOLVER_ID_LOCATIONS,
    label: 'Game Locations Catalog Resolver',
    owner: 'game',
    tags: ['catalog', 'locations'],
    cachePolicy: 'memory_ttl',
    cacheTtlMs: 10_000,
    getCacheKey: (input) => {
      const scoped = input as WorldScopedInput | undefined;
      const worldId = normalizeWorldId(scoped?.worldId);
      return worldId == null ? '__all__' : `world:${worldId}`;
    },
    run: async (input) => {
      const worldId = normalizeWorldId((input as WorldScopedInput | undefined)?.worldId);
      return listGameLocations(worldId != null ? { worldId } : undefined);
    },
  });

  resolverRegistry.register({
    id: RESOLVER_ID_NPCS,
    label: 'Game NPC Catalog Resolver',
    owner: 'game',
    tags: ['catalog', 'npcs'],
    cachePolicy: 'memory_ttl',
    cacheTtlMs: 10_000,
    getCacheKey: (input) => {
      const scoped = input as WorldScopedInput | undefined;
      const worldId = normalizeWorldId(scoped?.worldId);
      return worldId == null ? '__all__' : `world:${worldId}`;
    },
    run: async (input) => {
      const worldId = normalizeWorldId((input as WorldScopedInput | undefined)?.worldId);
      const rows = await listGameNpcs();
      if (worldId == null) return rows;
      return rows.filter((row) => {
        const rowWorldId = readWorldIdFromRow(row);
        return rowWorldId == null || rowWorldId === worldId;
      });
    },
  });
}

export async function resolveGameWorlds(
  options: ResolverConsumerOptions = {},
): Promise<GameWorldSummary[]> {
  initializeGameCatalogResolvers();
  return resolverRegistry.run<void, GameWorldSummary[]>(RESOLVER_ID_WORLDS, undefined, {
    consumerId: options.consumerId ?? 'worlds:unknown-consumer',
    bypassCache: options.bypassCache,
  });
}

export async function resolveGameLocations(
  input: WorldScopedInput = {},
  options: ResolverConsumerOptions = {},
): Promise<GameLocationSummary[]> {
  initializeGameCatalogResolvers();
  return resolverRegistry.run<WorldScopedInput, GameLocationSummary[]>(RESOLVER_ID_LOCATIONS, input, {
    consumerId: options.consumerId ?? 'locations:unknown-consumer',
    bypassCache: options.bypassCache,
  });
}

export async function resolveGameNpcs(
  input: WorldScopedInput = {},
  options: ResolverConsumerOptions = {},
): Promise<GameNpcSummary[]> {
  initializeGameCatalogResolvers();
  return resolverRegistry.run<WorldScopedInput, GameNpcSummary[]>(RESOLVER_ID_NPCS, input, {
    consumerId: options.consumerId ?? 'npcs:unknown-consumer',
    bypassCache: options.bypassCache,
  });
}

export const gameCatalogResolverIds = {
  worlds: RESOLVER_ID_WORLDS,
  locations: RESOLVER_ID_LOCATIONS,
  npcs: RESOLVER_ID_NPCS,
} as const;
