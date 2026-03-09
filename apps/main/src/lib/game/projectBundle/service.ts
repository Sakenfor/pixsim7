import {
  exportWorldProject as exportWorldProjectCore,
  importWorldProject as importWorldProjectCore,
  type GameProjectBundle,
} from '@lib/api';

import { ProjectBundleRuntimeLifecycleTracker } from './lifecycle';
import {
  PROJECT_BUNDLE_EXTENSION_KEY_PATTERN,
  projectBundleExtensionRegistry,
} from './registry';
import type {
  ExportWorldProjectWithExtensionsResult,
  ImportWorldProjectWithExtensionsResult,
} from './types';

function toWarnings(outcome: unknown): string[] {
  if (!outcome || typeof outcome !== 'object') {
    return [];
  }

  const warnings = (outcome as { warnings?: unknown }).warnings;
  if (!Array.isArray(warnings)) {
    return [];
  }
  return warnings.filter((entry): entry is string => typeof entry === 'string');
}

function readModuleExtensionKey(moduleRef: unknown): string | null {
  if (!moduleRef || typeof moduleRef !== 'object') {
    return null;
  }

  const moduleRecord = moduleRef as { id?: unknown; meta?: unknown };
  const id = typeof moduleRecord.id === 'string' ? moduleRecord.id.trim() : '';
  if (id && PROJECT_BUNDLE_EXTENSION_KEY_PATTERN.test(id)) {
    return id;
  }

  const meta = moduleRecord.meta;
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  const extensionKey = typeof (meta as { extension_key?: unknown }).extension_key === 'string'
    ? (meta as { extension_key?: string }).extension_key?.trim()
    : '';
  if (extensionKey && PROJECT_BUNDLE_EXTENSION_KEY_PATTERN.test(extensionKey)) {
    return extensionKey;
  }

  return null;
}

function buildModuleEnabledMap(bundle: GameProjectBundle): Map<string, { enabled: boolean }> {
  const map = new Map<string, { enabled: boolean }>();
  const modules = Array.isArray(bundle.modules) ? bundle.modules : [];

  for (const moduleRef of modules) {
    const extensionKey = readModuleExtensionKey(moduleRef);
    if (!extensionKey) {
      continue;
    }

    const enabled = (moduleRef as { enabled?: unknown }).enabled;
    map.set(extensionKey, { enabled: enabled !== false });
  }

  return map;
}

function isModuleEnabled(
  extensionKey: string,
  moduleEnabledMap: Map<string, { enabled: boolean }>,
): boolean {
  return moduleEnabledMap.get(extensionKey)?.enabled !== false;
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
  }

  return JSON.stringify(String(value));
}

function buildImportFingerprint(
  extensionKey: string,
  payload: unknown,
  handlerVersion: number | undefined,
): string {
  return stableSerialize({
    extensionKey,
    handlerVersion: handlerVersion ?? null,
    payload,
  });
}

function readImportedWorldId(response: unknown): number | null {
  if (!response || typeof response !== 'object') {
    return null;
  }
  const worldId = (response as { world_id?: unknown }).world_id;
  return typeof worldId === 'number' && Number.isFinite(worldId) ? worldId : null;
}

function buildImportCacheKey(worldId: number | null, extensionKey: string): string {
  return `${worldId ?? 'unknown'}::${extensionKey}`;
}

function clearCachedImportStateForWorldExtension(worldId: number | null, extensionKey: string): void {
  extensionImportReplayCache.delete(buildImportCacheKey(worldId, extensionKey));
}

function pruneRemovedExtensionsForWorld(
  worldId: number | null,
  retainedExtensionKeys: Set<string>,
): string[] {
  const worldPrefix = `${worldId ?? 'unknown'}::`;
  const removed: string[] = [];
  for (const key of Array.from(extensionImportReplayCache.keys())) {
    if (!key.startsWith(worldPrefix)) {
      continue;
    }
    const extensionKey = key.slice(worldPrefix.length);
    if (retainedExtensionKeys.has(extensionKey)) {
      continue;
    }
    extensionImportReplayCache.delete(key);
    removed.push(extensionKey);
  }
  return removed;
}

