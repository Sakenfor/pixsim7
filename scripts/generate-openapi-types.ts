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
 *   pnpm openapi:gen -- --service main-api
 *
 * Optional env overrides:
 *   OPENAPI_URL="http://localhost:8000/openapi.json"
 *   OPENAPI_TYPES_OUT="packages/shared/types/src/openapi.generated.ts"
 *   OPENAPI_SERVICE="main-api"
 *   OPENAPI_SERVICES_ROOT="."
 *
 * Exit codes:
 *   0 - Success (or types are up-to-date in check mode)
 *   1 - Error or types are stale (in check mode)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

type BackendServiceConfig = {
  id: string;
  base_url_env?: string;
  port_env?: string;
  default_port?: number;
  openapi_endpoint?: string;
  openapi_types_path?: string;
  type?: string;
};

const MANIFEST_FILENAME = 'pixsim.service.json';
const SKIP_DIRS = new Set([
  '.git',
  '.github',
  '.husky',
  '.claude',
  '.pytest_cache',
  '.idea',
  '.vscode',
  'node_modules',
  'packages',
  'dist',
  'build',
  'out',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'storage',
  'data',
  'docs',
  'examples',
  'tests',
  'launcher',
  'pixsim7',
  'chrome-extension',
]);

function getArgValue(flag: string, args: string[]): string | undefined {
  const prefix = `${flag}=`;
  const direct = args.find((arg) => arg.startsWith(prefix));
  if (direct) {
    return direct.slice(prefix.length);
  }
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

async function readJson(pathname: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(pathname, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function walkDir(root: string): Promise<{ packages: string[]; manifests: string[] }> {
  const packages: string[] = [];
  const manifests: string[] = [];

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        await walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        if (entry.name === 'package.json') {
          packages.push(fullPath);
        } else if (entry.name === MANIFEST_FILENAME) {
          manifests.push(fullPath);
        }
      }
    }
  }

  await walk(root);
  packages.sort();
  manifests.sort();
  return { packages, manifests };
}

async function loadServiceConfigs(rootPath: string): Promise<BackendServiceConfig[]> {
  const resolved = path.resolve(rootPath);
  try {
    const stats = await fs.stat(resolved);
    if (stats.isFile()) {
      const data = await readJson(resolved);
      const service = data?.service ?? data?.pixsim?.service ?? data;
      if (service?.id) {
        return [service as BackendServiceConfig];
      }
      return [];
    }
  } catch {
    // Fall back to directory scan.
  }

  const { packages, manifests } = await walkDir(resolved);
  const services: BackendServiceConfig[] = [];
  const seen = new Set<string>();

  for (const pkgPath of packages) {
    const data = await readJson(pkgPath);
    const service = data?.pixsim?.service;
    if (!service?.id || seen.has(service.id)) {
      continue;
    }
    seen.add(service.id);
    services.push(service as BackendServiceConfig);
  }

  for (const manifestPath of manifests) {
    const data = await readJson(manifestPath);
    const service = data?.service ?? data?.pixsim?.service ?? data;
    if (!service?.id || seen.has(service.id)) {
      continue;
    }
    seen.add(service.id);
    services.push(service as BackendServiceConfig);
  }

  return services;
}

function resolveBaseUrl(service: BackendServiceConfig): string | null {
  if (service.base_url_env) {
    const baseUrl = process.env[service.base_url_env];
    if (baseUrl) {
      return baseUrl;
    }
  }

  if (service.port_env) {
    const port = process.env[service.port_env];
    if (port) {
      return `http://localhost:${port}`;
    }
  }

  if (service.default_port) {
    return `http://localhost:${service.default_port}`;
  }

  return null;
}

function resolveOpenapiUrl(service: BackendServiceConfig): string | null {
  const baseUrl = resolveBaseUrl(service);
  if (!baseUrl) {
    return null;
  }

  let endpoint = service.openapi_endpoint || '/openapi.json';
  if (!endpoint.startsWith('/')) {
    endpoint = `/${endpoint}`;
  }

  return `${baseUrl.replace(/\/$/, '')}${endpoint}`;
}

async function resolveServiceConfig(
  servicesRoot: string,
  preferredId?: string
): Promise<BackendServiceConfig | null> {
  const services = (await loadServiceConfigs(servicesRoot)).filter(
    (service) => {
      const type = (service.type ?? 'backend').toLowerCase();
      return type === 'backend' || type === 'api';
    }
  );

  if (preferredId) {
    return services.find((service) => service.id === preferredId) ?? null;
  }

  return (
    services.find((service) => service.id === 'main-api') ??
    services.find((service) => service.openapi_endpoint) ??
    null
  );
}

async function main() {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check');

  const serviceId = getArgValue('--service', args) ?? process.env.OPENAPI_SERVICE;
  const servicesRoot =
    process.env.OPENAPI_SERVICES_ROOT ||
    process.env.OPENAPI_SERVICES_CONFIG ||
    process.cwd();

  const serviceConfig = await resolveServiceConfig(servicesRoot, serviceId);
  if (serviceId && !serviceConfig) {
    throw new Error(`OpenAPI service "${serviceId}" not found in ${servicesRoot}`);
  }

  const openapiUrl =
    process.env.OPENAPI_URL ||
    (serviceConfig ? resolveOpenapiUrl(serviceConfig) : null) ||
    'http://localhost:8000/openapi.json';
  const outPath =
    process.env.OPENAPI_TYPES_OUT ||
    serviceConfig?.openapi_types_path ||
    'packages/shared/types/src/openapi.generated.ts';

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
    emptyObjectsUnknown: true,
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
        console.error(`?- OpenAPI types file does not exist: ${outPath}`);
        console.error('  Run `pnpm openapi:gen` to generate it.');
        process.exit(1);
      }
      throw err;
    }

    if (existing === generated) {
      console.log(`?" OpenAPI types are up-to-date: ${outPath}`);
      process.exit(0);
    } else {
      console.error(`?- OpenAPI types are STALE: ${outPath}`);
      console.error('  The generated types differ from the current backend schema.');
      console.error('  Run `pnpm openapi:gen` to update them.');
      process.exit(1);
    }
  } else {
    // Generate mode: write the file
    await fs.mkdir(path.dirname(absOutPath), { recursive: true });
    await fs.writeFile(absOutPath, generated, 'utf8');
    console.log(`?" Generated OpenAPI types: ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
