import type { DockviewApi } from 'dockview-core';

import type { DockviewHost } from './host';
import { getDockviewApi, getDockviewHost } from './hostRegistry';

export interface ResolveDockviewResult {
  host?: DockviewHost;
  api?: DockviewApi;
}

export function resolveDockview(
  dockviewId?: string,
  fallback: ResolveDockviewResult = {},
): ResolveDockviewResult {
  if (!dockviewId) return fallback;
  const host = getDockviewHost(dockviewId) ?? fallback.host;
  const api = host?.api ?? getDockviewApi(dockviewId) ?? fallback.api;
  return { host, api };
}

export function resolveDockviewHost(
  dockviewId?: string,
  fallback?: DockviewHost,
): DockviewHost | undefined {
  return resolveDockview(dockviewId, { host: fallback }).host;
}

export function resolveDockviewApi(
  dockviewId?: string,
  fallback?: DockviewApi,
  fallbackHost?: DockviewHost,
): DockviewApi | undefined {
  return resolveDockview(dockviewId, { api: fallback, host: fallbackHost }).api;
}
