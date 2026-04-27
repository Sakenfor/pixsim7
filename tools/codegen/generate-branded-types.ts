#!/usr/bin/env tsx
/**
 * Generates branded ID types from the backend entity_ref.py declarations.
 *
 * Single source of truth: pixsim7/backend/main/shared/schemas/entity_ref.py
 * Looks for `_make_entity_ref_type("xxx")` calls (and `entity_ref_field("xxx")`)
 * to discover all registered entity types, then generates:
 *   1. Branded ID types     (e.g., AssetId = Brand<number, 'AssetId'>)
 *   2. String ref types     (e.g., AssetRef = `asset:${number}`)
 *   3. ID constructors      (e.g., AssetId(123) -> branded number)
 *   4. Ref builders         (e.g., Ref.asset(123) -> "asset:123")
 *   5. Entity-type registry for runtime use
 *
 * Why scan the source file instead of OpenAPI:
 *   - Branded types should exist *before* the first DTO uses them, so
 *     declaration is the right trigger, not API exposure.
 *   - No backend-runtime dependency — `branded:check` runs in CI without
 *     starting a server.
 *
 * The generated file complements (does not replace) the manual ids.ts file.
 *
 * Default source: pixsim7/backend/main/shared/schemas/entity_ref.py
 * Default output: packages/shared/types/src/ids.generated.ts
 *
 * Usage:
 *   pnpm branded:gen          # Generate branded types
 *   pnpm branded:check        # Check if types are up-to-date (CI)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const DEFAULT_SOURCE = 'pixsim7/backend/main/shared/schemas/entity_ref.py';
const DEFAULT_OUT = 'packages/shared/types/src/ids.generated.ts';

/**
 * Entity types that look like EntityRef declarations but cannot use the
 * int-id branded shape generated here. They are defined manually in
 * `packages/shared/types/src/ids.ts` instead.
 *
 * Currently:
 *   - prompt_version: UUID primary key (PromptVersion.id), not int-keyed
 */
const EXCLUDED_TYPES = new Set<string>(['prompt_version']);

/**
 * Scan entity_ref.py for _make_entity_ref_type("xxx") and entity_ref_field("xxx") calls.
 * Returns the set of entity-type strings.
 */
function extractEntityTypes(source: string): Set<string> {
  // Strip triple-quoted Python docstrings to avoid matching example calls in docs.
  const stripped = source.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '');

  const types = new Set<string>();
  // Matches: _make_entity_ref_type("xxx") or _make_entity_ref_type('xxx')
  // Also: entity_ref_field("xxx") for ad-hoc declarations
  const pattern = /(?:_make_entity_ref_type|entity_ref_field)\(\s*["']([a-z_][a-z0-9_]*)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripped)) !== null) {
    if (EXCLUDED_TYPES.has(match[1])) continue;
    types.add(match[1]);
  }
  return types;
}

function toPascalCase(str: string): string {
  return str
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function generateBrandedTypes(entityTypes: Set<string>, sourceRel: string): string {
  const sorted = Array.from(entityTypes).sort();

  const lines: string[] = [
    '/**',
    ' * Auto-generated branded ID types from backend entity_ref.py declarations.',
    ' * DO NOT EDIT MANUALLY - regenerate with: pnpm branded:gen',
    ' *',
    ` * Source: ${sourceRel}`,
    ' *',
    ' * Only emits branded numeric IDs + their constructors and the entity-type',
    ' * registry. String ref types and the `Ref` builder are owned by',
    ' * `@pixsim7/shared.ref.core`, which has richer support (UUIDs, scene',
    ' * subtypes, parsers).',
    ' */',
    '',
    "import type { Brand } from './_brand';",
    '',
    '// ============================================================================',
    '// BRANDED NUMERIC IDS',
    '// ============================================================================',
    '',
  ];

  for (const entityType of sorted) {
    const pascalName = toPascalCase(entityType);
    lines.push(`export type ${pascalName}Id = Brand<number, '${pascalName}Id'>;`);
  }

  lines.push('');
  lines.push('// ============================================================================');
  lines.push('// ID CONSTRUCTORS');
  lines.push('// ============================================================================');
  lines.push('');

  for (const entityType of sorted) {
    const pascalName = toPascalCase(entityType);
    lines.push(
      `export const ${pascalName}Id = (n: number): ${pascalName}Id => n as ${pascalName}Id;`
    );
  }

  lines.push('');
  lines.push('// ============================================================================');
  lines.push('// ENTITY TYPE REGISTRY');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export const ENTITY_TYPES = [');
  for (const entityType of sorted) {
    lines.push(`  '${entityType}',`);
  }
  lines.push('] as const;');
  lines.push('');
  lines.push('export type EntityType = (typeof ENTITY_TYPES)[number];');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const isCheckMode = process.argv.includes('--check');
  const sourceRel = process.env.ENTITY_REF_SOURCE || DEFAULT_SOURCE;
  const outRel = process.env.BRANDED_TYPES_OUT || DEFAULT_OUT;

  const sourceAbs = path.resolve(process.cwd(), sourceRel);
  const outAbs = path.resolve(process.cwd(), outRel);

  let source: string;
  try {
    source = await fs.readFile(sourceAbs, 'utf8');
  } catch (err) {
    console.error(`Failed to read entity_ref source: ${sourceAbs}`);
    console.error(err);
    process.exit(1);
  }

  const entityTypes = extractEntityTypes(source);

  if (entityTypes.size === 0) {
    console.error(
      `No entity-type declarations found in ${sourceRel}. ` +
        `Expected calls like _make_entity_ref_type("foo") or entity_ref_field("foo").`
    );
    process.exit(1);
  }

  console.log(
    `Found ${entityTypes.size} entity types: ${Array.from(entityTypes).sort().join(', ')}`
  );

  const generated = generateBrandedTypes(entityTypes, sourceRel);

  if (isCheckMode) {
    let existing = '';
    try {
      existing = await fs.readFile(outAbs, 'utf8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error(`Branded types file does not exist: ${outRel}`);
        console.error('  Run `pnpm branded:gen` to generate it.');
        process.exit(1);
      }
      throw err;
    }

    if (existing === generated) {
      console.log(`Branded types are up-to-date: ${outRel}`);
      process.exit(0);
    } else {
      console.error(`Branded types are STALE: ${outRel}`);
      console.error('  Run `pnpm branded:gen` to update them.');
      process.exit(1);
    }
  } else {
    await fs.mkdir(path.dirname(outAbs), { recursive: true });
    await fs.writeFile(outAbs, generated, 'utf8');
    console.log(`Generated branded types: ${outRel}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
