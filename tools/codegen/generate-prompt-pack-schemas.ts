#!/usr/bin/env tsx
/**
 * Generates prompt content-pack schema.yaml files from CUE source packs.
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
const CUE_BIN = resolveCueBinary();

type PackTarget = {
  id: string;
  cueFile: string;
  outputFile: string;
};

const PACKS: PackTarget[] = [
  {
    id: 'core_camera',
    cueFile: path.join(PROMPT_PACKS_ROOT, 'core_camera.cue'),
    outputFile: path.join(
      REPO_ROOT,
      'pixsim7',
      'backend',
      'main',
      'content_packs',
      'prompt',
      'core_camera',
      'schema.yaml'
    ),
  },
  {
    id: 'core_direction',
    cueFile: path.join(PROMPT_PACKS_ROOT, 'core_direction.cue'),
    outputFile: path.join(
      REPO_ROOT,
      'pixsim7',
      'backend',
      'main',
      'content_packs',
      'prompt',
      'core_direction',
      'schema.yaml'
    ),
  },
];

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

  const envBin = process.env.CUE_BIN?.trim();
  if (envBin) {
    return envBin;
  }

  return 'cue';
}

function runCueExport(cueFile: string): string {
  const cueArgs = [
    'export',
    SHARED_SCHEMA_FILE,
    cueFile,
    '-e',
    'pack',
    '--out',
    'yaml',
  ];
  const result = spawnSync(
    CUE_BIN,
    cueArgs,
    {
      cwd: CUE_ROOT,
      encoding: 'utf8',
    }
  );

  if (result.error) {
    throw new Error(`Failed to execute cue for ${cueFile}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const details = `${result.stderr || result.stdout || ''}`.trim();
    throw new Error(
      `cue export failed for ${cueFile}${details ? `\n${details}` : ''}\nResolved cue binary: ${CUE_BIN}`
    );
  }

  return normalizeText(result.stdout || '');
}

async function main(): Promise<void> {
  let stale = false;

  for (const pack of PACKS) {
    const generated = runCueExport(pack.cueFile);
    const existing = await readFileIfExists(pack.outputFile);
    const existingNormalized = existing === null ? null : normalizeText(existing);

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
    console.error('Prompt pack schemas are stale. Run `pnpm prompt-packs:gen`.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
