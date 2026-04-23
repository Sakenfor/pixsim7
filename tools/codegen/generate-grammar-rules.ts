#!/usr/bin/env tsx
/**
 * Generates grammar_rules.json from tools/cue/grammar/ CUE sources.
 *
 * Writes the same file to two consumers:
 *   - packages/core/prompt/src/grammar_rules.json   (TypeScript)
 *   - pixsim7/backend/main/services/prompt/parser/grammar_rules.json  (Python)
 *
 * Usage:
 *   pnpm grammar:gen    — generate and write
 *   pnpm grammar:check  — verify on-disk files match CUE source (CI)
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
const GRAMMAR_DIR = path.join(CUE_ROOT, 'grammar');
const CUE_BIN     = resolveCueBinary();

const OUTPUTS = [
  path.join(REPO_ROOT, 'packages', 'core', 'prompt', 'src', 'grammar_rules.json'),
  path.join(REPO_ROOT, 'pixsim7', 'backend', 'main', 'services', 'prompt', 'parser', 'grammar_rules.json'),
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

function exportGrammarRules(): string {
  const cueFiles = fsSync
    .readdirSync(GRAMMAR_DIR)
    .filter((f) => f.endsWith('.cue'))
    .sort()
    .map((f) => path.join(GRAMMAR_DIR, f));

  if (cueFiles.length === 0) {
    throw new Error(`No .cue files found in ${GRAMMAR_DIR}`);
  }

  const result = spawnSync(
    CUE_BIN,
    ['export', ...cueFiles, '-e', 'grammar_rules', '--out', 'json'],
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
  console.log(`Grammar rules generator (${CHECK_MODE ? 'check' : 'gen'} mode)`);

  const generated = exportGrammarRules();

  let anyDrift = false;
  for (const outPath of OUTPUTS) {
    const existing = await readIfExists(outPath);
    if (CHECK_MODE) {
      if (existing !== generated) {
        console.error(`DRIFT: ${path.relative(REPO_ROOT, outPath)} is stale — run pnpm grammar:gen`);
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
