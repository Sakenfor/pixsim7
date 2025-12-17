#!/usr/bin/env tsx
/**
 * Generates TypeScript types from the running backend OpenAPI schema.
 *
 * Default input:  http://localhost:8000/openapi.json
 * Default output: packages/shared/types/src/openapi.generated.ts
 *
 * Usage:
 *   pnpm openapi:gen          # Generate/overwrite types
 *   pnpm openapi:check        # Check if types are up-to-date (CI/pre-commit)
 *
 * Optional env overrides:
 *   OPENAPI_URL="http://localhost:8000/openapi.json"
 *   OPENAPI_TYPES_OUT="packages/shared/types/src/openapi.generated.ts"
 *
 * Exit codes:
 *   0 - Success (or types are up-to-date in check mode)
 *   1 - Error or types are stale (in check mode)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function main() {
  const isCheckMode = process.argv.includes('--check');
  const openapiUrl = process.env.OPENAPI_URL || 'http://localhost:8000/openapi.json';
  const outPath =
    process.env.OPENAPI_TYPES_OUT || 'packages/shared/types/src/openapi.generated.ts';

  const absOutPath = path.resolve(process.cwd(), outPath);

  // openapi-typescript is CommonJS (`export =`) so grab default-or-module.
  const mod: any = await import('openapi-typescript');
  const openapiTS = mod?.default ?? mod;
  const astToString = mod?.astToString;
  const COMMENT_HEADER = mod?.COMMENT_HEADER;

  if (typeof openapiTS !== 'function' || typeof astToString !== 'function') {
    throw new Error(
      'openapi-typescript import failed; ensure `openapi-typescript` is installed at the workspace root.'
    );
  }

  const ast = await openapiTS(openapiUrl, {
    alphabetize: true,
    immutable: true,
  });

  const generated = String(COMMENT_HEADER || '') + astToString(ast);

  if (isCheckMode) {
    // Check mode: compare generated content with existing file
    let existing = '';
    try {
      existing = await fs.readFile(absOutPath, 'utf8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.error(`✗ OpenAPI types file does not exist: ${outPath}`);
        console.error('  Run `pnpm openapi:gen` to generate it.');
        process.exit(1);
      }
      throw err;
    }

    if (existing === generated) {
      console.log(`✓ OpenAPI types are up-to-date: ${outPath}`);
      process.exit(0);
    } else {
      console.error(`✗ OpenAPI types are STALE: ${outPath}`);
      console.error('  The generated types differ from the current backend schema.');
      console.error('  Run `pnpm openapi:gen` to update them.');
      process.exit(1);
    }
  } else {
    // Generate mode: write the file
    await fs.mkdir(path.dirname(absOutPath), { recursive: true });
    await fs.writeFile(absOutPath, generated, 'utf8');
    console.log(`✓ Generated OpenAPI types: ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
