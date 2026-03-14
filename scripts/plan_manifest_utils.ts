/**
 * @deprecated All governance logic has moved to Python:
 *   pixsim7/backend/main/services/docs/plan_governance.py
 *   scripts/plan_governance_cli.py
 *
 * This module is retained only as a reference. No TS code imports it.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import YAML from 'yaml';

export type PlanPriority = 'high' | 'normal' | 'low';
export type PlanScope = 'active' | 'done' | 'parked';

const VALID_SCOPES = new Set<PlanScope>(['active', 'done', 'parked']);
const PRIORITY_ORDER: Record<PlanPriority, number> = { high: 0, normal: 1, low: 2 };

export type PlanRegistryEntry = {
  id: string;
  path: string;
  status: string;
  stage: string;
  owner: string;
  last_updated: string;
  code_paths: string[];
  priority: PlanPriority;
  summary: string;
};

export type PlanRegistryFile = {
  version: 1;
  plans: PlanRegistryEntry[];
};

export type PlanManifest = {
  id: string;
  title: string;
  status: string;
  stage: string;
  owner: string;
  last_updated: string;
  plan_path: string;
  code_paths: string[];
  companions?: string[];
  handoffs?: string[];
  tags?: string[];
  depends_on?: string[];
  priority?: PlanPriority;
  summary?: string;
};

export type PlanManifestRecord = {
  scope: PlanScope;
  manifest_path: string;
  manifest_dir: string;
  id: string;
  title: string;
  status: string;
  stage: string;
  owner: string;
  last_updated: string;
  plan_path: string;
  code_paths: string[];
  companions: string[];
  handoffs: string[];
  tags: string[];
  depends_on: string[];
  priority: PlanPriority;
  summary: string;
};

export type ManifestLoadResult = {
  manifests: PlanManifestRecord[];
  errors: string[];
  warnings: string[];
};

type ExportPayload = {
  manifests?: unknown;
  errors?: unknown;
  warnings?: unknown;
};

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function isPlanScope(value: unknown): value is PlanScope {
  return typeof value === 'string' && VALID_SCOPES.has(value as PlanScope);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeManifestRecord(
  raw: unknown,
  index: number,
  errors: string[],
): PlanManifestRecord | null {
  if (!raw || typeof raw !== 'object') {
    errors.push(`Exporter manifest[${index}] must be an object`);
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!isPlanScope(obj.scope)) {
    errors.push(`Exporter manifest[${index}] has invalid scope: ${String(obj.scope)}`);
    return null;
  }

  const requiredStrings = [
    'manifest_path',
    'manifest_dir',
    'id',
    'title',
    'status',
    'stage',
    'owner',
    'last_updated',
    'plan_path',
  ] as const;
  for (const field of requiredStrings) {
    if (typeof obj[field] !== 'string' || obj[field].trim().length === 0) {
      errors.push(`Exporter manifest[${index}] missing/invalid "${field}"`);
      return null;
    }
  }

  const priorityRaw = typeof obj.priority === 'string' ? obj.priority : 'normal';
  const priority: PlanPriority = (priorityRaw === 'high' || priorityRaw === 'normal' || priorityRaw === 'low')
    ? priorityRaw
    : 'normal';

  return {
    scope: obj.scope,
    manifest_path: toPosix(obj.manifest_path),
    manifest_dir: toPosix(obj.manifest_dir),
    id: obj.id.trim(),
    title: obj.title.trim(),
    status: obj.status.trim(),
    stage: obj.stage.trim(),
    owner: obj.owner.trim(),
    last_updated: obj.last_updated.trim(),
    plan_path: toPosix(obj.plan_path),
    code_paths: asStringArray(obj.code_paths).map(toPosix),
    companions: asStringArray(obj.companions).map(toPosix),
    handoffs: asStringArray(obj.handoffs).map(toPosix),
    tags: asStringArray(obj.tags),
    depends_on: asStringArray(obj.depends_on),
    priority,
    summary: typeof obj.summary === 'string' ? obj.summary.trim() : '',
  };
}

// Canonical parser lives in backend docs service; TS tooling consumes its projection.
export function loadPlanManifests(
  projectRoot: string,
  scopes: PlanScope[] = ['active', 'done', 'parked'],
): ManifestLoadResult {
  const result: ManifestLoadResult = { manifests: [], errors: [], warnings: [] };
  const exporter = path.join(projectRoot, 'scripts', 'plan_manifest_service_export.py');

  try {
    const stdout = execFileSync(
      'python',
      [
        exporter,
        '--project-root',
        projectRoot,
        '--scopes',
        scopes.join(','),
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const payload = JSON.parse(stdout) as ExportPayload;

    if (Array.isArray(payload.errors)) {
      result.errors.push(...payload.errors.map((item) => String(item)));
    }
    if (Array.isArray(payload.warnings)) {
      result.warnings.push(...payload.warnings.map((item) => String(item)));
    }

    if (!Array.isArray(payload.manifests)) {
      result.errors.push('Exporter payload missing manifests array');
      return result;
    }

    payload.manifests.forEach((raw, index) => {
      const normalized = normalizeManifestRecord(raw, index, result.errors);
      if (normalized) {
        result.manifests.push(normalized);
      }
    });
  } catch (err) {
    result.errors.push(`Could not load manifests via docs service exporter: ${String(err)}`);
  }

  result.manifests.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}

export function discoverPlanManifestFiles(
  projectRoot: string,
  scopes: PlanScope[] = ['active', 'done', 'parked'],
): string[] {
  const result = loadPlanManifests(projectRoot, scopes);
  return [...result.manifests]
    .map((manifest) => toPosix(manifest.manifest_path))
    .sort((a, b) => a.localeCompare(b));
}

export function buildRegistryFromActiveManifests(manifests: PlanManifestRecord[]): PlanRegistryFile {
  const plans: PlanRegistryEntry[] = manifests
    .filter((manifest) => manifest.scope === 'active')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((manifest) => ({
      id: manifest.id,
      path: manifest.plan_path,
      status: manifest.status,
      stage: manifest.stage,
      owner: manifest.owner,
      last_updated: manifest.last_updated,
      code_paths: [...manifest.code_paths],
      priority: manifest.priority,
      summary: manifest.summary,
    }));

  return {
    version: 1,
    plans,
  };
}

export function stringifyRegistryYaml(registry: PlanRegistryFile): string {
  return YAML.stringify(registry, {
    lineWidth: 0,
  });
}

export function generatePlanIndexMarkdown(manifests: PlanManifestRecord[]): string {
  const active = manifests
    .filter((m) => m.scope === 'active')
    .sort((a, b) => {
      const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pd !== 0) return pd;
      return a.id.localeCompare(b.id);
    });

  if (active.length === 0) {
    return '*(No active plans found.)*';
  }

  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const lines: string[] = [];
  lines.push('| Plan | Stage | Owner | Priority | Summary |');
  lines.push('| ---- | ----- | ----- | -------- | ------- |');
  for (const m of active) {
    const link = `[${esc(m.title)}](active/${m.id}/plan.md)`;
    const pri = m.priority === 'normal' ? '' : m.priority;
    lines.push(`| ${link} | ${esc(m.stage)} | ${esc(m.owner)} | ${pri} | ${esc(m.summary)} |`);
  }
  return lines.join('\n');
}
