#!/usr/bin/env tsx
/**
 * Audits the scoped `openapi-*` tasks in manifest.ts against the live OpenAPI
 * spec and asserts the tag partition is healthy:
 *   - EXHAUSTIVE  — every tag present in the spec is claimed by some scope
 *   - NON-OVERLAP — no tag is claimed by more than one scope
 *   - NO GHOSTS   — every tag a scope claims actually exists in the spec
 *
 * The scoped tasks share the canonical `openapi` output dir, so they're only
 * meaningful as a clean partition (see the coverage-policy note in manifest.ts).
 * This guard keeps that invariant true as backend router tags come and go.
 *
 * Usage:
 *   pnpm tsx tools/codegen/check-openapi-tag-partition.ts
 *   OPENAPI_URL=http://localhost:8000/openapi.json pnpm tsx tools/codegen/check-openapi-tag-partition.ts
 *
 * Exit codes:
 *   0 - partition is exhaustive, non-overlapping, ghost-free
 *   1 - drift detected (uncovered / overlapping / ghost tags) or spec unreachable
 */

import { CODEGEN_TASKS } from './manifest';

const OPENAPI_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
]);

const DEFAULT_OPENAPI_URL = 'http://localhost:8000/openapi.json';

function includeTagsOf(args: string[] | undefined): string[] {
  if (!args) return [];
  const i = args.indexOf('--include-tags');
  if (i === -1 || i + 1 >= args.length) return [];
  return args[i + 1]
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function loadSpecTags(url: string): Promise<Set<string>> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch OpenAPI spec (${res.status}): ${url}`);
  }
  const spec: any = await res.json();
  const tags = new Set<string>();
  for (const pathItem of Object.values<any>(spec.paths ?? {})) {
    for (const [method, op] of Object.entries<any>(pathItem ?? {})) {
      if (!OPENAPI_METHODS.has(method.toLowerCase())) continue;
      for (const tag of op?.tags ?? []) tags.add(String(tag));
    }
  }
  return tags;
}

async function main() {
  const url = process.env.OPENAPI_URL || DEFAULT_OPENAPI_URL;

  // scope -> claimed tags, for every openapi-* task carrying an --include-tags filter
  const scopes = new Map<string, string[]>();
  for (const task of CODEGEN_TASKS) {
    if (!task.id.startsWith('openapi-')) continue;
    const tags = includeTagsOf(task.args);
    if (tags.length > 0) scopes.set(task.id, tags);
  }
  if (scopes.size === 0) {
    console.error('[error] no scoped openapi-* tasks with --include-tags found in manifest');
    process.exit(1);
  }

  let specTags: Set<string>;
  try {
    specTags = await loadSpecTags(url);
  } catch (err) {
    console.error(`[error] ${(err as Error).message}`);
    console.error('  Is main-api running? Set OPENAPI_URL to override the endpoint.');
    process.exit(1);
    return;
  }

  // tag -> scopes claiming it
  const claims = new Map<string, string[]>();
  for (const [scope, tags] of scopes) {
    for (const tag of tags) {
      const list = claims.get(tag) ?? [];
      list.push(scope);
      claims.set(tag, list);
    }
  }

  const overlap = [...claims.entries()].filter(([, s]) => s.length > 1);
  const ghosts = [...claims.keys()].filter((t) => !specTags.has(t)).sort();
  const uncovered = [...specTags].filter((t) => !claims.has(t)).sort();

  console.log(
    `[info] scopes=${scopes.size} spec-tags=${specTags.size} claimed-tags=${claims.size}`
  );

  let ok = true;
  if (overlap.length > 0) {
    ok = false;
    console.error(`[fail] ${overlap.length} tag(s) claimed by >1 scope (must be exactly one):`);
    for (const [tag, s] of overlap) console.error(`         ${tag} <- ${s.join(', ')}`);
  }
  if (ghosts.length > 0) {
    ok = false;
    console.error(`[fail] ${ghosts.length} ghost tag(s) claimed but absent from spec:`);
    console.error(`         ${ghosts.join(', ')}`);
  }
  if (uncovered.length > 0) {
    ok = false;
    console.error(`[fail] ${uncovered.length} spec tag(s) covered by no scope:`);
    console.error(`         ${uncovered.join(', ')}`);
    console.error('  Assign each to exactly one openapi-* scope in tools/codegen/manifest.ts.');
  }

  if (ok) {
    console.log('[ok] openapi tag partition is exhaustive, non-overlapping, and ghost-free.');
    process.exit(0);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
