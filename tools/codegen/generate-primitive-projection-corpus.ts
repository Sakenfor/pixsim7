#!/usr/bin/env tsx
/**
 * Generate primitive-projection evaluation corpus from CUE prompt-pack variants.
 *
 * Source of truth:
 *   tools/cue/prompt_packs/*.cue
 *   tools/cue/prompt_packs/<pack>/*.cue
 *
 * Output:
 *   pixsim7/backend/tests/blocks/evals/primitive_projection/eval_corpus_autogen.json
 *
 * Usage:
 *   pnpm projection-corpus:gen
 *   pnpm projection-corpus:check
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type JsonObject = Record<string, unknown>;

type DiscoveredSource = {
  id: string;
  cueSource: string;
};

type CorpusEntry = {
  id: string;
  text: string;
  category: string;
  expected_block_prefix: string | null;
  expected_category: string | null;
  notes: string;
};

const CHECK_MODE = process.argv.includes('--check');
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const CUE_ROOT = path.join(REPO_ROOT, 'tools', 'cue');
const PROMPT_PACKS_ROOT = path.join(CUE_ROOT, 'prompt_packs');
const SHARED_SCHEMA_FILE = path.join(PROMPT_PACKS_ROOT, 'schema_v1.cue');
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'pixsim7',
  'backend',
  'tests',
  'blocks',
  'evals',
  'primitive_projection',
  'eval_corpus_autogen.json'
);
const EXCLUDED_FILES = new Set(['schema_v1.cue']);

function getArgValue(flag: string): string | null {
  const prefix = `${flag}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) {
    return direct.slice(prefix.length);
  }
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1] ?? null;
  }
  return null;
}

function normalizeText(value: string): string {
  return `${value.replace(/\r\n/g, '\n').trimEnd()}\n`;
}

function asRecord(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

const CUE_BIN = resolveCueBinary();

function collectCueFilesRecursively(root: string): string[] {
  const out: string[] = [];
  const entries = fsSync.readdirSync(root, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectCueFilesRecursively(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.cue')) {
      out.push(fullPath);
    }
  }
  return out;
}

function resolveCueSourceArgs(cueSource: string): string[] {
  if (fsSync.existsSync(cueSource) && fsSync.statSync(cueSource).isDirectory()) {
    const cueFiles = collectCueFilesRecursively(cueSource);
    if (cueFiles.length === 0) {
      throw new Error(`No .cue files found under prompt-pack source directory: ${cueSource}`);
    }
    return cueFiles;
  }
  return [cueSource];
}

function runCueExportJson(cueSource: string, expression: string): unknown {
  const cueSourceArgs = resolveCueSourceArgs(cueSource);
  const cueArgs = [
    'export',
    SHARED_SCHEMA_FILE,
    ...cueSourceArgs,
    '-e',
    expression,
    '--out',
    'json',
  ];

  const result = spawnSync(CUE_BIN, cueArgs, {
    cwd: CUE_ROOT,
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(`Failed to execute cue for ${cueSource}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = `${result.stderr || result.stdout || ''}`.trim();
    throw new Error(
      `cue export failed for ${cueSource}${details ? `\n${details}` : ''}\nResolved cue binary: ${CUE_BIN}`
    );
  }

  try {
    return JSON.parse(result.stdout || '');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse CUE JSON output for ${cueSource}: ${message}`);
  }
}

async function discoverCueSources(): Promise<DiscoveredSource[]> {
  const entries = await fs.readdir(PROMPT_PACKS_ROOT, { withFileTypes: true });
  const sources: DiscoveredSource[] = [];
  const seenIds = new Set<string>();

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    let id: string | null = null;
    let cueSource: string | null = null;

    if (entry.isFile()) {
      if (!entry.name.endsWith('.cue') || EXCLUDED_FILES.has(entry.name)) {
        continue;
      }
      id = entry.name.replace(/\.cue$/, '');
      cueSource = path.join(PROMPT_PACKS_ROOT, entry.name);
    } else if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'cue.mod') {
        continue;
      }
      const dirPath = path.join(PROMPT_PACKS_ROOT, entry.name);
      const cueFiles = collectCueFilesRecursively(dirPath);
      if (cueFiles.length === 0) {
        continue;
      }
      id = entry.name;
      cueSource = dirPath;
    }

    if (!id || !cueSource) {
      continue;
    }
    if (seenIds.has(id)) {
      throw new Error(
        `Duplicate prompt-pack id "${id}" discovered in tools/cue/prompt_packs sources.`
      );
    }
    seenIds.add(id);
    sources.push({ id, cueSource });
  }

  return sources;
}

function humanizeToken(value: string): string {
  return value
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTagPhrase(tags: JsonObject): string | null {
  const keys = Object.keys(tags).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    if (!key.includes('synonym') && key !== 'image_surface' && key !== 'video_surface') {
      continue;
    }
    const raw = tags[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string' && item.trim()) {
          return item.trim();
        }
      }
    }
  }
  return null;
}

function renderVariantPromptText(
  variantKey: string,
  variant: JsonObject,
  blockSchema: JsonObject
): string {
  const pieces: string[] = [];
  const variantText = asNonEmptyString(variant.text);
  const textTemplate = asNonEmptyString(blockSchema.text_template);

  if (variantText) {
    pieces.push(variantText);
  } else if (textTemplate) {
    pieces.push(textTemplate.replaceAll('{variant}', humanizeToken(variantKey)));
  } else {
    pieces.push(humanizeToken(variantKey));
  }

  const baseTags = asRecord(blockSchema.tags);
  const variantTags = asRecord(variant.tags);
  const synonym = firstTagPhrase(variantTags) ?? firstTagPhrase(baseTags);
  if (synonym) {
    pieces.push(synonym);
  }

  const opDefaultArgs = asRecord(asRecord(asRecord(blockSchema.op).default_args));
  const opArgs = { ...opDefaultArgs, ...asRecord(variant.op_args) };
  const argTerms = Object.values(opArgs)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, 4)
    .map((value) => humanizeToken(value));
  if (argTerms.length > 0) {
    pieces.push(argTerms.join(' '));
  }

  pieces.push(humanizeToken(variantKey));
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const piece of pieces) {
    const normalized = piece.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalized);
  }

  const text = deduped.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) {
    return `${humanizeToken(variantKey)}.`;
  }
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function buildCorpusFromPacks(packs: Array<{ id: string; packJson: JsonObject }>): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  let counter = 1;

  for (const pack of packs) {
    const blocks = asArray(pack.packJson.blocks);
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = asRecord(blocks[blockIndex]);
      const blockSchema = asRecord(block.block_schema);
      const category = asNonEmptyString(blockSchema.category) ?? 'unknown';
      const idPrefix = asNonEmptyString(blockSchema.id_prefix);
      const blockId = asNonEmptyString(block.id) ?? `block_${blockIndex + 1}`;
      const variants = asArray(blockSchema.variants);

      for (const rawVariant of variants) {
        const variant = asRecord(rawVariant);
        const variantKey = asNonEmptyString(variant.key);
        if (!variantKey) {
          continue;
        }
        const explicitBlockId = asNonEmptyString(variant.block_id);
        const resolvedBlockId = explicitBlockId ?? (idPrefix ? `${idPrefix}.${variantKey}` : null);
        if (!resolvedBlockId) {
          continue;
        }

        const promptText = renderVariantPromptText(
          variantKey,
          variant,
          blockSchema
        );

        entries.push({
          id: `auto_${String(counter).padStart(4, '0')}`,
          text: promptText,
          category,
          expected_block_prefix: resolvedBlockId,
          expected_category: category,
          notes: `autogen from ${pack.id}/${blockId}:${variantKey}`,
        });
        counter += 1;
      }
    }
  }

  return entries;
}

async function main(): Promise<void> {
  const outputOverride = getArgValue('--output');
  const outputPath = outputOverride
    ? path.resolve(REPO_ROOT, outputOverride)
    : DEFAULT_OUTPUT;

  const sources = await discoverCueSources();
  if (sources.length === 0) {
    throw new Error(`No CUE prompt-pack sources found in ${PROMPT_PACKS_ROOT}`);
  }

  const loaded = sources.map((source) => {
    const packRaw = runCueExportJson(source.cueSource, 'pack');
    if (typeof packRaw !== 'object' || packRaw === null || Array.isArray(packRaw)) {
      throw new Error(`cue export "pack" must produce an object for ${source.cueSource}`);
    }
    return {
      id: source.id,
      packJson: packRaw as JsonObject,
    };
  });

  const corpusEntries = buildCorpusFromPacks(loaded);
  const categoryCounts = corpusEntries.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});

  const payload = {
    _meta: {
      description: 'Auto-generated corpus for primitive_projection shadow-mode evaluation',
      version: '1.0.0',
      generated_from: 'tools/cue/prompt_packs',
      total_entries: corpusEntries.length,
      category_counts: categoryCounts,
    },
    corpus: corpusEntries,
  };

  const generated = normalizeText(JSON.stringify(payload, null, 2));
  const existing = normalizeText(
    fsSync.existsSync(outputPath) ? fsSync.readFileSync(outputPath, 'utf8') : ''
  );

  if (CHECK_MODE) {
    if (!fsSync.existsSync(outputPath)) {
      throw new Error(`Autogen corpus is missing: ${outputPath}. Run projection-corpus:gen.`);
    }
    if (generated !== existing) {
      throw new Error(`Autogen corpus is stale: ${outputPath}. Run projection-corpus:gen.`);
    }
    console.log(`[ok] primitive projection corpus is up-to-date: ${outputPath}`);
    return;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, generated, 'utf8');
  console.log(
    `[gen] primitive projection corpus -> ${outputPath} (${corpusEntries.length} entries)`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
