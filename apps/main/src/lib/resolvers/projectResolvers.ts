import { listSavedGameProjects, type SavedGameProjectSummary } from '@lib/api';

import type { ResolverDefinition } from './resolverRegistry';
import { resolverRegistry } from './resolverRegistry';

const RESOLVER_ID_SAVED_PROJECTS = 'game.catalog.saved-projects';

interface SavedProjectsInput {
  offset?: number;
  limit?: number;
}

interface ResolverConsumerOptions {
  consumerId?: string;
  bypassCache?: boolean;
}

function normalizeNumber(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

function toCacheKey(input: SavedProjectsInput | void): string {
  const scoped = input as SavedProjectsInput | undefined;
  const offset = normalizeNumber(scoped?.offset);
  const limit = normalizeNumber(scoped?.limit);
  return `offset:${offset ?? 'default'}:limit:${limit ?? 'default'}`;
}

let initialized = false;

export function initializeProjectResolvers(): void {
  if (initialized) return;
  initialized = true;

  const savedProjectsResolver: ResolverDefinition<SavedProjectsInput | void, SavedGameProjectSummary[]> = {
    id: RESOLVER_ID_SAVED_PROJECTS,
    label: 'Saved Game Projects Catalog Resolver',
    owner: 'game',
    tags: ['catalog', 'projects', 'snapshots'],
    cachePolicy: 'memory_ttl',
    cacheTtlMs: 10_000,
    getCacheKey: toCacheKey,
    run: async (input) => {
      const scoped = input as SavedProjectsInput | undefined;
      const offset = normalizeNumber(scoped?.offset);
      const limit = normalizeNumber(scoped?.limit);
      return listSavedGameProjects({
        ...(offset != null ? { offset } : {}),
        ...(limit != null ? { limit } : {}),
      });
    },
  };

  resolverRegistry.register(savedProjectsResolver);
}

export async function resolveSavedGameProjects(
  input: SavedProjectsInput = {},
  options: ResolverConsumerOptions = {},
): Promise<SavedGameProjectSummary[]> {
  initializeProjectResolvers();
  return resolverRegistry.run<SavedProjectsInput, SavedGameProjectSummary[]>(
    RESOLVER_ID_SAVED_PROJECTS,
    input,
    {
      consumerId: options.consumerId ?? 'saved-projects:unknown-consumer',
      bypassCache: options.bypassCache,
    },
  );
}

export const projectResolverIds = {
  savedProjects: RESOLVER_ID_SAVED_PROJECTS,
} as const;

