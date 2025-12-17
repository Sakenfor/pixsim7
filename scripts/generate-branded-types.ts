#!/usr/bin/env tsx
/**
 * Generates branded ID types from OpenAPI schema x-entity-type extensions.
 *
 * This script reads the OpenAPI JSON and finds all fields annotated with
 * x-entity-type, then generates:
 *   1. Branded type definitions (e.g., AssetId = Brand<number, 'AssetId'>)
 *   2. Ref builder functions (e.g., Ref.asset(id) -> "asset:123")
 *   3. Type mappings for replacing raw IDs with branded types
 *
 * Default input:  http://localhost:8000/openapi.json
 * Default output: packages/shared/types/src/ids.generated.ts
 *
 * Usage:
 *   pnpm branded:gen          # Generate branded types
 *   pnpm branded:check        # Check if types are up-to-date
 *
 * The generated file complements (not replaces) the manual ids.ts file.
 * ids.ts contains hand-written utilities; ids.generated.ts contains
 * auto-discovered entity types from the backend.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface OpenAPISchema {
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
  paths?: Record<string, PathObject>;
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, PropertyObject>;
  allOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  $ref?: string;
}

interface PropertyObject {
  type?: string;
  'x-entity-type'?: string;
  anyOf?: Array<{ $ref?: string; type?: string; 'x-entity-type'?: string }>;
  $ref?: string;
}

interface PathObject {
  [method: string]: OperationObject | unknown;
}

interface OperationObject {
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: SchemaObject;
      };
    };
  };
  responses?: Record<string, ResponseObject>;
}

interface ResponseObject {
  content?: {
    'application/json'?: {
      schema?: SchemaObject;
    };
  };
}

/**
 * Recursively find all x-entity-type values in a schema
 */
function findEntityTypes(
  schema: OpenAPISchema,
  visited = new Set<string>()
): Set<string> {
  const entityTypes = new Set<string>();

  function processSchema(obj: SchemaObject | PropertyObject | null | undefined) {
    if (!obj || typeof obj !== 'object') return;

    // Check for x-entity-type directly on the object
    if ('x-entity-type' in obj && typeof obj['x-entity-type'] === 'string') {
      entityTypes.add(obj['x-entity-type']);
    }

    // Check anyOf array (common pattern for Optional[EntityRef])
    if ('anyOf' in obj && Array.isArray(obj.anyOf)) {
      for (const item of obj.anyOf) {
        if (item && typeof item === 'object' && 'x-entity-type' in item) {
          entityTypes.add(item['x-entity-type'] as string);
        }
      }
    }

    // Recurse into properties
    if ('properties' in obj && obj.properties) {
      for (const prop of Object.values(obj.properties)) {
        processSchema(prop);
      }
    }

    // Recurse into allOf
    if ('allOf' in obj && Array.isArray(obj.allOf)) {
      for (const item of obj.allOf) {
        processSchema(item);
      }
    }
  }

  // Process all schemas in components
  if (schema.components?.schemas) {
    for (const schemaObj of Object.values(schema.components.schemas)) {
      processSchema(schemaObj);
    }
  }

  return entityTypes;
}

/**
 * Convert entity type to PascalCase for type names
 */
function toPascalCase(str: string): string {
  return str
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Generate the branded types file content
 */
function generateBrandedTypes(entityTypes: Set<string>): string {
  const sorted = Array.from(entityTypes).sort();

  const lines: string[] = [
    '/**',
    ' * Auto-generated branded ID types from OpenAPI x-entity-type extensions.',
    ' * DO NOT EDIT MANUALLY - regenerate with: pnpm branded:gen',
    ' *',
    ' * This file complements ids.ts with auto-discovered entity types.',
    ' */',
    '',
    '// ============================================================================',
    '// BRAND SYMBOL (shared with ids.ts)',
    '// ============================================================================',
    '',
    'declare const __brand: unique symbol;',
    'type Brand<T, B extends string> = T & { readonly [__brand]: B };',
    '',
    '// ============================================================================',
    '// AUTO-DISCOVERED ENTITY TYPES',
    '// These types were found via x-entity-type in the OpenAPI schema',
    '// ============================================================================',
    '',
  ];

  // Generate branded ID types
  lines.push('// Branded numeric IDs');
  for (const entityType of sorted) {
    const pascalName = toPascalCase(entityType);
    lines.push(`export type ${pascalName}Id = Brand<number, '${pascalName}Id'>;`);
  }

  lines.push('');
  lines.push('// String reference types');
  for (const entityType of sorted) {
    const pascalName = toPascalCase(entityType);
    lines.push(`export type ${pascalName}Ref = \`${entityType}:\${number}\`;`);
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
  lines.push('// REF BUILDERS');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export const Ref = {');

  for (const entityType of sorted) {
    const pascalName = toPascalCase(entityType);
    lines.push(
      `  ${entityType}: (id: ${pascalName}Id | number): ${pascalName}Ref => \`${entityType}:\${id}\` as ${pascalName}Ref,`
    );
  }

  lines.push('} as const;');

  lines.push('');
  lines.push('// ============================================================================');
  lines.push('// ENTITY TYPE REGISTRY');
  lines.push('// List of all discovered entity types for runtime use');
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
  const openapiUrl = process.env.OPENAPI_URL || 'http://localhost:8000/openapi.json';
  const outPath =
    process.env.BRANDED_TYPES_OUT || 'packages/shared/types/src/ids.generated.ts';

  const absOutPath = path.resolve(process.cwd(), outPath);

  console.log(`Fetching OpenAPI schema from: ${openapiUrl}`);

  let schema: OpenAPISchema;
  try {
    const response = await fetch(openapiUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    schema = (await response.json()) as OpenAPISchema;
  } catch (err) {
    console.error(`Failed to fetch OpenAPI schema: ${err}`);
    console.error('Make sure the backend is running at the specified URL.');
    process.exit(1);
  }

  const entityTypes = findEntityTypes(schema);

  if (entityTypes.size === 0) {
    console.warn('Warning: No x-entity-type extensions found in OpenAPI schema.');
    console.warn('Make sure EntityRef fields are properly annotated.');
  } else {
    console.log(`Found ${entityTypes.size} entity types: ${Array.from(entityTypes).join(', ')}`);
  }

  const generated = generateBrandedTypes(entityTypes);

  if (isCheckMode) {
    let existing = '';
    try {
      existing = await fs.readFile(absOutPath, 'utf8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error(`✗ Branded types file does not exist: ${outPath}`);
        console.error('  Run `pnpm branded:gen` to generate it.');
        process.exit(1);
      }
      throw err;
    }

    if (existing === generated) {
      console.log(`✓ Branded types are up-to-date: ${outPath}`);
      process.exit(0);
    } else {
      console.error(`✗ Branded types are STALE: ${outPath}`);
      console.error('  Run `pnpm branded:gen` to update them.');
      process.exit(1);
    }
  } else {
    await fs.mkdir(path.dirname(absOutPath), { recursive: true });
    await fs.writeFile(absOutPath, generated, 'utf8');
    console.log(`✓ Generated branded types: ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
