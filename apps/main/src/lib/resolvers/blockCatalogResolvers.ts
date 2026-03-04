import {
  getBlockCatalog,
  listContentPacks,
  listTemplates,
  type BlockCatalogQuery,
  type BlockCatalogRow,
  type BlockTemplateSummary,
  type ListTemplatesQuery,
} from '@lib/api/blockTemplates';

import type { ResolverDefinition } from './resolverRegistry';
import { resolverRegistry } from './resolverRegistry';

const RESOLVER_ID_BLOCK_TEMPLATES = 'blocks.catalog.templates';
const RESOLVER_ID_BLOCK_PRIMITIVES = 'blocks.catalog.primitives';
const RESOLVER_ID_CONTENT_PACKS = 'blocks.catalog.content-packs';

interface ResolverConsumerOptions {
  consumerId?: string;
  bypassCache?: boolean;
}

function stableKey(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableKey(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

let initialized = false;

export function initializeBlockCatalogResolvers(): void {
  if (initialized) return;
  initialized = true;

  const templatesResolver: ResolverDefinition<ListTemplatesQuery | void, BlockTemplateSummary[]> = {
    id: RESOLVER_ID_BLOCK_TEMPLATES,
    label: 'Block Templates Catalog Resolver',
    owner: 'prompts',
    tags: ['catalog', 'templates', 'blocks'],
    cachePolicy: 'memory_ttl',
    cacheTtlMs: 20_000,
    getCacheKey: (input) => stableKey(input ?? {}),
    run: async (input) => listTemplates((input as ListTemplatesQuery | undefined) ?? {}),
  };

  const primitivesResolver: ResolverDefinition<BlockCatalogQuery | void, BlockCatalogRow[]> = {
    id: RESOLVER_ID_BLOCK_PRIMITIVES,
    label: 'Block Primitives Catalog Resolver',
    owner: 'prompts',
    tags: ['catalog', 'primitives', 'blocks'],
    cachePolicy: 'memory_ttl',
    cacheTtlMs: 20_000,
    getCacheKey: (input) => stableKey(input ?? {}),
    run: async (input) => getBlockCatalog((input as BlockCatalogQuery | undefined) ?? {}),
  };

  const contentPacksResolver: ResolverDefinition<void, string[]> = {
    id: RESOLVER_ID_CONTENT_PACKS,
    label: 'Content Packs Catalog Resolver',
    owner: 'prompts',
    tags: ['catalog', 'content-packs'],
    cachePolicy: 'memory_ttl',
    cacheTtlMs: 30_000,
    getCacheKey: () => '__all__',
    run: async () => listContentPacks(),
  };

  resolverRegistry.register(templatesResolver);
  resolverRegistry.register(primitivesResolver);
  resolverRegistry.register(contentPacksResolver);
}

export async function resolveBlockTemplates(
  query: ListTemplatesQuery = {},
  options: ResolverConsumerOptions = {},
): Promise<BlockTemplateSummary[]> {
  initializeBlockCatalogResolvers();
  return resolverRegistry.run<ListTemplatesQuery, BlockTemplateSummary[]>(
    RESOLVER_ID_BLOCK_TEMPLATES,
    query,
    {
      consumerId: options.consumerId ?? 'block-templates:unknown-consumer',
      bypassCache: options.bypassCache,
    },
  );
}

export async function resolveBlockPrimitives(
  query: BlockCatalogQuery = {},
  options: ResolverConsumerOptions = {},
): Promise<BlockCatalogRow[]> {
  initializeBlockCatalogResolvers();
  return resolverRegistry.run<BlockCatalogQuery, BlockCatalogRow[]>(
    RESOLVER_ID_BLOCK_PRIMITIVES,
    query,
    {
      consumerId: options.consumerId ?? 'block-primitives:unknown-consumer',
      bypassCache: options.bypassCache,
    },
  );
}

export async function resolveContentPacks(
  options: ResolverConsumerOptions = {},
): Promise<string[]> {
  initializeBlockCatalogResolvers();
  return resolverRegistry.run<void, string[]>(RESOLVER_ID_CONTENT_PACKS, undefined, {
    consumerId: options.consumerId ?? 'content-packs:unknown-consumer',
    bypassCache: options.bypassCache,
  });
}

export const blockCatalogResolverIds = {
  templates: RESOLVER_ID_BLOCK_TEMPLATES,
  primitives: RESOLVER_ID_BLOCK_PRIMITIVES,
  contentPacks: RESOLVER_ID_CONTENT_PACKS,
} as const;

