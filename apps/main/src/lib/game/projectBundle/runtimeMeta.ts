export type ProjectRuntimeSeederMode = 'api' | 'direct';
export type ProjectRuntimeSyncMode =
  | 'two_way'
  | 'backend_to_file'
  | 'file_to_backend'
  | 'none';

export interface ProjectRuntimePreferences {
  seederMode: ProjectRuntimeSeederMode;
  syncMode: ProjectRuntimeSyncMode;
  watchEnabled: boolean;
}

export const DEFAULT_PROJECT_RUNTIME_PREFERENCES: ProjectRuntimePreferences = {
  seederMode: 'api',
  syncMode: 'two_way',
  watchEnabled: true,
};

export const PROJECT_RUNTIME_META_KEY = 'project_runtime';
export const PROJECT_META_RUNTIME_MODE = 'project_runtime_mode';
export const PROJECT_META_SYNC_MODE = 'project_sync_mode';
export const PROJECT_META_WATCH_ENABLED = 'project_watch_enabled';

export const LEGACY_BANANZA_RUNTIME_META_KEY = 'bananza_runtime';
export const LEGACY_BANANZA_META_SEEDER_MODE = 'bananza_seeder_mode';
export const LEGACY_BANANZA_META_SYNC_MODE = 'bananza_sync_mode';
export const LEGACY_BANANZA_META_WATCH_ENABLED = 'bananza_watch_enabled';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSeederMode(value: unknown): ProjectRuntimeSeederMode | null {
  return value === 'api' || value === 'direct' ? value : null;
}

function normalizeSyncMode(value: unknown): ProjectRuntimeSyncMode | null {
  return value === 'two_way' ||
    value === 'backend_to_file' ||
    value === 'file_to_backend' ||
    value === 'none'
    ? value
    : null;
}

function normalizeWatchEnabled(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

interface RuntimePreferencesResolved {
  mode: ProjectRuntimeSeederMode | null;
  syncMode: ProjectRuntimeSyncMode | null;
  watchEnabled: boolean | null;
}

function resolveRuntimePreferences(meta: Record<string, unknown>): RuntimePreferencesResolved {
  const runtime = isRecord(meta[PROJECT_RUNTIME_META_KEY])
    ? meta[PROJECT_RUNTIME_META_KEY]
    : isRecord(meta[LEGACY_BANANZA_RUNTIME_META_KEY])
      ? meta[LEGACY_BANANZA_RUNTIME_META_KEY]
      : {};

  return {
    mode:
      normalizeSeederMode(runtime.mode) ??
      normalizeSeederMode(runtime.seeder_mode) ??
      normalizeSeederMode(meta[PROJECT_META_RUNTIME_MODE]) ??
      normalizeSeederMode(meta[LEGACY_BANANZA_META_SEEDER_MODE]),
    syncMode:
      normalizeSyncMode(runtime.sync_mode) ??
      normalizeSyncMode(meta[PROJECT_META_SYNC_MODE]) ??
      normalizeSyncMode(meta[LEGACY_BANANZA_META_SYNC_MODE]),
    watchEnabled:
      normalizeWatchEnabled(runtime.watch_enabled) ??
      normalizeWatchEnabled(meta[PROJECT_META_WATCH_ENABLED]) ??
      normalizeWatchEnabled(meta[LEGACY_BANANZA_META_WATCH_ENABLED]),
  };
}

export function canonicalizeProjectRuntimeMeta(metaValue: unknown): Record<string, unknown> {
  const meta = isRecord(metaValue) ? { ...metaValue } : {};
  const resolved = resolveRuntimePreferences(meta);

  delete meta[LEGACY_BANANZA_RUNTIME_META_KEY];
  delete meta[LEGACY_BANANZA_META_SEEDER_MODE];
  delete meta[LEGACY_BANANZA_META_SYNC_MODE];
  delete meta[LEGACY_BANANZA_META_WATCH_ENABLED];

  const runtime: Record<string, unknown> = {};
  if (resolved.mode !== null) {
    runtime.mode = resolved.mode;
    meta[PROJECT_META_RUNTIME_MODE] = resolved.mode;
  }
  if (resolved.syncMode !== null) {
    runtime.sync_mode = resolved.syncMode;
    meta[PROJECT_META_SYNC_MODE] = resolved.syncMode;
  }
  if (resolved.watchEnabled !== null) {
    runtime.watch_enabled = resolved.watchEnabled;
    meta[PROJECT_META_WATCH_ENABLED] = resolved.watchEnabled;
  }

  if (Object.keys(runtime).length > 0) {
    meta[PROJECT_RUNTIME_META_KEY] = runtime;
  } else {
    delete meta[PROJECT_RUNTIME_META_KEY];
  }

  return meta;
}

export function readProjectRuntimePreferences(
  metaValue: unknown,
): ProjectRuntimePreferences {
  const canonicalMeta = canonicalizeProjectRuntimeMeta(metaValue);
  const resolved = resolveRuntimePreferences(canonicalMeta);
  return {
    seederMode: resolved.mode ?? DEFAULT_PROJECT_RUNTIME_PREFERENCES.seederMode,
    syncMode: resolved.syncMode ?? DEFAULT_PROJECT_RUNTIME_PREFERENCES.syncMode,
    watchEnabled: resolved.watchEnabled ?? DEFAULT_PROJECT_RUNTIME_PREFERENCES.watchEnabled,
  };
}

export function hasExplicitProjectRuntimePreferences(metaValue: unknown): boolean {
  const canonicalMeta = canonicalizeProjectRuntimeMeta(metaValue);
  const runtime = isRecord(canonicalMeta[PROJECT_RUNTIME_META_KEY])
    ? canonicalMeta[PROJECT_RUNTIME_META_KEY]
    : {};
  return (
    runtime.mode !== undefined ||
    runtime.sync_mode !== undefined ||
    runtime.watch_enabled !== undefined ||
    canonicalMeta[PROJECT_META_RUNTIME_MODE] !== undefined ||
    canonicalMeta[PROJECT_META_SYNC_MODE] !== undefined ||
    canonicalMeta[PROJECT_META_WATCH_ENABLED] !== undefined
  );
}

