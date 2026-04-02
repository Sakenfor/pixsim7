#!/usr/bin/env tsx
/**
 * Generates OpenAPI types via Orval (split output for modular API client/types).
 *
 * Default input:
 *   - http://localhost:8000/openapi.json
 *   - OR OPENAPI_INPUT=<local JSON file path>
 *
 * Default output:
 *   - Orval split output: packages/shared/api/model/src/generated/openapi
 *
 * Usage:
 *   pnpm openapi:gen          # Generate/overwrite types
 *   pnpm openapi:check        # Check if outputs are up-to-date (CI/pre-commit)
 *   pnpm openapi:gen -- --service main-api
 *   pnpm openapi:gen -- --input ./path/to/openapi.json
 *   pnpm openapi:gen -- --report
 *   pnpm openapi:gen -- --include-tags assets,providers --merge
 *   pnpm openapi:check -- --fast-check
 *
 * Optional env overrides:
 *   OPENAPI_INPUT="./path/to/openapi.json"                      # Local JSON spec path
 *   OPENAPI_URL="http://localhost:8000/openapi.json"
 *   OPENAPI_ORVAL_OUT="packages/shared/api/model/src/generated/openapi"
 *   OPENAPI_TYPES_OUT="packages/shared/api/model/src/generated/openapi"   # Legacy alias (backward compat)
 *   OPENAPI_ORVAL_MODE="tags-split"
 *   OPENAPI_ORVAL_CLIENT="axios"
 *   OPENAPI_MODELS_ONLY="true"                                  # Keep only generated model DTO files
 *   OPENAPI_INCLUDE_TAGS="assets,game-worlds"                   # Optional tag allowlist
 *   OPENAPI_EXCLUDE_TAGS="dev,admin"                            # Optional tag denylist
 *   OPENAPI_CHANGE_REPORT="true"                                 # Print file-level generation summary
 *   OPENAPI_CHANGE_REPORT_MAX="8"                                # Sample file paths per change bucket
 *   OPENAPI_FAST_CHECK="true"                                    # Fast staleness check with schema/output fingerprints
 *   OPENAPI_MERGE_OUTPUT="true"                                  # Scoped generation: merge into existing output dir
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
import { createHash } from 'node:crypto';
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
const DEFAULT_ORVAL_OUT = 'packages/shared/api/model/src/generated/openapi';
const DEFAULT_ORVAL_MODE = 'tags-split';
const DEFAULT_ORVAL_CLIENT = 'axios';
const DEFAULT_MODELS_ONLY = true;
const DEFAULT_FAST_CHECK = false;
const DEFAULT_MERGE_OUTPUT = false;
const SCHEMA_HASH_FILENAME = '.schema-hash';
const SCHEMA_HASH_VERSION = 1;
const SCOPED_MANIFEST_DIR = '.scoped-manifests';
const DIR_COMPARE_IGNORE = new Set([SCHEMA_HASH_FILENAME]);
const OPENAPI_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

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
  '.tmp-test',
  'pytest_tmp_root',
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

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function isHttpSource(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://');
}

async function readJson(pathname: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(pathname, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readWorkspaceOrvalVersion(): Promise<string> {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = await readJson(pkgPath);
  const version = pkg?.devDependencies?.orval ?? pkg?.dependencies?.orval;
  return typeof version === 'string' ? version : 'unknown';
}

async function walkDir(root: string): Promise<{ packages: string[]; manifests: string[] }> {
  const packages: string[] = [];
  const manifests: string[] = [];

  async function walk(current: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      // Skip directories we can't read (permission errors, etc.)
      return;
    }
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

  const servicesDir = path.join(resolved, 'services');
  if (await pathExists(servicesDir)) {
    try {
      const entries = await fs.readdir(servicesDir, { withFileTypes: true });
      const services: BackendServiceConfig[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const manifestPath = path.join(servicesDir, entry.name, MANIFEST_FILENAME);
        const data = await readJson(manifestPath);
        const service = data?.service ?? data?.pixsim?.service ?? data;
        if (!service?.id) {
          continue;
        }
        services.push(service as BackendServiceConfig);
      }
      if (services.length > 0) {
        return services;
      }
    } catch {
      // Fall through to full workspace scan.
    }
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
  if (preferredId) {
    const directManifest = path.join(path.resolve(servicesRoot), 'services', preferredId, MANIFEST_FILENAME);
    const direct = await readJson(directManifest);
    const directService = direct?.service ?? direct?.pixsim?.service ?? direct;
    if (directService?.id === preferredId) {
      return directService as BackendServiceConfig;
    }
  }

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

async function loadOpenApiSpec(source: string): Promise<any> {
  if (isHttpSource(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec (${response.status}): ${source}`);
    }
    return response.json();
  }

  const raw = await fs.readFile(source, 'utf8');
  return JSON.parse(raw);
}

function filterOpenApiByTags(
  spec: any,
  includeTags: string[],
  excludeTags: string[]
): any {
  const include = new Set(includeTags);
  const exclude = new Set(excludeTags);
  if (include.size === 0 && exclude.size === 0) {
    return spec;
  }

  const filtered = JSON.parse(JSON.stringify(spec));
  const originalPaths = filtered.paths ?? {};
  const nextPaths: Record<string, any> = {};
  const usedTags = new Set<string>();

  for (const [pathKey, pathItem] of Object.entries<any>(originalPaths)) {
    const nextPathItem: Record<string, any> = {};
    let keptMethodCount = 0;

    for (const [methodKey, operation] of Object.entries<any>(pathItem ?? {})) {
      const method = methodKey.toLowerCase();
      if (!OPENAPI_METHODS.has(method)) {
        nextPathItem[methodKey] = operation;
        continue;
      }

      const tags: string[] = Array.isArray(operation?.tags)
        ? operation.tags.map((tag: unknown) => String(tag))
        : [];
      const matchesInclude = include.size === 0 || tags.some((tag) => include.has(tag));
      const matchesExclude = exclude.size > 0 && tags.some((tag) => exclude.has(tag));
      if (!matchesInclude || matchesExclude) {
        continue;
      }

      nextPathItem[methodKey] = operation;
      keptMethodCount += 1;
      for (const tag of tags) {
        usedTags.add(tag);
      }
    }

    if (keptMethodCount > 0) {
      nextPaths[pathKey] = nextPathItem;
    }
  }

  filtered.paths = nextPaths;
  if (Array.isArray(filtered.tags)) {
    filtered.tags = filtered.tags.filter((tagEntry: any) => usedTags.has(String(tagEntry?.name ?? '')));
  }
  return filtered;
}

async function pruneToModelOnly(outputDir: string): Promise<void> {
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(outputDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'model') continue;
      await fs.rm(fullPath, { recursive: true, force: true });
      continue;
    }
    await fs.rm(fullPath, { force: true });
  }
}

type DirCompareResult = {
  equal: boolean;
  reason?: string;
};

type FileSnapshot = Map<string, string>;

type OutputChangeReport = {
  added: string[];
  removed: string[];
  changed: string[];
  unchangedCount: number;
};

type SchemaHashContext = {
  source: string;
  outputDir: string;
  sourceHash: string;
  configHash: string;
  mode: string;
  client: string;
  modelsOnly: boolean;
  includeTags: string[];
  excludeTags: string[];
  orvalVersion: string;
};

type SchemaHashRecord = {
  version: number;
  source: string;
  output_dir: string;
  source_hash: string;
  config_hash: string;
  output_hash: string;
  mode: string;
  client: string;
  models_only: boolean;
  include_tags: string[];
  exclude_tags: string[];
  orval_version: string;
  generated_at: string;
};

function hashText(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function schemaHashPath(outputDir: string): string {
  return path.join(outputDir, SCHEMA_HASH_FILENAME);
}

function normalizeTagsForFingerprint(tags: string[]): string[] {
  return [...tags].map((tag) => tag.trim()).filter(Boolean).sort();
}

function buildScopedManifestKey(includeTags: string[], excludeTags: string[]): string {
  return hashText(
    JSON.stringify({
      include_tags: normalizeTagsForFingerprint(includeTags),
      exclude_tags: normalizeTagsForFingerprint(excludeTags),
    })
  ).slice(0, 12);
}

function scopedManifestPath(absOutDir: string, scopeKey: string): string {
  return path.join(absOutDir, SCOPED_MANIFEST_DIR, `${scopeKey}.json`);
}

function buildSchemaConfigHash(params: {
  mode: string;
  client: string;
  modelsOnly: boolean;
  includeTags: string[];
  excludeTags: string[];
  orvalVersion: string;
}): string {
  return hashText(
    JSON.stringify({
      mode: params.mode,
      client: params.client,
      models_only: params.modelsOnly,
      include_tags: normalizeTagsForFingerprint(params.includeTags),
      exclude_tags: normalizeTagsForFingerprint(params.excludeTags),
      orval_version: params.orvalVersion,
      schema_hash_version: SCHEMA_HASH_VERSION,
    })
  );
}

async function hashOpenApiSource(source: string): Promise<string> {
  if (isHttpSource(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec (${response.status}): ${source}`);
    }
    return hashText(await response.text());
  }

  return hashText(await fs.readFile(source, 'utf8'));
}

async function hashDirectory(root: string): Promise<string | null> {
  if (!(await pathExists(root))) {
    return null;
  }
  const files = await listFilesRecursive(root);
  const digest = createHash('sha1');
  for (const relPath of files) {
    const content = await fs.readFile(path.join(root, relPath));
    const fileHash = createHash('sha1').update(content).digest('hex');
    digest.update(relPath);
    digest.update('\0');
    digest.update(fileHash);
    digest.update('\n');
  }
  return digest.digest('hex');
}

function buildSchemaHashRecord(context: SchemaHashContext, outputHash: string): SchemaHashRecord {
  return {
    version: SCHEMA_HASH_VERSION,
    source: context.source,
    output_dir: context.outputDir,
    source_hash: context.sourceHash,
    config_hash: context.configHash,
    output_hash: outputHash,
    mode: context.mode,
    client: context.client,
    models_only: context.modelsOnly,
    include_tags: normalizeTagsForFingerprint(context.includeTags),
    exclude_tags: normalizeTagsForFingerprint(context.excludeTags),
    orval_version: context.orvalVersion,
    generated_at: new Date().toISOString(),
  };
}

async function readSchemaHashRecord(outputDir: string): Promise<SchemaHashRecord | null> {
  const record = await readJson(schemaHashPath(outputDir));
  if (!record || typeof record !== 'object') {
    return null;
  }
  if (record.version !== SCHEMA_HASH_VERSION) {
    return null;
  }
  if (typeof record.source_hash !== 'string' || typeof record.config_hash !== 'string') {
    return null;
  }
  if (typeof record.output_hash !== 'string') {
    return null;
  }
  return record as SchemaHashRecord;
}

async function writeSchemaHashRecord(outputDir: string, record: SchemaHashRecord): Promise<void> {
  await fs.writeFile(schemaHashPath(outputDir), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

async function isFreshBySchemaHash(context: SchemaHashContext, absOutDir: string): Promise<boolean> {
  const record = await readSchemaHashRecord(absOutDir);
  if (!record) {
    return false;
  }
  if (record.config_hash !== context.configHash) {
    return false;
  }
  if (record.source_hash !== context.sourceHash) {
    return false;
  }
  const outputHash = await hashDirectory(absOutDir);
  if (!outputHash) {
    return false;
  }
  return outputHash === record.output_hash;
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === SCOPED_MANIFEST_DIR) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (DIR_COMPARE_IGNORE.has(entry.name)) {
          continue;
        }
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

function isScopedIgnorePath(relPath: string): boolean {
  // In scoped mode we deliberately preserve the canonical full model barrel in output.
  return relPath === 'model/index.ts' || relPath === 'index.ts';
}

async function compareDirectorySubset(expectedDir: string, actualDir: string): Promise<DirCompareResult> {
  const expectedExists = await pathExists(expectedDir);
  const actualExists = await pathExists(actualDir);

  if (!expectedExists) {
    return { equal: false, reason: `expected directory does not exist: ${expectedDir}` };
  }
  if (!actualExists) {
    return { equal: false, reason: `output directory does not exist: ${actualDir}` };
  }

  const expectedFiles = (await listFilesRecursive(expectedDir)).filter((relPath) => !isScopedIgnorePath(relPath));
  if (expectedFiles.length === 0) {
    return { equal: false, reason: 'scoped expected output has no comparable files' };
  }

  for (const relPath of expectedFiles) {
    const actualPath = path.join(actualDir, relPath);
    if (!(await pathExists(actualPath))) {
      return { equal: false, reason: `missing file in output: ${relPath}` };
    }
    const expectedContent = await fs.readFile(path.join(expectedDir, relPath), 'utf8');
    const actualContent = await fs.readFile(actualPath, 'utf8');
    if (expectedContent !== actualContent) {
      return { equal: false, reason: `content mismatch in ${relPath}` };
    }
  }

  return { equal: true };
}

async function rebuildModelBarrel(modelDir: string): Promise<void> {
  if (!(await pathExists(modelDir))) {
    return;
  }
  const entries = await fs.readdir(modelDir, { withFileTypes: true });
  const exportNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts')
    .map((entry) => entry.name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b));

  const content =
    '/**\n' +
    ' * Auto-generated merged model barrel.\n' +
    ' * Do not edit manually.\n' +
    ' */\n\n' +
    exportNames.map((name) => `export * from './${name}';`).join('\n') +
    '\n';

  await fs.writeFile(path.join(modelDir, 'index.ts'), content, 'utf8');
}

