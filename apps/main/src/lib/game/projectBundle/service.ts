import {
  exportWorldProject as exportWorldProjectCore,
  importWorldProject as importWorldProjectCore,
  type GameProjectBundle,
} from '@lib/api';

import { projectBundleExtensionRegistry } from './registry';
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
  };

  const extensionEntries = Object.entries(bundle.extensions || {});
  for (const [key, payload] of extensionEntries) {
    const handler = projectBundleExtensionRegistry.get(key);
    if (!handler) {
      extensionReport.unknown.push(key);
      continue;
    }

    if (!handler.import) {
      extensionReport.skipped.push(key);
      continue;
    }

    try {
      const outcome = await handler.import(payload, { bundle, response });
      extensionReport.applied.push(key);
      extensionReport.warnings.push(...toWarnings(outcome));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      extensionReport.warnings.push(`import ${key}: ${message}`);
    }
  }

  return { response, extensionReport };
}
