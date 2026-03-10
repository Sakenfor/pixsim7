#!/usr/bin/env node
/**
 * Plan Registry Checker
 *
 * Validates docs/plans/registry.yaml and enforces light plan hygiene:
 * - Registry schema is valid.
 * - Registered plan paths and code_paths exist.
 * - Registered plan docs include key metadata markers.
 * - If mapped code paths changed, at least one impacted plan doc (or registry)
 *   is updated in the same diff.
 *
 * Usage:
 *   pnpm docs:plans:check
 *   STRICT_PLAN_DOCS=1 pnpm docs:plans:check
 *   STRICT_PLAN_METADATA=1 STRICT_PLAN_PATH_REFS=1 pnpm docs:plans:check
 *
 * Optional diff env:
 *   PLAN_BASE_SHA=<sha> PLAN_HEAD_SHA=<sha>
 *
 * Optional path-ref ignore env:
 *   PLAN_PATH_REF_IGNORE_FILE=docs/plans/path-ref-ignores.txt
 *   PLAN_PATH_REF_IGNORE_PATTERNS='^docs/fixtures/,^examples/'
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import YAML from 'yaml';

type RegistryFile = {
  version: number;
  plans: PlanEntry[];
};

type PlanEntry = {
  id: string;
  path: string;
  status: string;
  stage: string;
  owner: string;
  last_updated: string;
  code_paths: string[];
};

type ValidationState = {
  errors: string[];
  warnings: string[];
};

const PROJECT_ROOT = process.cwd();
const REGISTRY_PATH = path.join(PROJECT_ROOT, 'docs', 'plans', 'registry.yaml');
const STRICT_PLAN_DOCS = process.env.STRICT_PLAN_DOCS === '1';
const STRICT_PLAN_METADATA = STRICT_PLAN_DOCS || process.env.STRICT_PLAN_METADATA === '1';
const STRICT_PLAN_PATH_REFS = STRICT_PLAN_DOCS || process.env.STRICT_PLAN_PATH_REFS === '1';
const DEFAULT_PATH_REF_IGNORE_FILE = path.join(PROJECT_ROOT, 'docs', 'plans', 'path-ref-ignores.txt');
const PATH_REF_IGNORE_FILE = process.env.PLAN_PATH_REF_IGNORE_FILE?.trim()
  ? path.resolve(PROJECT_ROOT, process.env.PLAN_PATH_REF_IGNORE_FILE.trim())
  : DEFAULT_PATH_REF_IGNORE_FILE;
const PATH_REF_IGNORE_PATTERNS = (process.env.PLAN_PATH_REF_IGNORE_PATTERNS ?? '')
  .split(',')
  .map((token) => token.trim())
  .filter((token) => token.length > 0);

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function addError(state: ValidationState, message: string): void {
  state.errors.push(message);
}

function addWarning(state: ValidationState, message: string): void {
  state.warnings.push(message);
}

function loadPathRefIgnoreRegexes(state: ValidationState): RegExp[] {
  const rawPatterns: Array<{ pattern: string; source: string }> = [];

  for (const token of PATH_REF_IGNORE_PATTERNS) {
    rawPatterns.push({ pattern: token, source: 'PLAN_PATH_REF_IGNORE_PATTERNS' });
  }

  if (fs.existsSync(PATH_REF_IGNORE_FILE)) {
    const fileRaw = fs.readFileSync(PATH_REF_IGNORE_FILE, 'utf8');
    const relFile = toPosix(path.relative(PROJECT_ROOT, PATH_REF_IGNORE_FILE));
    for (const [index, line] of fileRaw.split(/\r?\n/).entries()) {
      const pattern = line.trim();
      if (!pattern || pattern.startsWith('#')) continue;
      rawPatterns.push({ pattern, source: `${relFile}:${index + 1}` });
    }
  }

  const regexes: RegExp[] = [];
  for (const item of rawPatterns) {
    try {
      regexes.push(new RegExp(item.pattern));
    } catch (err) {
      addWarning(
        state,
        `Invalid path-ref ignore regex (${item.source}): "${item.pattern}" (${String(err)})`,
      );
    }
  }

  return regexes;
}

function parseRegistry(state: ValidationState): RegistryFile | null {
  if (!fs.existsSync(REGISTRY_PATH)) {
    addError(state, `Missing registry file: ${toPosix(path.relative(PROJECT_ROOT, REGISTRY_PATH))}`);
    return null;
  }

  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    addError(state, `Could not parse registry YAML: ${String(err)}`);
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    addError(state, 'Registry root must be an object');
    return null;
  }

  const registry = parsed as Partial<RegistryFile>;
  if (registry.version !== 1) {
    addError(state, `Registry version must be 1 (received: ${String(registry.version)})`);
  }

  if (!Array.isArray(registry.plans)) {
    addError(state, 'Registry must define plans as an array');
    return null;
  }

  return registry as RegistryFile;
}

function validatePlanEntryShape(entry: PlanEntry, index: number, state: ValidationState): void {
  const prefix = `plans[${index}]`;
  const requiredFields: Array<keyof PlanEntry> = [
    'id',
    'path',
    'status',
    'stage',
    'owner',
    'last_updated',
    'code_paths',
  ];

  for (const field of requiredFields) {
    if (!(field in entry)) {
      addError(state, `${prefix} missing required field: ${field}`);
    }
  }

  const requiredStringFields: Array<keyof PlanEntry> = [
    'id',
    'path',
    'status',
    'stage',
    'owner',
    'last_updated',
  ];
  for (const field of requiredStringFields) {
    const value = entry[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      addError(state, `${prefix}.${field} must be a non-empty string`);
    }
  }

  if (!Array.isArray(entry.code_paths)) {
    addError(state, `${prefix}.code_paths must be an array`);
  } else {
    for (let i = 0; i < entry.code_paths.length; i += 1) {
      const codePath = entry.code_paths[i];
      if (typeof codePath !== 'string' || codePath.trim().length === 0) {
        addError(state, `${prefix}.code_paths[${i}] must be a non-empty string`);
      }
    }
  }
}

function extractInlineCodeSegments(content: string): string[] {
  const out: string[] = [];
  const regex = /`([^`\r\n]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    out.push(match[1]);
  }
  return out;
}

function extractMarkdownLinkTargets(content: string): string[] {
  const out: string[] = [];
  const regex = /\[[^\]]+\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    out.push(match[1]);
  }
  return out;
}

function normalizeCandidatePath(candidate: string): string | null {
  let cleaned = candidate.trim();
  if (!cleaned) return null;

  cleaned = cleaned.replace(/^['"]|['"]$/g, '');
  cleaned = cleaned.split('#')[0].trim();
  cleaned = cleaned.replace(/[),.;]+$/g, '');

  if (!cleaned) return null;
  if (cleaned.includes(' ')) return null;
  if (cleaned.includes('://')) return null;
  if (cleaned.startsWith('mailto:')) return null;
  if (cleaned.startsWith('/api/')) return null;
  if (cleaned.startsWith('/')) return null;
  if (cleaned.includes('*') || cleaned.includes('?')) return null;
  if (cleaned.includes('...')) return null;
  if (cleaned.startsWith('{{') || cleaned.startsWith('${') || cleaned.includes('<') || cleaned.includes('>')) {
    return null;
  }

  const lineSuffixMatch = cleaned.match(/^(.*\.(?:md|py|ts|tsx|json|yml|yaml|sh|ps1)):\d+(?::\d+)?$/i);
  if (lineSuffixMatch) {
    cleaned = lineSuffixMatch[1];
  }

  const hasSlash = cleaned.includes('/') || cleaned.includes('\\');
  const looksLikeFile = /\.[a-z0-9]+$/i.test(cleaned);
  const allowedPrefix = /^(apps|packages|pixsim7|docs|scripts|tools|services|admin|chrome-extension|launcher|tests)\//;
  const isRelative = cleaned.startsWith('./') || cleaned.startsWith('../');

  if (!isRelative && !allowedPrefix.test(toPosix(cleaned))) {
    return null;
  }
  if (!hasSlash && !looksLikeFile) {
    return null;
  }

  return cleaned;
}

function resolveDocPath(candidate: string, docFile: string): string | null {
  const normalized = normalizeCandidatePath(candidate);
  if (!normalized) return null;

  const docAbs = path.join(PROJECT_ROOT, docFile);
  let resolved: string;
  if (normalized.startsWith('./') || normalized.startsWith('../')) {
    resolved = path.resolve(path.dirname(docAbs), normalized);
  } else {
    resolved = path.resolve(PROJECT_ROOT, normalized);
  }

  if (!resolved.startsWith(PROJECT_ROOT)) {
    return null;
  }

  return toPosix(path.relative(PROJECT_ROOT, resolved));
}

function checkPlanDocMetadata(entry: PlanEntry, state: ValidationState): void {
  const absPath = path.join(PROJECT_ROOT, entry.path);
  if (!fs.existsSync(absPath)) {
    addError(state, `[${entry.id}] plan file is missing: ${entry.path}`);
    return;
  }

  const content = fs.readFileSync(absPath, 'utf8');

  const hasLastUpdated = /(^|\n)\s*\*{0,2}(Last updated|Date|Dates)\*{0,2}\s*:/im.test(content);
  const hasOwner = /(^|\n)\s*\*{0,2}Owner[^:\n]*\*{0,2}\s*:/im.test(content);
  const hasStatus =
    /(^|\n)\s*\*{0,2}Status\*{0,2}\s*:/im.test(content) ||
    /(^|\n)\s*##\s*Phase\b/im.test(content) ||
    /(^|\n)\s*###\s*Phase\b/im.test(content);
  const hasStage = /(^|\n)\s*\*{0,2}Stage\*{0,2}\s*:/im.test(content);
  const hasUpdateLog =
    /(^|\n)\s*##\s*Update\s*Log\b/im.test(content) ||
    /(^|\n)\s*###\s*Update\s*Log\b/im.test(content);

  const missingMetadata: string[] = [];
  if (!hasLastUpdated) missingMetadata.push('Last updated/Date');
  if (!hasOwner) missingMetadata.push('Owner');
  if (!hasStatus) missingMetadata.push('Status/Phase');
  if (!hasStage) missingMetadata.push('Stage');
  if (!hasUpdateLog) missingMetadata.push('Update Log section');

  if (missingMetadata.length > 0) {
    const msg = `[${entry.id}] missing metadata in ${entry.path}: ${missingMetadata.join(', ')}`;
    if (STRICT_PLAN_METADATA) {
      addError(state, msg);
    } else {
      addWarning(state, msg);
    }
  }
}

function isPathRefIgnored(candidate: string, resolved: string | null, ignoreRegexes: RegExp[]): boolean {
  return ignoreRegexes.some((regex) => regex.test(candidate) || (resolved ? regex.test(resolved) : false));
}

function checkPlanDocPathReferences(
  entry: PlanEntry,
  state: ValidationState,
  ignoreRegexes: RegExp[],
): void {
  const absPath = path.join(PROJECT_ROOT, entry.path);
  if (!fs.existsSync(absPath)) {
    return;
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const candidates = [
    ...extractMarkdownLinkTargets(content),
    ...extractInlineCodeSegments(content),
  ];

  const missing: string[] = [];
  const checked = new Set<string>();
  for (const candidate of candidates) {
    if (isPathRefIgnored(candidate, null, ignoreRegexes)) continue;
    const resolved = resolveDocPath(candidate, entry.path);
    if (!resolved) continue;
    if (isPathRefIgnored(candidate, resolved, ignoreRegexes)) continue;
    if (checked.has(resolved)) continue;
    checked.add(resolved);

    const targetAbs = path.join(PROJECT_ROOT, resolved);
    if (!fs.existsSync(targetAbs)) {
      missing.push(resolved);
    }
  }

  if (missing.length > 0) {
    const msg = `[${entry.id}] broken path references in ${entry.path}: ${missing.sort().join(', ')}`;
    if (STRICT_PLAN_PATH_REFS) {
      addError(state, msg);
    } else {
      addWarning(state, msg);
    }
  }
}

function getChangedFiles(state: ValidationState): string[] {
  const baseSha = process.env.PLAN_BASE_SHA?.trim();
  const headSha = process.env.PLAN_HEAD_SHA?.trim();

  if (!baseSha || !headSha) {
    addWarning(
      state,
      'PLAN_BASE_SHA/PLAN_HEAD_SHA not provided; skipping code->plan drift check for this run.',
    );
    return [];
  }

  try {
    const output = execSync(`git diff --name-only ${baseSha}..${headSha}`, {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return output
      .split('\n')
      .map((line) => toPosix(line.trim()))
      .filter((line) => line.length > 0);
  } catch (err) {
    addWarning(
      state,
      `Could not compute changed files for ${baseSha}..${headSha}: ${String(err)}`,
    );
    return [];
  }
}

function isPathImpacted(changedFile: string, mappedPath: string): boolean {
  const normalizedChanged = toPosix(changedFile);
  const normalizedMapped = toPosix(mappedPath).replace(/\/+$/, '');
  return normalizedChanged === normalizedMapped || normalizedChanged.startsWith(`${normalizedMapped}/`);
}

function runCodeToPlanTouchCheck(entries: PlanEntry[], state: ValidationState): void {
  const changedFiles = getChangedFiles(state);
  if (changedFiles.length === 0) return;

  const impactedPlans = entries.filter((entry) => {
    if (entry.status !== 'active') return false;
    if (!Array.isArray(entry.code_paths) || entry.code_paths.length === 0) return false;
    return changedFiles.some((changed) => entry.code_paths.some((mapped) => isPathImpacted(changed, mapped)));
  });

  if (impactedPlans.length === 0) return;

  const changedFileSet = new Set(changedFiles);
  const registryChanged = changedFileSet.has('docs/plans/registry.yaml');
  const anyImpactedPlanTouched = impactedPlans.some((entry) => changedFileSet.has(toPosix(entry.path)));

  if (!registryChanged && !anyImpactedPlanTouched) {
    addError(
      state,
      `Code changes matched active plan ownership but no impacted plan doc was updated. ` +
      `Impacted plan ids: ${impactedPlans.map((p) => p.id).join(', ')}`,
    );
  }
}

function validateRegistryEntries(registry: RegistryFile, state: ValidationState): PlanEntry[] {
  const entries: PlanEntry[] = [];
  const idSet = new Set<string>();
  const pathSet = new Set<string>();

  registry.plans.forEach((rawEntry, index) => {
    validatePlanEntryShape(rawEntry, index, state);
    const entry = rawEntry as PlanEntry;
    entries.push(entry);

    if (typeof entry.id === 'string' && entry.id.length > 0) {
      if (idSet.has(entry.id)) {
        addError(state, `Duplicate plan id in registry: ${entry.id}`);
      }
      idSet.add(entry.id);
    }

    if (typeof entry.path === 'string' && entry.path.length > 0) {
      const normalizedPath = toPosix(entry.path);
      if (pathSet.has(normalizedPath)) {
        addError(state, `Duplicate plan path in registry: ${normalizedPath}`);
      }
      pathSet.add(normalizedPath);
    }

    if (typeof entry.path === 'string') {
      const absPath = path.resolve(PROJECT_ROOT, entry.path);
      if (!absPath.startsWith(path.resolve(PROJECT_ROOT, 'docs', 'plans'))) {
        addError(state, `[${entry.id}] path must stay under docs/plans: ${entry.path}`);
      } else if (!fs.existsSync(absPath)) {
        addError(state, `[${entry.id}] missing plan file: ${entry.path}`);
      }
    }

    if (Array.isArray(entry.code_paths)) {
      entry.code_paths.forEach((codePath) => {
        const absCodePath = path.resolve(PROJECT_ROOT, codePath);
        if (!absCodePath.startsWith(PROJECT_ROOT)) {
          addError(state, `[${entry.id}] code_path escapes project root: ${codePath}`);
          return;
        }
        if (!fs.existsSync(absCodePath)) {
          addError(state, `[${entry.id}] missing code_path: ${codePath}`);
        }
      });
    }
  });

  return entries;
}

function main(): number {
  const state: ValidationState = { errors: [], warnings: [] };

  console.log('============================================================');
  console.log('Plan Registry Check');
  console.log('============================================================');
  console.log(`Registry: ${toPosix(path.relative(PROJECT_ROOT, REGISTRY_PATH))}`);
  console.log(`Strict docs: ${STRICT_PLAN_DOCS ? 'on' : 'off'}`);
  console.log(`Strict metadata: ${STRICT_PLAN_METADATA ? 'on' : 'off'}`);
  console.log(`Strict path refs: ${STRICT_PLAN_PATH_REFS ? 'on' : 'off'}`);
  if (fs.existsSync(PATH_REF_IGNORE_FILE)) {
    console.log(`Path-ref ignore file: ${toPosix(path.relative(PROJECT_ROOT, PATH_REF_IGNORE_FILE))}`);
  }
  if (PATH_REF_IGNORE_PATTERNS.length > 0) {
    console.log(`Path-ref ignore patterns (env): ${PATH_REF_IGNORE_PATTERNS.join(', ')}`);
  }
  console.log('');

  const registry = parseRegistry(state);
  if (!registry) {
    for (const err of state.errors) {
      console.error(`ERROR: ${err}`);
    }
    return 1;
  }

  const entries = validateRegistryEntries(registry, state);
  const pathRefIgnoreRegexes = loadPathRefIgnoreRegexes(state);
  for (const entry of entries) {
    checkPlanDocMetadata(entry, state);
    checkPlanDocPathReferences(entry, state, pathRefIgnoreRegexes);
  }

  runCodeToPlanTouchCheck(entries, state);

  if (state.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of state.warnings) {
      console.log(`  - ${warning}`);
    }
    console.log('');
  }

  if (state.errors.length > 0) {
    console.error('Errors:');
    for (const err of state.errors) {
      console.error(`  - ${err}`);
    }
    console.error('');
    console.error(`Plan registry check failed with ${state.errors.length} error(s).`);
    return 1;
  }

  console.log('Plan registry check passed.');
  return 0;
}

process.exit(main());
