import { listGameSessions, type GameSessionSummary } from '@lib/api';

import type { ResolverDefinition } from './resolverRegistry';
import { resolverRegistry } from './resolverRegistry';

const RESOLVER_ID_GAME_SESSIONS = 'game.catalog.sessions';

interface ResolverConsumerOptions {
  consumerId?: string;
  bypassCache?: boolean;
}

let initialized = false;

export function initializeSessionResolvers(): void {
  if (initialized) return;
  initialized = true;

  const sessionResolver: ResolverDefinition<void, GameSessionSummary[]> = {
    id: RESOLVER_ID_GAME_SESSIONS,
    label: 'Game Sessions Catalog Resolver',
    owner: 'game',
    tags: ['catalog', 'sessions'],
    cachePolicy: 'memory_ttl',
    cacheTtlMs: 5_000,
    getCacheKey: () => '__all__',
    run: async () => listGameSessions(),
  };

  resolverRegistry.register(sessionResolver);
}

export async function resolveGameSessions(
  options: ResolverConsumerOptions = {},
): Promise<GameSessionSummary[]> {
  initializeSessionResolvers();
  return resolverRegistry.run<void, GameSessionSummary[]>(RESOLVER_ID_GAME_SESSIONS, undefined, {
    consumerId: options.consumerId ?? 'sessions:unknown-consumer',
    bypassCache: options.bypassCache,
  });
}

export const sessionResolverIds = {
  gameSessions: RESOLVER_ID_GAME_SESSIONS,
} as const;

