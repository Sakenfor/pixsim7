import fs from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

export type PlanPriority = 'high' | 'normal' | 'low';

const VALID_PRIORITIES = new Set<PlanPriority>(['high', 'normal', 'low']);
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
  scope: 'active' | 'done' | 'parked';
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

type PlanScope = 'active' | 'done' | 'parked';

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      return null;
    }
    out.push(item.trim());
  }
  return out;
}

function walkManifests(dirAbs: string, out: string[]): void {
  if (!fs.existsSync(dirAbs)) return;
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    const childAbs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      walkManifests(childAbs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === 'manifest.yaml' || entry.name === 'manifest.yml') {
      out.push(childAbs);
    }
  }
}

export function discoverPlanManifestFiles(
  projectRoot: string,
  scopes: PlanScope[] = ['active', 'done', 'parked'],
): string[] {
  const out: string[] = [];
  for (const scope of scopes) {
    const scopeDir = path.join(projectRoot, 'docs', 'plans', scope);
    walkManifests(scopeDir, out);
  }
  out.sort((a, b) => toPosix(path.relative(projectRoot, a)).localeCompare(toPosix(path.relative(projectRoot, b))));
  return out.map((abs) => toPosix(path.relative(projectRoot, abs)));
}

function resolveManifestRelativePath(
  projectRoot: string,
  manifestAbs: string,
  rawPath: string,
): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  const resolvedAbs = trimmed.startsWith('./') || trimmed.startsWith('../')
    ? path.resolve(path.dirname(manifestAbs), trimmed)
    : path.resolve(projectRoot, trimmed);

  if (!isWithinRoot(projectRoot, resolvedAbs)) {
    return null;
  }
  return toPosix(path.relative(projectRoot, resolvedAbs));
}

function inferScopeFromManifestPath(projectRoot: string, manifestRel: string): PlanScope | null {
  const normalized = toPosix(manifestRel);
  const scopes: PlanScope[] = ['active', 'done', 'parked'];
  for (const scope of scopes) {
    const prefix = `docs/plans/${scope}/`;
    if (normalized.startsWith(prefix)) return scope;
  }
  return null;
}

