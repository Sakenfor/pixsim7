import {
  exportWorldProject as exportWorldProjectCore,
  importWorldProject as importWorldProjectCore,
  type GameProjectBundle,
} from '@lib/api';

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

function buildModuleEnabledMap(bundle: GameProjectBundle): Map<string, boolean> {
  const map = new Map<string, boolean>();
  const modules = Array.isArray(bundle.modules) ? bundle.modules : [];

  for (const moduleRef of modules) {
    const extensionKey = readModuleExtensionKey(moduleRef);
    if (!extensionKey) {
      continue;
    }

    const enabled = (moduleRef as { enabled?: unknown }).enabled;
    map.set(extensionKey, enabled !== false);
  }

  return map;
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

  const extensionEntries = Object.entries(bundle.extensions || {});
  for (const [key, rawPayload] of extensionEntries) {
    const handler = projectBundleExtensionRegistry.get(key);
    if (!handler) {
      extensionReport.unknown.push(key);
      continue;
    }

    if (moduleEnabledMap.get(key) === false) {
      extensionReport.skipped.push(key);
      extensionReport.warnings.push(`${key}: skipped because module is disabled`);
      continue;
    }

    if (!handler.import) {
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
            extensionReport.failed.push(key);
            extensionReport.warnings.push(
              `migrate ${key}: migration returned null (v${payloadVersion} → v${handlerVersion})`,
            );
            continue;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          extensionReport.failed.push(key);
          extensionReport.warnings.push(`migrate ${key}: ${message}`);
          continue;
        }
      } else {
        extensionReport.warnings.push(
          `${key}: version mismatch (payload v${payloadVersion}, handler v${handlerVersion}) — no migrate function, attempting import anyway`,
        );
      }
    }

    try {
      const outcome = await handler.import(payload, { bundle, response });
      extensionReport.applied.push(key);
      extensionReport.warnings.push(...toWarnings(outcome));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      extensionReport.failed.push(key);
      extensionReport.warnings.push(`import ${key}: ${message}`);
    }
  }

  return { response, extensionReport };
}
