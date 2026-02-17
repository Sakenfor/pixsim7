#!/usr/bin/env npx tsx
/**
 * Type Drift Detection Script
 *
 * Detects when a manually-defined interface in game.ts shares a name with
 * an Orval-generated model type, indicating potential duplication that should be imported.
 *
 * Usage:
 *   npx tsx scripts/check-type-drift.ts
 *
 * This script is referenced by the TODO in packages/shared/types/src/game.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const TYPES_DIR = path.join(__dirname, '../packages/shared/types/src');
const GAME_TS = path.join(TYPES_DIR, 'game.ts');
const MODEL_BARREL = path.join(
  __dirname,
  '../packages/shared/api/client/src/generated/openapi/model/index.ts'
);

function extractManualInterfaces(content: string): string[] {
  // Match "export interface Foo" that are NOT type aliases
  // Skip lines that are already aliased (export type Foo = ...)
  const interfaceRegex = /^export interface (\w+)/gm;
  const matches: string[] = [];
  let match;
  while ((match = interfaceRegex.exec(content)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function extractOrvalModelTypes(content: string): Set<string> {
  // Orval barrel file has lines like: export * from './accountResponse';
  // Convert the file stem to PascalCase type name
  const reExportRegex = /export \* from '\.\/(\w+)'/g;
  const types = new Set<string>();
  let match;
  while ((match = reExportRegex.exec(content)) !== null) {
    // Convert camelCase file stem to PascalCase type name
    const stem = match[1];
    const pascalName = stem.charAt(0).toUpperCase() + stem.slice(1);
    types.add(pascalName);
  }
  return types;
}

function main() {
  console.log('Checking for type drift between game.ts and Orval model types...\n');

  const gameContent = fs.readFileSync(GAME_TS, 'utf-8');
  const modelContent = fs.readFileSync(MODEL_BARREL, 'utf-8');

  const manualInterfaces = extractManualInterfaces(gameContent);
  const orvalTypes = extractOrvalModelTypes(modelContent);

  const drifted: string[] = [];

  for (const iface of manualInterfaces) {
    if (orvalTypes.has(iface)) {
      drifted.push(iface);
    }
  }

  if (drifted.length === 0) {
    console.log('No drift detected. All manual interfaces are unique.');
    process.exit(0);
  } else {
    console.log('DRIFT DETECTED! The following interfaces exist in both game.ts and Orval model:\n');
    for (const name of drifted) {
      console.log(`  - ${name}`);
    }
    console.log('\nConsider importing these from Orval instead of duplicating:');
    console.log("  import type { Foo } from '@pixsim7/shared.api.client/model';");
    console.log('\nOr mark them as [frontend-only] if they intentionally differ.');
    process.exit(1);
  }
}

main();