function parseManifestFile(projectRoot: string, manifestRel: string, result: ManifestLoadResult): void {
  const manifestAbs = path.join(projectRoot, manifestRel);
  const scope = inferScopeFromManifestPath(projectRoot, manifestRel);
  if (!scope) {
    result.errors.push(`Manifest outside docs/plans scope: ${manifestRel}`);
    return;
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(fs.readFileSync(manifestAbs, 'utf8'));
  } catch (err) {
    result.errors.push(`Could not parse manifest ${manifestRel}: ${String(err)}`);
    return;
  }

  if (!parsed || typeof parsed !== 'object') {
    result.errors.push(`Manifest must be a YAML object: ${manifestRel}`);
    return;
  }
  const obj = parsed as Partial<PlanManifest>;

  const requiredStringFields: Array<keyof PlanManifest> = [
    'id',
    'title',
    'status',
    'stage',
    'owner',
    'last_updated',
    'plan_path',
  ];

  for (const field of requiredStringFields) {
    const value = obj[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      result.errors.push(`Manifest ${manifestRel} missing/invalid "${field}"`);
      return;
    }
  }

  const codePaths = normalizeStringArray(obj.code_paths);
  if (codePaths === null) {
    result.errors.push(`Manifest ${manifestRel} missing/invalid "code_paths" (must be string array)`);
    return;
  }

  const companions = normalizeStringArray(obj.companions) ?? [];
  const handoffs = normalizeStringArray(obj.handoffs) ?? [];
  const tags = normalizeStringArray(obj.tags) ?? [];
  const dependsOn = normalizeStringArray(obj.depends_on) ?? [];

  let priority: PlanPriority = 'normal';
  if ('priority' in obj && obj.priority !== undefined && obj.priority !== null) {
    if (typeof obj.priority !== 'string' || !VALID_PRIORITIES.has(obj.priority as PlanPriority)) {
      result.errors.push(`Manifest ${manifestRel} has invalid "priority" (must be high|normal|low, got: ${String(obj.priority)})`);
      return;
    }
    priority = obj.priority as PlanPriority;
  }

  let summary = '';
  if ('summary' in obj && obj.summary !== undefined && obj.summary !== null) {
    if (typeof obj.summary !== 'string') {
      result.errors.push(`Manifest ${manifestRel} has invalid "summary" (must be a string)`);
      return;
    }
    summary = obj.summary.trim();
  }

  const planPath = resolveManifestRelativePath(projectRoot, manifestAbs, obj.plan_path!.trim());
  if (!planPath) {
    result.errors.push(`Manifest ${manifestRel} has invalid plan_path: ${obj.plan_path}`);
    return;
  }

  const planAbs = path.join(projectRoot, planPath);
  if (!fs.existsSync(planAbs)) {
    result.errors.push(`Manifest ${manifestRel} points to missing plan_path: ${planPath}`);
    return;
  }

  const normalizedCodePaths: string[] = [];
  for (const rawPath of codePaths) {
    const resolved = resolveManifestRelativePath(projectRoot, manifestAbs, rawPath);
    if (!resolved) {
      result.errors.push(`Manifest ${manifestRel} has invalid code_path: ${rawPath}`);
      return;
    }
    const resolvedAbs = path.join(projectRoot, resolved);
    if (!fs.existsSync(resolvedAbs)) {
      result.errors.push(`Manifest ${manifestRel} references missing code_path: ${resolved}`);
      return;
    }
    normalizedCodePaths.push(resolved);
  }

  const normalizePathArray = (values: string[], field: 'companions' | 'handoffs'): string[] => {
    const out: string[] = [];
    for (const rawPath of values) {
      const resolved = resolveManifestRelativePath(projectRoot, manifestAbs, rawPath);
      if (!resolved) {
        result.errors.push(`Manifest ${manifestRel} has invalid ${field} path: ${rawPath}`);
        return [];
      }
      out.push(resolved);
    }
    return out;
  };

  const normalizedCompanions = normalizePathArray(companions, 'companions');
  const normalizedHandoffs = normalizePathArray(handoffs, 'handoffs');
  if (result.errors.length > 0) return;

  for (const companion of normalizedCompanions) {
    const companionAbs = path.join(projectRoot, companion);
    if (!fs.existsSync(companionAbs)) {
      result.errors.push(`Manifest ${manifestRel} references missing companion: ${companion}`);
      return;
    }
  }
  for (const handoff of normalizedHandoffs) {
    const handoffAbs = path.join(projectRoot, handoff);
    if (!fs.existsSync(handoffAbs)) {
      result.errors.push(`Manifest ${manifestRel} references missing handoff: ${handoff}`);
      return;
    }
  }

  result.manifests.push({
    scope,
    manifest_path: manifestRel,
    manifest_dir: toPosix(path.relative(projectRoot, path.dirname(manifestAbs))),
    id: obj.id!.trim(),
    title: obj.title!.trim(),
    status: obj.status!.trim(),
    stage: obj.stage!.trim(),
    owner: obj.owner!.trim(),
    last_updated: obj.last_updated!.trim(),
    plan_path: planPath,
    code_paths: normalizedCodePaths,
    companions: normalizedCompanions,
    handoffs: normalizedHandoffs,
    tags,
    depends_on: dependsOn,
    priority,
    summary,
  });
}

export function loadPlanManifests(
  projectRoot: string,
  scopes: PlanScope[] = ['active', 'done', 'parked'],
): ManifestLoadResult {
  const result: ManifestLoadResult = { manifests: [], errors: [], warnings: [] };
  const manifestFiles = discoverPlanManifestFiles(projectRoot, scopes);
  for (const manifestRel of manifestFiles) {
    parseManifestFile(projectRoot, manifestRel, result);
  }

  const idToPath = new Map<string, string>();
  const planPathToId = new Map<string, string>();
  for (const manifest of result.manifests) {
    const existingForId = idToPath.get(manifest.id);
    if (existingForId) {
      result.errors.push(`Duplicate manifest id "${manifest.id}": ${existingForId}, ${manifest.manifest_path}`);
    } else {
      idToPath.set(manifest.id, manifest.manifest_path);
    }

    const existingForPlanPath = planPathToId.get(manifest.plan_path);
    if (existingForPlanPath) {
      result.errors.push(
        `Duplicate plan_path "${manifest.plan_path}" used by manifest ids "${existingForPlanPath}" and "${manifest.id}"`,
      );
    } else {
      planPathToId.set(manifest.plan_path, manifest.id);
    }

    if (manifest.scope === 'active' && manifest.status !== 'active') {
      result.warnings.push(
        `Active manifest ${manifest.manifest_path} has status "${manifest.status}" (expected "active")`,
      );
    }
  }

  return result;
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
