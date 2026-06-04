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
const DIR_COMPARE_IGNORE = new Set(['.schema-hash']);
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

async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
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

/**
 * Slice-aware subset compare. Used for tag-filtered checks where the slice
 * tempdir contains a strict subset of the canonical's files.
 *
 * Asks: "for every file this slice would produce, does the canonical contain
 * the same content?" — passes if all slice files exist + match in canonical.
 * Ignores files that exist in canonical but not in the slice (those belong to
 * other tags; out of scope for a slice check). Skips `model/index.ts` because
 * it's a re-export barrel that legitimately differs between slice and full
 * (slice's barrel re-exports only the slice's DTOs; canonical's re-exports all).
 *
 * Stepping stone toward scoped Generate via merge: the same enumeration
 * answers "which canonical files would I overwrite" for a slice merge.
 */
async function compareSubsetDirectories(sliceDir: string, canonicalDir: string): Promise<DirCompareResult> {
  if (!(await pathExists(sliceDir))) {
    return { equal: false, reason: `slice tempdir not generated: ${sliceDir}` };
  }
  if (!(await pathExists(canonicalDir))) {
    return { equal: false, reason: `canonical output not found: ${canonicalDir}` };
  }

  const sliceFiles = await listFilesRecursive(sliceDir);
  if (sliceFiles.length === 0) {
    // Filter matched no operations (or no DTOs were generated). Nothing to verify
    // — surface this clearly rather than silently passing.
    return { equal: false, reason: 'slice generated zero files (tag filter matched nothing?)' };
  }

  const missing: string[] = [];
  const differing: string[] = [];

  for (const relPath of sliceFiles) {
    if (relPath === 'model/index.ts') continue;  // see fn comment

    const canonicalPath = path.join(canonicalDir, relPath);
    if (!(await pathExists(canonicalPath))) {
      missing.push(relPath);
      continue;
    }
    const sliceContent = await fs.readFile(path.join(sliceDir, relPath), 'utf8');
    const canonicalContent = await fs.readFile(canonicalPath, 'utf8');
    if (sliceContent !== canonicalContent) {
      differing.push(relPath);
    }
  }

  if (missing.length === 0 && differing.length === 0) {
    return { equal: true };
  }

  const sample = (label: string, values: string[]): string => {
    if (values.length === 0) return '';
    const head = values.slice(0, 3).join(', ');
    const tail = values.length > 3 ? `, +${values.length - 3} more` : '';
    return `${values.length} ${label} (${head}${tail})`;
  };
  const parts = [sample('missing in canonical', missing), sample('differ', differing)].filter(Boolean);
  return { equal: false, reason: parts.join('; ') };
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

type MergeResult = { added: string[]; changed: string[]; unchanged: number };

/**
 * Scoped slice merge (Option A — scoped Generate). Instead of clobbering the
 * whole canonical output with one tag-slice, overwrite/add only the DTO files
 * this slice produced and rebuild the barrel from the post-merge file set.
 *
 * Shared DTOs (referenced by >1 domain) regenerate byte-identically, so merging
 * them is a no-op write — that's why a single canonical dir is correct and there
 * is no cross-slice divergence. What a merge canNOT do is prune: a DTO deleted
 * backend-side leaves an orphan file (the slice simply stops producing it; merge
 * never removes). Callers warn about that; full `openapi` (clean:true) prunes.
 *
 * The barrel format is reproduced exactly (header + localeCompare-sorted
 * `export * from './x';` lines, '\n'-joined, no trailing newline) so a later
 * full `openapi --check` stays green.
 */
async function mergeSliceIntoCanonical(sliceDir: string, canonicalDir: string): Promise<MergeResult> {
  const sliceModel = path.join(sliceDir, 'model');
  const canonModel = path.join(canonicalDir, 'model');

  if (!(await pathExists(canonModel))) {
    throw new Error(
      `Canonical output not found at ${normalizeSlashes(canonModel)}. A scoped slice can ` +
      'only merge into an existing canonical output — run the full `openapi` task once first.'
    );
  }

  const sliceFiles = (await fs.readdir(sliceModel)).filter(
    (name) => name.endsWith('.ts') && name !== 'index.ts'
  );
  if (sliceFiles.length === 0) {
    throw new Error(
      'Slice generated zero model files (tag filter matched nothing?). Canonical left untouched.'
    );
  }

  const added: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;

  for (const name of sliceFiles) {
    const sliceContent = await fs.readFile(path.join(sliceModel, name), 'utf8');
    const canonPath = path.join(canonModel, name);
    if (!(await pathExists(canonPath))) {
      added.push(name);
    } else {
      const canonContent = await fs.readFile(canonPath, 'utf8');
      if (canonContent === sliceContent) {
        unchanged += 1;
        continue;
      }
      changed.push(name);
    }
    await fs.writeFile(canonPath, sliceContent, 'utf8');
  }

  // Rebuild the barrel from the post-merge canonical file set so newly-added
  // DTOs get exported (and removed nothing — merge doesn't prune). Header comes
  // from the freshly-generated slice barrel; export lines are the full canonical
  // model listing, localeCompare-sorted, exactly as orval emits.
  const sliceBarrel = await fs.readFile(path.join(sliceModel, 'index.ts'), 'utf8');
  const headerEnd = sliceBarrel.indexOf('\nexport * from');
  const header = headerEnd >= 0 ? sliceBarrel.slice(0, headerEnd + 1) : sliceBarrel;
  const exports = (await fs.readdir(canonModel))
    .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
    .map((name) => name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `export * from './${name}';`)
    .join('\n');
  await fs.writeFile(path.join(canonModel, 'index.ts'), header + exports, 'utf8');

  return { added, changed, unchanged };
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
  isSliceMode: boolean
): Promise<boolean> {
  if (isCheckMode) {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixsim7-orval-check-'));
    const tempOutDir = path.join(tempRoot, 'openapi');
    try {
      await runOrval(source, tempOutDir, mode, client);
      if (modelsOnly) {
        await pruneToModelOnly(tempOutDir);
      }
      // Slice mode: compare only the files the slice generated against
      // canonical's matching files (subset compare). Full mode: strict
      // equality including file lists.
      const comparison = isSliceMode
        ? await compareSubsetDirectories(tempOutDir, absOutDir)
        : await compareDirectories(tempOutDir, absOutDir);
      const scopeLabel = isSliceMode ? 'slice' : 'full';
      if (comparison.equal) {
        console.log(`[ok] Orval ${scopeLabel} output is up-to-date: ${outDir}`);
        return true;
      }
      console.error(`[stale] Orval ${scopeLabel} output is STALE: ${outDir}`);
      if (comparison.reason) {
        console.error(`  ${comparison.reason}`);
      }
      console.error('  Run `pnpm openapi:gen` to update the canonical output.');
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
    if (isSliceMode) {
      // Scoped Generate: merge this slice into canonical instead of clobbering.
      const result = await mergeSliceIntoCanonical(tempOutDir, absOutDir);
      const sample = (label: string, values: string[]) => {
        if (values.length === 0) return;
        const head = values.slice(0, changeReportSampleLimit).join(', ');
        console.log(`  ${label} (${values.length}): ${head}${values.length > changeReportSampleLimit ? ', …' : ''}`);
      };
      console.log(
        `[ok] Merged slice into canonical: ${outDir} ` +
        `(+${result.added.length} added / ~${result.changed.length} changed / =${result.unchanged} unchanged)`
      );
      sample('added', result.added);
      sample('changed', result.changed);
      console.log(
        '  Note: a scoped merge does not prune deletions — if you removed or renamed DTOs in ' +
        'this domain, run `pnpm openapi:gen` (full) to drop the orphaned type files.'
      );
      return true;
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
    await fs.rm(absOutDir, { recursive: true, force: true });
    await fs.cp(tempOutDir, absOutDir, { recursive: true });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  console.log(`[ok] Generated Orval split OpenAPI output: ${outDir}`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check');
  const inputArg = getArgValue('--input', args);

  const serviceId = getArgValue('--service', args) ?? process.env.OPENAPI_SERVICE;
  const includeTags = parseCsv(getArgValue('--include-tags', args) ?? process.env.OPENAPI_INCLUDE_TAGS);
  const excludeTags = parseCsv(getArgValue('--exclude-tags', args) ?? process.env.OPENAPI_EXCLUDE_TAGS);
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

  const serviceConfig = await resolveServiceConfig(servicesRoot, serviceId);
  if (serviceId && !serviceConfig) {
    throw new Error(`OpenAPI service "${serviceId}" not found in ${servicesRoot}`);
  }

  const legacyTypesOut = process.env.OPENAPI_TYPES_OUT;
  const orvalOutDir =
    process.env.OPENAPI_ORVAL_OUT ||
    legacyTypesOut ||
    serviceConfig?.openapi_types_path ||
    DEFAULT_ORVAL_OUT;
  const orvalMode = process.env.OPENAPI_ORVAL_MODE || DEFAULT_ORVAL_MODE;
  const orvalClient = process.env.OPENAPI_ORVAL_CLIENT || DEFAULT_ORVAL_CLIENT;

  const absOrvalOutDir = path.resolve(process.cwd(), orvalOutDir);

  const openapiInput = inputArg || process.env.OPENAPI_INPUT;
  const resolvedUrl =
    process.env.OPENAPI_URL ||
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

  const isSliceMode = includeTags.length > 0 || excludeTags.length > 0;
  const orvalOk = await generateOrvalSplit(
    orvalSource,
    absOrvalOutDir,
    orvalOutDir,
    orvalMode,
    orvalClient,
    modelsOnly,
    changeReportEnabled,
    changeReportSampleLimit,
    isCheckMode,
    isSliceMode,
  );

  if (filteredSpecTempDir) {
    await fs.rm(filteredSpecTempDir, { recursive: true, force: true });
  }

  if (isCheckMode && !orvalOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