function assertCanImportModule(
  extensionKey: string,
  moduleEnabledMap: Map<string, { enabled: boolean }>,
): void {
  if (isModuleEnabled(extensionKey, moduleEnabledMap)) {
    return;
  }
  throw new Error(`project_bundle_module_disabled:${extensionKey}`);
}

const extensionImportReplayCache = new Map<string, { fingerprint: string }>();

// Test-only utility to keep import replay checks deterministic across suites.
export function __resetProjectBundleRuntimeImportCacheForTests(): void {
  extensionImportReplayCache.clear();
}

function buildModuleEntriesForIncludedExtensions(
  baseBundle: GameProjectBundle,
  includedExtensionKeys: string[],
): GameProjectBundle['modules'] {
  const modules = Array.isArray(baseBundle.modules) ? [...baseBundle.modules] : [];
  const existingIds = new Set(
    modules
      .map((entry) => (typeof entry?.id === 'string' ? entry.id.trim() : ''))
      .filter((entry) => entry.length > 0),
  );

  for (const key of includedExtensionKeys) {
    if (existingIds.has(key)) {
      continue;
    }

    const handler = projectBundleExtensionRegistry.get(key);
    modules.push({
      id: key,
      enabled: true,
      version: handler?.version != null ? String(handler.version) : undefined,
      capabilities: ['project_bundle.extension'],
      meta: {
        extension_key: key,
        source: 'project_bundle_extension_registry',
      },
    });
    existingIds.add(key);
  }

  return modules;
}