async function mergeGeneratedOutput(
  tempOutDir: string,
  absOutDir: string,
  modelsOnly: boolean,
  scopeKey?: string
): Promise<void> {
  await fs.mkdir(absOutDir, { recursive: true });
  const files = await listFilesRecursive(tempOutDir);
  const copiedFiles = files.filter((relPath) => !isScopedIgnorePath(relPath));
  const copiedSet = new Set(copiedFiles);

  if (scopeKey) {
    const manifestPath = scopedManifestPath(absOutDir, scopeKey);
    const previousManifest = await readJson(manifestPath);
    const previousFiles = Array.isArray(previousManifest?.files)
      ? previousManifest.files.filter((value: unknown) => typeof value === 'string')
      : [];

    for (const relPath of previousFiles) {
      if (copiedSet.has(relPath)) {
        continue;
      }
      await fs.rm(path.join(absOutDir, relPath), { force: true });
    }
  }

  for (const relPath of copiedFiles) {
    const src = path.join(tempOutDir, relPath);
    const dst = path.join(absOutDir, relPath);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }

  if (modelsOnly) {
    await rebuildModelBarrel(path.join(absOutDir, 'model'));
  }

  if (scopeKey) {
    const manifestPath = scopedManifestPath(absOutDir, scopeKey);
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify({ version: 1, files: copiedFiles.sort(), updated_at: new Date().toISOString() }, null, 2)}\n`,
      'utf8'
    );
  }
}

async function snapshotDirectory(root: string): Promise<FileSnapshot> {
  const snapshot: FileSnapshot = new Map();
  if (!(await pathExists(root))) {
    return snapshot;
  }

  const files = await listFilesRecursive(root);
  for (const relPath of files) {
    const content = await fs.readFile(path.join(root, relPath));
    const hash = createHash('sha1').update(content).digest('hex');
    snapshot.set(relPath, hash);
  }
  return snapshot;
}

function buildOutputChangeReport(previous: FileSnapshot, next: FileSnapshot): OutputChangeReport {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let unchangedCount = 0;

  for (const [pathKey, nextHash] of next.entries()) {
    const prevHash = previous.get(pathKey);
    if (!prevHash) {
      added.push(pathKey);
      continue;
    }
    if (prevHash !== nextHash) {
      changed.push(pathKey);
      continue;
    }
    unchangedCount += 1;
  }

  for (const pathKey of previous.keys()) {
    if (!next.has(pathKey)) {
      removed.push(pathKey);
    }
  }

  added.sort();
  removed.sort();
  changed.sort();
  return { added, removed, changed, unchangedCount };
}

function printOutputChangeReport(
  outDir: string,
  report: OutputChangeReport,
  previousCount: number,
  nextCount: number,
  sampleLimit: number
): void {
  console.log(
    `[report] OpenAPI output change summary for ${outDir}: ` +
    `+${report.added.length} / -${report.removed.length} / ~${report.changed.length} / =${report.unchangedCount} ` +
    `(files ${previousCount} -> ${nextCount})`
  );

  const printSample = (label: string, values: string[]) => {
    if (values.length === 0) return;
    const sample = values.slice(0, sampleLimit);
    console.log(`  ${label} (${values.length}): ${sample.join(', ')}${values.length > sampleLimit ? ', ...' : ''}`);
  };

  printSample('added', report.added);
  printSample('removed', report.removed);
  printSample('changed', report.changed);
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

  const modelBarrel = path.join(outputDir, 'model', 'index.ts');
  if (!(await pathExists(modelBarrel))) {
    throw new Error(
      `Orval generation did not produce model outputs at ${normalizeSlashes(modelBarrel)}`
    );
  }
}

async function generateOrvalSplit(
  source: string,
  absOutDir: string,
  outDir: string,
  mode: string,
  client: string,
  modelsOnly: boolean,
  changeReportEnabled: boolean,
  changeReportSampleLimit: number,
  isCheckMode: boolean,
  schemaHashContext: SchemaHashContext | null,
  fastCheckEnabled: boolean,
  mergeOutput: boolean,
  scopedMode: boolean,
  scopeKey?: string
): Promise<boolean> {
  if (isCheckMode) {
    if (fastCheckEnabled && schemaHashContext) {
      const isFresh = await isFreshBySchemaHash(schemaHashContext, absOutDir);
      if (isFresh) {
        console.log(`[ok] Orval split output is up-to-date (fast check): ${outDir}`);
        return true;
      }
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixsim7-orval-check-'));
    const tempOutDir = path.join(tempRoot, 'openapi');
    try {
      await runOrval(source, tempOutDir, mode, client);
      if (modelsOnly) {
        await pruneToModelOnly(tempOutDir);
      }
      const comparison = scopedMode
        ? await compareDirectorySubset(tempOutDir, absOutDir)
        : await compareDirectories(tempOutDir, absOutDir);
      if (comparison.equal) {
        const modeLabel = scopedMode ? 'scoped' : 'full';
        console.log(`[ok] Orval split output is up-to-date (${modeLabel} check): ${outDir}`);
        return true;
      }
      const modeLabel = scopedMode ? 'scoped' : 'full';
      console.error(`[stale] Orval split output is STALE (${modeLabel} check): ${outDir}`);
      if (comparison.reason) {
        console.error(`  ${comparison.reason}`);
      }
      console.error('  Run `pnpm openapi:gen` to update it.');
      return false;
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixsim7-orval-gen-'));
  const tempOutDir = path.join(tempRoot, 'openapi');
  const previousSnapshot = changeReportEnabled ? await snapshotDirectory(absOutDir) : null;
  try {
    await runOrval(source, tempOutDir, mode, client);
    if (modelsOnly) {
      await pruneToModelOnly(tempOutDir);
    }
    if (schemaHashContext && !mergeOutput) {
      const outputHash = await hashDirectory(tempOutDir);
      if (!outputHash) {
        throw new Error(`Failed to fingerprint generated OpenAPI output: ${tempOutDir}`);
      }
      await writeSchemaHashRecord(tempOutDir, buildSchemaHashRecord(schemaHashContext, outputHash));
    }
    if (changeReportEnabled && previousSnapshot) {
      const nextSnapshot = await snapshotDirectory(tempOutDir);
      const report = buildOutputChangeReport(previousSnapshot, nextSnapshot);
      printOutputChangeReport(
        outDir,
        report,
        previousSnapshot.size,
        nextSnapshot.size,
        changeReportSampleLimit
      );
    }
    await fs.mkdir(path.dirname(absOutDir), { recursive: true });
    if (mergeOutput) {
      await mergeGeneratedOutput(tempOutDir, absOutDir, modelsOnly, scopeKey);
    } else {
      await fs.rm(absOutDir, { recursive: true, force: true });
      await fs.cp(tempOutDir, absOutDir, { recursive: true });
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  if (mergeOutput) {
    console.log(`[ok] Merged scoped Orval OpenAPI output into: ${outDir}`);
  } else {
    console.log(`[ok] Generated Orval split OpenAPI output: ${outDir}`);
  }
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check');
  const fastCheckEnabled =
    isCheckMode &&
    (args.includes('--fast-check') || parseBoolean(process.env.OPENAPI_FAST_CHECK, DEFAULT_FAST_CHECK));
  const inputArg = getArgValue('--input', args);

  const openapiInput = inputArg || process.env.OPENAPI_INPUT;
  const serviceId = getArgValue('--service', args) ?? process.env.OPENAPI_SERVICE;
  const includeTags = parseCsv(getArgValue('--include-tags', args) ?? process.env.OPENAPI_INCLUDE_TAGS);
  const excludeTags = parseCsv(getArgValue('--exclude-tags', args) ?? process.env.OPENAPI_EXCLUDE_TAGS);
  const mergeOutput =
    args.includes('--merge') || parseBoolean(process.env.OPENAPI_MERGE_OUTPUT, DEFAULT_MERGE_OUTPUT);
  const scopedMode = includeTags.length > 0 || excludeTags.length > 0 || mergeOutput;
  const modelsOnly = parseBoolean(process.env.OPENAPI_MODELS_ONLY, DEFAULT_MODELS_ONLY);
  const changeReportEnabled = args.includes('--report') || parseBoolean(process.env.OPENAPI_CHANGE_REPORT, false);
  const parsedSampleLimit = Number(process.env.OPENAPI_CHANGE_REPORT_MAX ?? '8');
  const changeReportSampleLimit = Number.isFinite(parsedSampleLimit) && parsedSampleLimit > 0
    ? Math.floor(parsedSampleLimit)
    : 8;
  const servicesRoot =
    process.env.OPENAPI_SERVICES_ROOT ||
    process.env.OPENAPI_SERVICES_CONFIG ||
    process.cwd();

  const legacyTypesOut = process.env.OPENAPI_TYPES_OUT;
  const explicitOutDir = process.env.OPENAPI_ORVAL_OUT || legacyTypesOut;
  const explicitUrl = process.env.OPENAPI_URL;

  // Skip repo-wide service discovery when caller already provided explicit URL/output.
  const shouldResolveServiceConfig =
    Boolean(serviceId) ||
    !explicitOutDir ||
    (!explicitUrl && !openapiInput);

  const serviceConfig = shouldResolveServiceConfig
    ? await resolveServiceConfig(servicesRoot, serviceId)
    : null;
  if (serviceId && !serviceConfig) {
    throw new Error(`OpenAPI service "${serviceId}" not found in ${servicesRoot}`);
  }

  const orvalOutDir =
    explicitOutDir ||
    serviceConfig?.openapi_types_path ||
    DEFAULT_ORVAL_OUT;
  const orvalMode = process.env.OPENAPI_ORVAL_MODE || DEFAULT_ORVAL_MODE;
  const orvalClient = process.env.OPENAPI_ORVAL_CLIENT || DEFAULT_ORVAL_CLIENT;

  const absOrvalOutDir = path.resolve(process.cwd(), orvalOutDir);

  const resolvedUrl =
    explicitUrl ||
    (serviceConfig ? resolveOpenapiUrl(serviceConfig) : null) ||
    DEFAULT_OPENAPI_URL;

  let orvalSource = resolvedUrl;
  let filteredSpecTempDir: string | null = null;

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

  if (includeTags.length > 0 || excludeTags.length > 0) {
    const spec = await loadOpenApiSpec(orvalSource);
    const beforePathCount = Object.keys(spec.paths ?? {}).length;
    const filteredSpec = filterOpenApiByTags(spec, includeTags, excludeTags);
    const afterPathCount = Object.keys(filteredSpec.paths ?? {}).length;
    filteredSpecTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixsim7-openapi-filtered-'));
    const filteredSpecPath = path.join(filteredSpecTempDir, 'openapi.filtered.json');
    await fs.writeFile(filteredSpecPath, `${JSON.stringify(filteredSpec, null, 2)}\n`, 'utf8');
    orvalSource = filteredSpecPath;
    console.log(
      `[info] Applied tag filter: paths ${beforePathCount} -> ${afterPathCount} ` +
      `(include=${includeTags.join(',') || '-'}, exclude=${excludeTags.join(',') || '-'})`
    );
  }

  const supportsFastHash = !scopedMode;
  const scopeKey = scopedMode ? buildScopedManifestKey(includeTags, excludeTags) : undefined;
  let schemaHashContext: SchemaHashContext | null = null;
  if (supportsFastHash && (!isCheckMode || fastCheckEnabled)) {
    const orvalVersion = await readWorkspaceOrvalVersion();
    const sourceHash = await hashOpenApiSource(orvalSource);
    schemaHashContext = {
      source: orvalSource,
      outputDir: normalizeSlashes(orvalOutDir),
      sourceHash,
      configHash: buildSchemaConfigHash({
        mode: orvalMode,
        client: orvalClient,
        modelsOnly,
        includeTags,
        excludeTags,
        orvalVersion,
      }),
      mode: orvalMode,
      client: orvalClient,
      modelsOnly,
      includeTags,
      excludeTags,
      orvalVersion,
    };
  }

  let orvalOk = false;
  try {
    orvalOk = await generateOrvalSplit(
      orvalSource,
      absOrvalOutDir,
      orvalOutDir,
      orvalMode,
      orvalClient,
      modelsOnly,
      changeReportEnabled,
      changeReportSampleLimit,
      isCheckMode,
      schemaHashContext,
      fastCheckEnabled && supportsFastHash,
      mergeOutput,
      scopedMode,
      scopeKey
    );
  } finally {
    if (filteredSpecTempDir) {
      await fs.rm(filteredSpecTempDir, { recursive: true, force: true });
    }
  }

  if (isCheckMode && !orvalOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
