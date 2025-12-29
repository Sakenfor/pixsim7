#!/usr/bin/env npx tsx
/**
 * Type Drift Detection Script
 *
 * Detects when a manually-defined interface in game.ts shares a name with
 * an OpenAPI schema, indicating potential duplication that should be aliased.
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
const OPENAPI_TS = path.join(TYPES_DIR, 'openapi.generated.ts');

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

function extractOpenAPISchemas(content: string): Set<string> {
  // Match "readonly SchemaName:" in the schemas section
  const schemaRegex = /readonly (\w+):/g;
  const schemas = new Set<string>();
  let match;
  while ((match = schemaRegex.exec(content)) !== null) {
    schemas.add(match[1]);
  }
  return schemas;
}

function main() {
  console.log('Checking for type drift between game.ts and OpenAPI schemas...\n');

  const gameContent = fs.readFileSync(GAME_TS, 'utf-8');
  const openapiContent = fs.readFileSync(OPENAPI_TS, 'utf-8');

  const manualInterfaces = extractManualInterfaces(gameContent);
  const openapiSchemas = extractOpenAPISchemas(openapiContent);

  const drifted: string[] = [];

  for (const iface of manualInterfaces) {
    if (openapiSchemas.has(iface)) {
      drifted.push(iface);
    }
  }

  if (drifted.length === 0) {
    console.log('No drift detected. All manual interfaces are unique.');
    process.exit(0);
  } else {
    console.log('DRIFT DETECTED! The following interfaces exist in both game.ts and OpenAPI:\n');
    for (const name of drifted) {
      console.log(`  - ${name}`);
    }
    console.log('\nConsider aliasing these from OpenAPI instead of duplicating:');
    console.log("  export type Foo = ApiComponents['schemas']['Foo'];");
    console.log('\nOr mark them as [frontend-only] if they intentionally differ.');
    process.exit(1);
  }
}

main();
