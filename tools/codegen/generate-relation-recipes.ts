#!/usr/bin/env tsx
/**
 * Generates relation_recipes.json from tools/cue/recipes/ CUE sources.
 *
 * Relation recipes are the operator-semantics layer: they enrich the
 * editor's click-to-edit popover with per-operator meaning, run-length
 * semantics, recommended swap targets, and free-form notes. They're
 * suggestions, not validation rules — the grammar accepts any operator
 * combination regardless.
 *
 * Single runtime consumer (the backend reads it and serves it over
 * /api/v1/prompts/meta/relation-recipes; the frontend fetches from there):
 *   - pixsim7/backend/main/services/prompt/parser/relation_recipes.json
 *
 * Usage:
 *   pnpm cue:recipes:gen    — generate and write
 *   pnpm cue:recipes:check  — verify on-disk file matches CUE source (CI)
 *
 * Sibling of generate-grammar-rules.ts — same CUE export → JSON shape.
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHECK_MODE = process.argv.includes('--check');

const SCRIPT_DIR  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT   = path.resolve(SCRIPT_DIR, '../..');
const CUE_ROOT    = path.join(REPO_ROOT, 'tools', 'cue');
const RECIPES_DIR = path.join(CUE_ROOT, 'recipes');
const CUE_BIN     = resolveCueBinary();

const OUTPUTS = [
  path.join(REPO_ROOT, 'pixsim7', 'backend', 'main', 'services', 'prompt', 'parser', 'relation_recipes.json'),
];

function resolveCueBinary(): string {
  const envBin = process.env.CUE_BIN?.trim();
  if (envBin) return envBin;
  for (const c of [
    path.join(CUE_ROOT, 'bin', 'cue'),
    path.join(CUE_ROOT, 'bin', 'cue.exe'),
    path.join(CUE_ROOT, 'cue'),
    path.join(CUE_ROOT, 'cue.exe'),
  ]) {
    if (fsSync.existsSync(c)) return c;
  }
  return 'cue';
}

function exportRelationRecipes(): string {
  const cueFiles = fsSync
    .readdirSync(RECIPES_DIR)
    .filter((f) => f.endsWith('.cue'))
    .sort()
    .map((f) => path.join(RECIPES_DIR, f));

  if (cueFiles.length === 0) {
    throw new Error(`No .cue files found in ${RECIPES_DIR}`);
  }

  const result = spawnSync(
    CUE_BIN,
    ['export', ...cueFiles, '-e', 'relation_recipes', '--out', 'json'],
    { cwd: CUE_ROOT, encoding: 'utf8' },
  );

  if (result.error) throw new Error(`cue exec error: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`cue export failed:\n${(result.stderr || result.stdout || '').trim()}`);
  }

  // Pretty-print with stable formatting.
  const parsed = JSON.parse(result.stdout);
  return JSON.stringify(parsed, null, 2) + '\n';
}

async function readIfExists(p: string): Promise<string | null> {
  try { return await fs.readFile(p, 'utf8'); } catch { return null; }
}

async function main() {
  console.log(`Relation recipes generator (${CHECK_MODE ? 'check' : 'gen'} mode)`);

  const generated = exportRelationRecipes();

  let anyDrift = false;
  for (const outPath of OUTPUTS) {
    const existing = await readIfExists(outPath);
    if (CHECK_MODE) {
      if (existing !== generated) {
        console.error(`DRIFT: ${path.relative(REPO_ROOT, outPath)} is stale — run pnpm cue:recipes:gen`);
        anyDrift = true;
      } else {
        console.log(`OK    ${path.relative(REPO_ROOT, outPath)}`);
      }
    } else {
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, generated, 'utf8');
      console.log(`wrote ${path.relative(REPO_ROOT, outPath)}`);
    }
  }

  if (CHECK_MODE && anyDrift) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
