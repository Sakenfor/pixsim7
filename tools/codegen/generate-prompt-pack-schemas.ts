#!/usr/bin/env tsx
/**
 * Generates prompt content-pack schema.yaml files from CUE source packs.
 *
 * Auto-discovers all .cue files in tools/cue/prompt_packs/ (excluding schema_v1.cue).
 * Output subdir is derived from `pack.package_name` unless `meta.output_subdir` is set.
 *
 * Usage:
 *   pnpm prompt-packs:gen
 *   pnpm prompt-packs:check
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHECK_MODE = process.argv.includes('--check');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const CUE_ROOT = path.join(REPO_ROOT, 'tools', 'cue');
const PROMPT_PACKS_ROOT = path.join(CUE_ROOT, 'prompt_packs');
const SHARED_SCHEMA_FILE = path.join(PROMPT_PACKS_ROOT, 'schema_v1.cue');
const OUTPUT_BASE = path.join(
  REPO_ROOT,
  'pixsim7',
  'backend',
  'main',
  'content_packs',
  'prompt'
);
const CUE_BIN = resolveCueBinary();

const EXCLUDED_FILES = new Set(['schema_v1.cue']);

function normalizeText(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trimEnd();
  return `${normalized}\n`;
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function resolveCueBinary(): string {
  const envBin = process.env.CUE_BIN?.trim();
  if (envBin) {
    return envBin;
  }

  const localCandidates = [
    path.join(CUE_ROOT, 'cue.exe'),
    path.join(CUE_ROOT, 'cue'),
    path.join(CUE_ROOT, 'bin', 'cue.exe'),
    path.join(CUE_ROOT, 'bin', 'cue'),
  ];

  for (const candidate of localCandidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'cue';
}

function validateSubdir(subdir: string): void {
  if (
    path.isAbsolute(subdir) ||
    subdir.includes('..') ||
    subdir.includes('/') ||
    subdir.includes('\\') ||
    subdir.startsWith('.')
  ) {
    throw new Error(`Unsafe output subdir: "${subdir}"`);
  }
}

function runCueExport(cueFile: string, expression: string): string {
  const cueArgs = [
    'export',
    SHARED_SCHEMA_FILE,
    cueFile,
    '-e',
    expression,
    '--out',
    'yaml',
  ];
  const result = spawnSync(CUE_BIN, cueArgs, {
    cwd: CUE_ROOT,
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(
      `Failed to execute cue for ${cueFile}: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    const details = `${result.stderr || result.stdout || ''}`.trim();
    throw new Error(
      `cue export failed for ${cueFile}${details ? `\n${details}` : ''}\nResolved cue binary: ${CUE_BIN}`
    );
  }

  return result.stdout || '';
}

function resolveOutputSubdir(cueFile: string): string {
  // Try meta.output_subdir first
  try {
    const raw = runCueExport(cueFile, 'meta.output_subdir');
    const subdir = raw.trim().replace(/^["']|["']$/g, '');
    if (subdir) {
      validateSubdir(subdir);
      return subdir;
    }
  } catch {
    // meta.output_subdir not defined — fall through
  }

  // Fall back to pack.package_name
  const raw = runCueExport(cueFile, 'pack.package_name');
  const subdir = raw.trim().replace(/^["']|["']$/g, '');
  if (!subdir) {
    throw new Error(`Could not resolve package_name from ${cueFile}`);
  }
  validateSubdir(subdir);
  return subdir;
}

async function discoverPacks(): Promise<
  Array<{ id: string; cueFile: string; outputFile: string }>
> {
  const entries = await fs.readdir(PROMPT_PACKS_ROOT);
  const packs: Array<{ id: string; cueFile: string; outputFile: string }> = [];

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.cue') || EXCLUDED_FILES.has(entry)) {
      continue;
    }

    const cueFile = path.join(PROMPT_PACKS_ROOT, entry);
    const id = entry.replace(/\.cue$/, '');
    const subdir = resolveOutputSubdir(cueFile);
    const outputFile = path.join(OUTPUT_BASE, subdir, 'schema.yaml');

    packs.push({ id, cueFile, outputFile });
  }

  return packs;
}

async function main(): Promise<void> {
  const packs = await discoverPacks();

  if (packs.length === 0) {
    console.warn('No CUE pack files found in', PROMPT_PACKS_ROOT);
    return;
  }

  console.log(`Discovered ${packs.length} pack(s): ${packs.map((p) => p.id).join(', ')}`);

  let stale = false;

  for (const pack of packs) {
    const generated = normalizeText(runCueExport(pack.cueFile, 'pack'));
    const existing = await readFileIfExists(pack.outputFile);
    const existingNormalized =
      existing === null ? null : normalizeText(existing);

    if (CHECK_MODE) {
      if (existingNormalized === generated) {
        console.log(`[ok] ${pack.id} schema is up-to-date`);
      } else {
        stale = true;
        console.error(`[stale] ${pack.id} schema differs: ${pack.outputFile}`);
      }
      continue;
    }

    if (existingNormalized === generated) {
      console.log(`[skip] ${pack.id} schema already up-to-date`);
      continue;
    }

    await fs.mkdir(path.dirname(pack.outputFile), { recursive: true });
    await fs.writeFile(pack.outputFile, generated, 'utf8');
    console.log(`[gen] ${pack.id} -> ${pack.outputFile}`);
  }

  if (CHECK_MODE && stale) {
    console.error(
      'Prompt pack schemas are stale. Run `pnpm prompt-packs:gen`.'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
