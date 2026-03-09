#!/usr/bin/env tsx

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureBuiltInTestCatalogRegistered,
  resetTestCatalogForTesting,
  testProfileRegistry,
  testSuiteRegistry,
  type TestProfileDefinition,
  type TestSuiteDefinition,
} from '../../apps/main/src/features/devtools/services/testCatalogRegistry.ts';

interface CatalogPayload {
  version: number;
  source: string;
  profiles: CatalogProfileRecord[];
  suites: CatalogSuiteRecord[];
}

interface CatalogProfileRecord {
  id: string;
  label: string;
  command: string;
  description: string;
  targets: string[];
  tags: string[];
  order: number | null;
  run_request: Record<string, unknown>;
}

interface CatalogSuiteRecord {
  id: string;
  label: string;
  path: string;
  layer: 'backend' | 'frontend' | 'scripts';
  kind: string | null;
  category: string | null;
  subcategory: string | null;
  covers: string[];
  order: number | null;
}

function getArgValue(flag: string, args: string[]): string | undefined {
  const prefixed = args.find((arg) => arg.startsWith(`${flag}=`));
  if (prefixed) {
    return prefixed.slice(flag.length + 1);
  }
  const index = args.indexOf(flag);
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

function sortByOrderThenLabel<T extends { order?: number; label: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.label.localeCompare(b.label);
  });
}

function sortRecordKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecordKeys);
  }
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      result[key] = sortRecordKeys(input[key]);
    }
    return result;
  }
  return value;
}

function toProfileRecord(profile: TestProfileDefinition): CatalogProfileRecord {
  return {
    id: profile.id,
    label: profile.label,
    command: profile.command,
    description: profile.description,
    targets: [...profile.targets],
    tags: [...profile.tags],
    order: profile.order ?? null,
    run_request: sortRecordKeys(profile.runRequest) as Record<string, unknown>,
  };
}

function toSuiteRecord(suite: TestSuiteDefinition): CatalogSuiteRecord {
  return {
    id: suite.id,
    label: suite.label,
    path: suite.path,
    layer: suite.layer,
    kind: suite.kind ?? null,
    category: suite.category ?? null,
    subcategory: suite.subcategory ?? null,
    covers: suite.covers ? [...suite.covers] : [],
    order: suite.order ?? null,
  };
}

function buildCatalogPayload(): CatalogPayload {
  resetTestCatalogForTesting();
  ensureBuiltInTestCatalogRegistered();

  const profiles = sortByOrderThenLabel(testProfileRegistry.getAll()).map(toProfileRecord);
  const suites = sortByOrderThenLabel(testSuiteRegistry.getAll()).map(toSuiteRecord);

  return {
    version: 1,
    source: 'apps/main/src/features/devtools/services/testCatalogRegistry.ts',
    profiles,
    suites,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');
  const outArg = getArgValue('--out', args);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const root = path.resolve(__dirname, '../..');
  const outPath = path.resolve(root, outArg ?? 'scripts/tests/test-catalog.json');

  const payload = buildCatalogPayload();
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  let existing = '';
  try {
    existing = readFileSync(outPath, 'utf8');
  } catch {
    existing = '';
  }

  if (checkMode) {
    if (existing !== serialized) {
      console.error(`[test-catalog] Drift detected for ${path.relative(root, outPath)}`);
      console.error('[test-catalog] Run: pnpm test:catalog:gen');
      process.exit(1);
    }
    console.log(`[test-catalog] Up to date: ${path.relative(root, outPath)}`);
    return;
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, serialized, 'utf8');
  console.log(`[test-catalog] Generated ${path.relative(root, outPath)}`);
}

main();
