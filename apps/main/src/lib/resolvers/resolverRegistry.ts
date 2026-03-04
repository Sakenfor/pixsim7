import { createRegistry, type Registry } from '@pixsim7/shared.helpers.core';

export type ResolverCachePolicy = 'none' | 'memory_ttl';

export interface ResolverRunContext {
  consumerId?: string;
  signal?: AbortSignal;
}

export interface ResolverDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  label?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  enabled?: () => boolean;
  cachePolicy?: ResolverCachePolicy;
  cacheTtlMs?: number;
  getCacheKey?: (input: TInput) => string | null | undefined;
  run: (input: TInput, context: ResolverRunContext) => Promise<TOutput> | TOutput;
}

export interface ResolverRunOptions {
  consumerId?: string;
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export interface ResolverConsumptionRecord {
  resolverId: string;
  consumerId: string;
  lastSeenAt: number;
  firstSeenAt: number;
  lastDurationMs: number;
  avgDurationMs: number;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  cacheHitCalls: number;
  lastStatus: 'ok' | 'error';
  lastError?: string;
}

export interface ResolverRunEvent {
  resolverId: string;
  consumerId: string;
  startedAt: number;
  durationMs: number;
  status: 'ok' | 'error';
  cacheHit: boolean;
  error?: string;
}

export interface ResolverRegistryOptions {
  defaultCacheTtlMs?: number;
  consumptionThrottleMs?: number;
}

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

function nowMs(): number {
  return Date.now();
}

function defaultConsumerId(): string {
  return 'unknown-consumer';
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isResolverCacheEnabled(definition: ResolverDefinition): boolean {
  return (definition.cachePolicy ?? 'none') === 'memory_ttl';
}

function getResolverCacheTtlMs(
  definition: ResolverDefinition,
  defaultCacheTtlMs: number,
): number {
  const configured = definition.cacheTtlMs;
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return defaultCacheTtlMs;
}

function defaultCacheKey(input: unknown): string | null {
  if (input === undefined) return '__undefined__';
  try {
    return JSON.stringify(input);
  } catch {
    return null;
  }
}

export class ResolverRegistry {
  private readonly registry: Registry<string, ResolverDefinition>;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly consumption = new Map<string, ResolverConsumptionRecord>();
  private readonly listeners = new Set<(event: ResolverRunEvent) => void>();

  private readonly defaultCacheTtlMs: number;
  private consumptionThrottleMs: number;

  constructor(options: ResolverRegistryOptions = {}) {
    this.defaultCacheTtlMs = Math.max(1, options.defaultCacheTtlMs ?? 60_000);
    this.consumptionThrottleMs = Math.max(0, options.consumptionThrottleMs ?? 250);
    this.registry = createRegistry<string, ResolverDefinition>({
      label: 'ResolverRegistry',
      warnOnOverwrite: true,
    });
  }

  register(definition: ResolverDefinition): () => void {
    return this.registry.register(definition.id, definition);
  }

  unregister(resolverId: string): boolean {
    this.clearResolverCache(resolverId);
    return this.registry.unregister(resolverId);
  }

  get<TInput = unknown, TOutput = unknown>(
    resolverId: string,
  ): ResolverDefinition<TInput, TOutput> | undefined {
    return this.registry.get(resolverId) as ResolverDefinition<TInput, TOutput> | undefined;
  }

  has(resolverId: string): boolean {
    return this.registry.has(resolverId);
  }

  keys(): string[] {
    return this.registry.keys();
  }

  getAll(): ResolverDefinition[] {
    return Array.from(this.registry.getAll().values());
  }

  subscribe(listener: (event: ResolverRunEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setConsumptionThrottleMs(ms: number): void {
    this.consumptionThrottleMs = Math.max(0, ms);
  }

  getConsumptionThrottleMs(): number {
    return this.consumptionThrottleMs;
  }

  getConsumptionForResolver(resolverId: string): ResolverConsumptionRecord[] {
    return Array.from(this.consumption.values()).filter((row) => row.resolverId === resolverId);
  }

  getConsumptionForConsumer(consumerId: string): ResolverConsumptionRecord[] {
    return Array.from(this.consumption.values()).filter((row) => row.consumerId === consumerId);
  }

  getAllConsumption(): ResolverConsumptionRecord[] {
    return Array.from(this.consumption.values());
  }

  clearConsumptionForConsumer(consumerId: string): void {
    for (const [key, value] of this.consumption.entries()) {
      if (value.consumerId === consumerId) {
        this.consumption.delete(key);
      }
    }
  }

  clearAllConsumption(): void {
    this.consumption.clear();
  }

  clearResolverCache(resolverId: string): void {
    const prefix = `${resolverId}::`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clearAllCache(): void {
    this.cache.clear();
  }

  async run<TInput = unknown, TOutput = unknown>(
    resolverId: string,
    input: TInput,
    options: ResolverRunOptions = {},
  ): Promise<TOutput> {
    const definition = this.get<TInput, TOutput>(resolverId);
    if (!definition) {
      throw new Error(`resolver_not_found:${resolverId}`);
    }
    if (definition.enabled && !definition.enabled()) {
      throw new Error(`resolver_disabled:${resolverId}`);
    }

    const consumerId = options.consumerId ?? defaultConsumerId();
    const startedAt = nowMs();

    const cached = this.readFromCache(definition, resolverId, input, options.bypassCache === true);
    if (cached.hit) {
      const durationMs = nowMs() - startedAt;
      const event: ResolverRunEvent = {
        resolverId,
        consumerId,
        startedAt,
        durationMs,
        status: 'ok',
        cacheHit: true,
      };
      this.recordConsumption(event);
      this.notify(event);
      return cached.value as TOutput;
    }

    try {
      const value = await definition.run(input, {
        consumerId,
        signal: options.signal,
      });
      this.writeToCache(definition, resolverId, input, value, options.bypassCache === true);
      const durationMs = nowMs() - startedAt;
      const event: ResolverRunEvent = {
        resolverId,
        consumerId,
        startedAt,
        durationMs,
        status: 'ok',
        cacheHit: false,
      };
      this.recordConsumption(event);
      this.notify(event);
      return value;
    } catch (error) {
      const durationMs = nowMs() - startedAt;
      const event: ResolverRunEvent = {
        resolverId,
        consumerId,
        startedAt,
        durationMs,
        status: 'error',
        cacheHit: false,
        error: toErrorMessage(error),
      };
      this.recordConsumption(event);
      this.notify(event);
      throw error;
    }
  }

  private readFromCache(
    definition: ResolverDefinition,
    resolverId: string,
    input: unknown,
    bypassCache: boolean,
  ): { hit: boolean; value?: unknown } {
    if (bypassCache || !isResolverCacheEnabled(definition)) {
      return { hit: false };
    }
    const cacheKey = this.resolveCacheKey(definition, resolverId, input);
    if (!cacheKey) return { hit: false };
    const cached = this.cache.get(cacheKey);
    if (!cached) return { hit: false };
    if (cached.expiresAt <= nowMs()) {
      this.cache.delete(cacheKey);
      return { hit: false };
    }
    return { hit: true, value: cached.value };
  }

  private writeToCache(
    definition: ResolverDefinition,
    resolverId: string,
    input: unknown,
    value: unknown,
    bypassCache: boolean,
  ): void {
    if (bypassCache || !isResolverCacheEnabled(definition)) {
      return;
    }
    const cacheKey = this.resolveCacheKey(definition, resolverId, input);
    if (!cacheKey) return;
    const ttlMs = getResolverCacheTtlMs(definition, this.defaultCacheTtlMs);
    this.cache.set(cacheKey, {
      value,
      expiresAt: nowMs() + ttlMs,
    });
  }

  private resolveCacheKey(
    definition: ResolverDefinition,
    resolverId: string,
    input: unknown,
  ): string | null {
    const rawKey =
      definition.getCacheKey?.(input) ??
      defaultCacheKey(input);
    if (rawKey == null || rawKey === '') return null;
    return `${resolverId}::${rawKey}`;
  }

  private recordConsumption(event: ResolverRunEvent): void {
    const key = `${event.resolverId}::${event.consumerId}`;
    const existing = this.consumption.get(key);
    const currentTime = nowMs();

    if (
      existing &&
      event.status === 'ok' &&
      event.cacheHit &&
      this.consumptionThrottleMs > 0 &&
      currentTime - existing.lastSeenAt < this.consumptionThrottleMs
    ) {
      return;
    }

    if (!existing) {
      this.consumption.set(key, {
        resolverId: event.resolverId,
        consumerId: event.consumerId,
        firstSeenAt: currentTime,
        lastSeenAt: currentTime,
        lastDurationMs: event.durationMs,
        avgDurationMs: event.durationMs,
        totalCalls: 1,
        successCalls: event.status === 'ok' ? 1 : 0,
        errorCalls: event.status === 'error' ? 1 : 0,
        cacheHitCalls: event.cacheHit ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error,
      });
      return;
    }

    const totalCalls = existing.totalCalls + 1;
    const avgDurationMs =
      ((existing.avgDurationMs * existing.totalCalls) + event.durationMs) / totalCalls;

    this.consumption.set(key, {
      ...existing,
      lastSeenAt: currentTime,
      lastDurationMs: event.durationMs,
      avgDurationMs,
      totalCalls,
      successCalls: existing.successCalls + (event.status === 'ok' ? 1 : 0),
      errorCalls: existing.errorCalls + (event.status === 'error' ? 1 : 0),
      cacheHitCalls: existing.cacheHitCalls + (event.cacheHit ? 1 : 0),
      lastStatus: event.status,
      lastError: event.error,
    });
  }

  private notify(event: ResolverRunEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors should not break resolver execution.
      }
    }
  }
}

export const resolverRegistry = new ResolverRegistry();