export async function exportWorldProjectWithExtensions(
  worldId: number,
): Promise<ExportWorldProjectWithExtensionsResult> {
  const baseBundle = await exportWorldProjectCore(worldId);
  const extensions: Record<string, unknown> = { ...(baseBundle.extensions || {}) };

  const extensionReport: ExportWorldProjectWithExtensionsResult['extensionReport'] = {
    included: [],
    skipped: [],
    warnings: [],
  };

  for (const handler of projectBundleExtensionRegistry.list()) {
    if (!handler.export) {
      extensionReport.skipped.push(handler.key);
      continue;
    }

    try {
      const payload = await handler.export({ worldId, bundle: baseBundle });
      if (payload === null || payload === undefined) {
        extensionReport.skipped.push(handler.key);
        continue;
      }

      extensions[handler.key] = payload;
      extensionReport.included.push(handler.key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      extensionReport.warnings.push(`export ${handler.key}: ${message}`);
    }
  }

  return {
    bundle: {
      ...baseBundle,
      modules: buildModuleEntriesForIncludedExtensions(baseBundle, extensionReport.included),
      extensions,
    },
    extensionReport,
  };
}

export async function importWorldProjectWithExtensions(
  bundle: GameProjectBundle,
  opts?: { world_name_override?: string },
): Promise<ImportWorldProjectWithExtensionsResult> {
  const response = await importWorldProjectCore(bundle, opts);
  const extensionReport: ImportWorldProjectWithExtensionsResult['extensionReport'] = {
    applied: [],
    skipped: [],
    unknown: [],
    warnings: [],
    migrated: [],
    failed: [],
  };
  const moduleEnabledMap = buildModuleEnabledMap(bundle);

  const extensionKeys = new Set<string>();
  for (const key of Object.keys(bundle.extensions || {})) {
    extensionKeys.add(key);
  }
  for (const key of moduleEnabledMap.keys()) {
    extensionKeys.add(key);
  }
  for (const handler of projectBundleExtensionRegistry.list()) {
    extensionKeys.add(handler.key);
  }

  const lifecycle = new ProjectBundleRuntimeLifecycleTracker(extensionKeys);
  for (const handler of projectBundleExtensionRegistry.list()) {
    lifecycle.transition(handler.key, 'registered');
  }

  const importedWorldId = readImportedWorldId(response);
  for (const [key, moduleRef] of moduleEnabledMap.entries()) {
    if (moduleRef.enabled !== false) {
      continue;
    }
    lifecycle.transition(key, 'disabled');
    clearCachedImportStateForWorldExtension(importedWorldId, key);
  }

  const extensionEntries = Object.entries(bundle.extensions || {});
  const retainedWorldKeys = new Set<string>();
  for (const [key, rawPayload] of extensionEntries) {
    retainedWorldKeys.add(key);
    const handler = projectBundleExtensionRegistry.get(key);
    if (!handler) {
      lifecycle.transition(key, 'removed');
      extensionReport.unknown.push(key);
      continue;
    }

    if (!isModuleEnabled(key, moduleEnabledMap)) {
      lifecycle.transition(key, 'disabled');
      extensionReport.skipped.push(key);
      extensionReport.warnings.push(`${key}: skipped because module is disabled`);
      clearCachedImportStateForWorldExtension(importedWorldId, key);
      continue;
    }

    if (!handler.import) {
      lifecycle.transition(key, 'active');
      extensionReport.skipped.push(key);
      continue;
    }

    let payload = rawPayload;

    // Version migration
    const payloadVersion =
      typeof payload === 'object' && payload !== null && 'version' in payload
        ? (payload as { version?: unknown }).version
        : undefined;
    const handlerVersion = handler.version;

    if (
      handlerVersion != null &&
      typeof payloadVersion === 'number' &&
      payloadVersion !== handlerVersion
    ) {
      if (handler.migrate) {
        try {
          const migrated = handler.migrate(payload, payloadVersion, handlerVersion);
          if (migrated != null) {
            payload = migrated;
            extensionReport.migrated.push(key);
          } else {
            lifecycle.transition(key, 'removed');
            extensionReport.failed.push(key);
            extensionReport.warnings.push(
              `migrate ${key}: migration returned null (v${payloadVersion} -> v${handlerVersion})`,
            );
            continue;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          lifecycle.transition(key, 'removed');
          extensionReport.failed.push(key);
          extensionReport.warnings.push(`migrate ${key}: ${message}`);
          continue;
        }
      } else {
        extensionReport.warnings.push(
          `${key}: version mismatch (payload v${payloadVersion}, handler v${handlerVersion}) - no migrate function, attempting import anyway`,
        );
      }
    }

    try {
      assertCanImportModule(key, moduleEnabledMap);
    } catch (error) {
      lifecycle.transition(key, 'disabled');
      extensionReport.skipped.push(key);
      extensionReport.warnings.push(
        error instanceof Error ? error.message : String(error),
      );
      clearCachedImportStateForWorldExtension(importedWorldId, key);
      continue;
    }

    const replayFingerprint = buildImportFingerprint(key, payload, handler.version);
    const replayCacheKey = buildImportCacheKey(importedWorldId, key);
    const previousReplay = extensionImportReplayCache.get(replayCacheKey);
    if (previousReplay?.fingerprint === replayFingerprint) {
      lifecycle.transition(key, 'active');
      extensionReport.skipped.push(key);
      extensionReport.warnings.push(`${key}: skipped idempotent replay`);
      continue;
    }

    try {
      lifecycle.transition(key, 'imported');
      const outcome = await handler.import(payload, { bundle, response });
      lifecycle.transition(key, 'active');
      extensionReport.applied.push(key);
      extensionReport.warnings.push(...toWarnings(outcome));
      extensionImportReplayCache.set(replayCacheKey, {
        fingerprint: replayFingerprint,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lifecycle.transition(key, 'removed');
      extensionReport.failed.push(key);
      extensionReport.warnings.push(`import ${key}: ${message}`);
    }
  }

  const removedWorldKeys = pruneRemovedExtensionsForWorld(importedWorldId, retainedWorldKeys);
  for (const key of removedWorldKeys) {
    lifecycle.transition(key, 'removed');
  }

  return { response, extensionReport };
}
