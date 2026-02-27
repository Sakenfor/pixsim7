import type {
  ResolutionRequest,
  ResolutionResult,
  ResolverWorkbenchSnapshot,
} from './types';

export const RESOLVER_WORKBENCH_SCHEMA_VERSION = 1;

export function createResolverWorkbenchSnapshot(input: {
  fixtureId?: string | null;
  request: ResolutionRequest;
  result?: ResolutionResult | null;
}): ResolverWorkbenchSnapshot {
  return {
    resolution_schema_version: RESOLVER_WORKBENCH_SCHEMA_VERSION,
    fixture_id: input.fixtureId ?? null,
    request: structuredClone(input.request),
    result: input.result ? structuredClone(input.result) : null,
  };
}

export function serializeResolverWorkbenchSnapshot(snapshot: ResolverWorkbenchSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function parseResolverWorkbenchSnapshot(raw: string): ResolverWorkbenchSnapshot {
  const parsed = JSON.parse(raw) as Partial<ResolverWorkbenchSnapshot>;
  if (
    !parsed
    || typeof parsed !== 'object'
    || typeof parsed.resolution_schema_version !== 'number'
    || !parsed.request
    || typeof parsed.request !== 'object'
  ) {
    throw new Error('Invalid resolver workbench snapshot');
  }
  return parsed as ResolverWorkbenchSnapshot;
}
