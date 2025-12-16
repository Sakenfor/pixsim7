#!/usr/bin/env tsx
/**
 * Generates TypeScript types from the running backend OpenAPI schema.
 *
 * Default input:  http://localhost:8000/openapi.json
 * Default output: packages/shared/types/src/openapi.generated.ts
 *
 * Usage:
 *   pnpm openapi:gen
 *
 * Optional env overrides:
 *   OPENAPI_URL="http://localhost:8000/openapi.json"
 *   OPENAPI_TYPES_OUT="packages/shared/types/src/openapi.generated.ts"
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function main() {
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

  await fs.mkdir(path.dirname(absOutPath), { recursive: true });
  await fs.writeFile(absOutPath, generated, 'utf8');
  console.log(`Generated OpenAPI types: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
