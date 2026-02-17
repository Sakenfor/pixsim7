#!/usr/bin/env tsx
/**
 * Generates OpenAPI types via Orval (split output for modular API client/types).
 *
 * Default input:
 *   - http://localhost:8000/openapi.json
 *   - OR OPENAPI_INPUT=<local JSON file path>
 *
 * Default output:
 *   - Orval split output: packages/shared/api/client/src/generated/openapi
 *
 * Usage:
 *   pnpm openapi:gen          # Generate/overwrite types
 *   pnpm openapi:check        # Check if outputs are up-to-date (CI/pre-commit)
 *   pnpm openapi:gen -- --service main-api
 *   pnpm openapi:gen -- --input ./path/to/openapi.json
 *
 * Optional env overrides:
 *   OPENAPI_INPUT="./path/to/openapi.json"                      # Local JSON spec path
 *   OPENAPI_URL="http://localhost:8000/openapi.json"
 *   OPENAPI_ORVAL_OUT="packages/shared/api/client/src/generated/openapi"
 *   OPENAPI_ORVAL_MODE="tags-split"
 *   OPENAPI_ORVAL_CLIENT="axios"
 *   OPENAPI_SERVICE="main-api"
 *   OPENAPI_SERVICES_ROOT="."
 *
 * Exit codes:
 *   0 - Success (or outputs are up-to-date in check mode)
 *   1 - Error or outputs are stale (in check mode)
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
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
const DEFAULT_OPENAPI_URL = 'http://localhost:8000/openapi.json';
const DEFAULT_ORVAL_OUT = 'packages/shared/api/client/src/generated/openapi';
const DEFAULT_ORVAL_MODE = 'tags-split';
const DEFAULT_ORVAL_CLIENT = 'axios';

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
  const services = (await loadServiceConfigs(servicesRoot)).filter((service) => {
    const type = (service.type ?? 'backend').toLowerCase();
    return type === 'backend' || type === 'api';
  });

  if (preferredId) {
    return services.find((service) => service.id === preferredId) ?? null;
  }

  return (
    services.find((service) => service.id === 'main-api') ??
    services.find((service) => service.openapi_endpoint) ??
    null
  );
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

type DirCompareResult = {
  equal: boolean;
  reason?: string;
};

async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(normalizeSlashes(path.relative(root, fullPath)));
      }
    }
  }

  await walk(root);
  files.sort();
  return files;
}

async function compareDirectories(expectedDir: string, actualDir: string): Promise<DirCompareResult> {
  const expectedExists = await pathExists(expectedDir);
  const actualExists = await pathExists(actualDir);

  if (!expectedExists) {
    return { equal: false, reason: `expected directory does not exist: ${expectedDir}` };
  }
  if (!actualExists) {
    return { equal: false, reason: `output directory does not exist: ${actualDir}` };
  }

  const expectedFiles = await listFilesRecursive(expectedDir);
  const actualFiles = await listFilesRecursive(actualDir);

  if (expectedFiles.length !== actualFiles.length) {
    return {
      equal: false,
      reason: `file count mismatch (expected ${expectedFiles.length}, got ${actualFiles.length})`,
    };
  }

  for (let i = 0; i < expectedFiles.length; i += 1) {
    if (expectedFiles[i] !== actualFiles[i]) {
      return {
        equal: false,
        reason: `file list mismatch at index ${i}: expected "${expectedFiles[i]}", got "${actualFiles[i]}"`,
      };
    }
  }

  for (const relPath of expectedFiles) {
    const expectedContent = await fs.readFile(path.join(expectedDir, relPath), 'utf8');
    const actualContent = await fs.readFile(path.join(actualDir, relPath), 'utf8');
    if (expectedContent !== actualContent) {
      return { equal: false, reason: `content mismatch in ${relPath}` };
    }
  }

  return { equal: true };
}

async function runOrval(
  source: string,
  outputDir: string,
  mode: string,
  client: string
): Promise<void> {
  const mod: any = await import('orval');
  const generate = mod?.generate ?? mod?.default?.generate ?? mod?.default;
  if (typeof generate !== 'function') {
    throw new Error('orval import failed; ensure `orval` is installed at the workspace root.');
  }

  await generate({
    input: {
      target: source,
    },
    output: {
      target: path.join(outputDir, 'index.ts'),
      schemas: path.join(outputDir, 'model'),
      client,
      mode,
      clean: true,
      prettier: false,
    },
  });
}

async function generateOrvalSplit(
  source: string,
  absOutDir: string,
  outDir: string,
  mode: string,
  client: string,
  isCheckMode: boolean
): Promise<boolean> {
  if (isCheckMode) {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixsim7-orval-check-'));
    const tempOutDir = path.join(tempRoot, 'openapi');
    try {
      await runOrval(source, tempOutDir, mode, client);
      const comparison = await compareDirectories(tempOutDir, absOutDir);
      if (comparison.equal) {
        console.log(`[ok] Orval split output is up-to-date: ${outDir}`);
        return true;
      }
      console.error(`[stale] Orval split output is STALE: ${outDir}`);
      if (comparison.reason) {
        console.error(`  ${comparison.reason}`);
      }
      console.error('  Run `pnpm openapi:gen` to update it.');
      return false;
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  await fs.mkdir(absOutDir, { recursive: true });
  await runOrval(source, absOutDir, mode, client);
  console.log(`[ok] Generated Orval split OpenAPI output: ${outDir}`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check');
  const inputArg = getArgValue('--input', args);

  const serviceId = getArgValue('--service', args) ?? process.env.OPENAPI_SERVICE;
  const servicesRoot =
    process.env.OPENAPI_SERVICES_ROOT ||
    process.env.OPENAPI_SERVICES_CONFIG ||
    process.cwd();

  const serviceConfig = await resolveServiceConfig(servicesRoot, serviceId);
  if (serviceId && !serviceConfig) {
    throw new Error(`OpenAPI service "${serviceId}" not found in ${servicesRoot}`);
  }

  const orvalOutDir = process.env.OPENAPI_ORVAL_OUT || DEFAULT_ORVAL_OUT;
  const orvalMode = process.env.OPENAPI_ORVAL_MODE || DEFAULT_ORVAL_MODE;
  const orvalClient = process.env.OPENAPI_ORVAL_CLIENT || DEFAULT_ORVAL_CLIENT;

  const absOrvalOutDir = path.resolve(process.cwd(), orvalOutDir);

  const openapiInput = inputArg || process.env.OPENAPI_INPUT;
  const resolvedUrl =
    process.env.OPENAPI_URL ||
    (serviceConfig ? resolveOpenapiUrl(serviceConfig) : null) ||
    DEFAULT_OPENAPI_URL;

  let orvalSource = resolvedUrl;

  if (openapiInput) {
    const absInputPath = path.resolve(process.cwd(), openapiInput);
    const exists = await pathExists(absInputPath);
    if (!exists) {
      throw new Error(`OPENAPI_INPUT not found: ${absInputPath}`);
    }
    orvalSource = absInputPath;
    console.log(`Using local OpenAPI spec: ${normalizeSlashes(openapiInput)}`);
  } else {
    console.log(`Using OpenAPI URL: ${resolvedUrl}`);
  }

  const orvalOk = await generateOrvalSplit(
    orvalSource,
    absOrvalOutDir,
    orvalOutDir,
    orvalMode,
    orvalClient,
    isCheckMode
  );

  if (isCheckMode && !orvalOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
