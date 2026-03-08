#!/usr/bin/env tsx
/**
 * Generates prompt content-pack schema.yaml + manifest.yaml files from CUE source packs.
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

type JsonObject = Record<string, unknown>;

type DiscoveredPack = {
  id: string;
  cueFile: string;
  outputSchemaFile: string;
  outputManifestFile: string;
  packJson: JsonObject;
};

type LintState = {
  blockIdOrigins: Map<string, string>;
};

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

function runCueExportRaw(
  cueFile: string,
  expression: string,
  out: 'yaml' | 'json'
): string {
  const cueArgs = [
    'export',
    SHARED_SCHEMA_FILE,
    cueFile,
    '-e',
    expression,
    '--out',
    out,
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

function runCueExportYaml(cueFile: string, expression: string): string {
  return runCueExportRaw(cueFile, expression, 'yaml');
}

function runCueExportJson(cueFile: string, expression: string): unknown {
  const raw = runCueExportRaw(cueFile, expression, 'json');
  try {
    return JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to parse JSON cue export for ${cueFile} expression "${expression}": ${message}`
    );
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): JsonObject {
  return isRecord(value) ? value : {};
}

function resolveOutputSubdir(cueFile: string, packJson: JsonObject): string {
  // Try meta.output_subdir first
  try {
    const raw = runCueExportJson(cueFile, 'meta.output_subdir');
    const subdir = asNonEmptyString(raw);
    if (subdir) {
      validateSubdir(subdir);
      return subdir;
    }
  } catch {
    // meta.output_subdir not defined, fall through
  }

  const packageName = asNonEmptyString(packJson.package_name);
  if (!packageName) {
    throw new Error(`Could not resolve package_name from ${cueFile}`);
  }
  validateSubdir(packageName);
  return packageName;
}

async function discoverPacks(): Promise<DiscoveredPack[]> {
  const entries = await fs.readdir(PROMPT_PACKS_ROOT);
  const packs: DiscoveredPack[] = [];

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.cue') || EXCLUDED_FILES.has(entry)) {
      continue;
    }

    const cueFile = path.join(PROMPT_PACKS_ROOT, entry);
    const id = entry.replace(/\.cue$/, '');
    const packRaw = runCueExportJson(cueFile, 'pack');
    if (!isRecord(packRaw)) {
      throw new Error(`cue export "pack" must produce an object for ${cueFile}`);
    }
    const subdir = resolveOutputSubdir(cueFile, packRaw);
    const outputSchemaFile = path.join(OUTPUT_BASE, subdir, 'schema.yaml');
    const outputManifestFile = path.join(OUTPUT_BASE, subdir, 'manifest.yaml');

    packs.push({
      id,
      cueFile,
      outputSchemaFile,
      outputManifestFile,
      packJson: packRaw,
    });
  }

  return packs;
}

function lintPack(pack: DiscoveredPack, state: LintState): string[] {
  const issues: string[] = [];
  const packName = asNonEmptyString(pack.packJson.package_name) ?? pack.id;
  const blocks = asArray(pack.packJson.blocks);
  const blockEntryIds = new Set<string>();

  if (!Array.isArray(pack.packJson.blocks) || blocks.length === 0) {
    issues.push('pack.blocks must be a non-empty array');
    return issues;
  }

  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx += 1) {
    const blockEntry = asRecord(blocks[blockIdx]);
    const blockLabel = `blocks[${blockIdx}]`;
    const blockEntryId = asNonEmptyString(blockEntry.id);
    if (!blockEntryId) {
      issues.push(`${blockLabel}.id must be a non-empty string`);
      continue;
    }
    if (blockEntryIds.has(blockEntryId)) {
      issues.push(`duplicate block entry id "${blockEntryId}"`);
    }
    blockEntryIds.add(blockEntryId);

    const blockSchema = asRecord(blockEntry.block_schema);
    if (!isRecord(blockEntry.block_schema)) {
      issues.push(`${blockLabel}.block_schema must be an object`);
      continue;
    }

    const idPrefix = asNonEmptyString(blockSchema.id_prefix);
    if (!idPrefix) {
      issues.push(`${blockLabel}.block_schema.id_prefix must be a non-empty string`);
      continue;
    }

    const variants = asArray(blockSchema.variants);
    if (!Array.isArray(blockSchema.variants) || variants.length === 0) {
      issues.push(`${blockLabel}.block_schema.variants must be a non-empty array`);
      continue;
    }

    const op = isRecord(blockSchema.op) ? blockSchema.op : null;
    const opParams = op ? asArray(op.params).map(asRecord) : [];
    const opRefs = op ? asArray(op.refs).map(asRecord) : [];
    const opModalities = op ? asArray(op.modalities) : [];
    const opDefaultArgs = op ? asRecord(op.default_args) : {};
    const opId = op ? asNonEmptyString(op.op_id) : null;
    const opIdTemplate = op ? asNonEmptyString(op.op_id_template) : null;

    if (opIdTemplate && !opIdTemplate.includes('{variant}')) {
      issues.push(`${blockLabel}.block_schema.op.op_id_template must contain "{variant}"`);
    }

    const paramTypeByKey = new Map<string, string>();
    const paramEnumByKey = new Map<string, Set<string>>();
    const paramKeys = new Set<string>();
    for (let paramIdx = 0; paramIdx < opParams.length; paramIdx += 1) {
      const param = opParams[paramIdx];
      const paramKey = asNonEmptyString(param.key);
      if (!paramKey) {
        issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}].key must be a non-empty string`);
        continue;
      }
      if (paramKeys.has(paramKey)) {
        issues.push(`${blockLabel}.block_schema.op.params duplicate key "${paramKey}"`);
      }
      paramKeys.add(paramKey);

      const paramType = asNonEmptyString(param.type);
      if (!paramType) {
        issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}].type must be a non-empty string`);
        continue;
      }
      paramTypeByKey.set(paramKey, paramType);

      const paramDefault = param.default;
      if (paramType === 'boolean' && paramDefault !== undefined && typeof paramDefault !== 'boolean') {
        issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}] boolean default must be boolean`);
      }
      if (paramType === 'integer' && paramDefault !== undefined && !Number.isInteger(paramDefault)) {
        issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}] integer default must be integer`);
      }
      if (paramType === 'number' && paramDefault !== undefined && typeof paramDefault !== 'number') {
        issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}] number default must be number`);
      }
      if (paramType === 'string' && paramDefault !== undefined && typeof paramDefault !== 'string') {
        issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}] string default must be string`);
      }

      if (paramType === 'enum') {
        const enumValuesRaw = asArray(param.enum);
        if (enumValuesRaw.length === 0) {
          issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}] enum type requires enum values`);
          continue;
        }
        const enumValues = new Set<string>();
        for (let enumIdx = 0; enumIdx < enumValuesRaw.length; enumIdx += 1) {
          const enumValue = asNonEmptyString(enumValuesRaw[enumIdx]);
          if (!enumValue) {
            issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}].enum[${enumIdx}] must be non-empty string`);
            continue;
          }
          enumValues.add(enumValue);
        }
        paramEnumByKey.set(paramKey, enumValues);
        if (
          paramDefault !== undefined &&
          typeof paramDefault === 'string' &&
          !enumValues.has(paramDefault)
        ) {
          issues.push(
            `${blockLabel}.block_schema.op.params[${paramIdx}] default "${paramDefault}" is not in enum values`
          );
        }
      }

      if (paramType === 'ref') {
        if (!asNonEmptyString(param.ref_capability)) {
          issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}] ref type requires ref_capability`);
        }
      } else if (param.ref_capability !== undefined) {
        issues.push(`${blockLabel}.block_schema.op.params[${paramIdx}] ref_capability is only valid for type=ref`);
      }
    }

    for (const defaultArgKey of Object.keys(opDefaultArgs)) {
      if (!paramKeys.has(defaultArgKey)) {
        issues.push(
          `${blockLabel}.block_schema.op.default_args references unknown param "${defaultArgKey}"`
        );
      }
    }

    const refKeys = new Set<string>();
    for (let refIdx = 0; refIdx < opRefs.length; refIdx += 1) {
      const ref = opRefs[refIdx];
      const refKey = asNonEmptyString(ref.key);
      if (!refKey) {
        issues.push(`${blockLabel}.block_schema.op.refs[${refIdx}].key must be a non-empty string`);
        continue;
      }
      if (refKeys.has(refKey)) {
        issues.push(`${blockLabel}.block_schema.op.refs duplicate key "${refKey}"`);
      }
      refKeys.add(refKey);
    }

    const schemaModalities = new Set(
      opModalities
        .map(asNonEmptyString)
        .filter((value): value is string => value !== null)
    );

    const variantKeys = new Set<string>();
    const blockIdsInEntry = new Set<string>();
    const templateOrVariantOpIds = new Map<string, string>();

    for (let variantIdx = 0; variantIdx < variants.length; variantIdx += 1) {
      const variant = asRecord(variants[variantIdx]);
      const variantLabel = `${blockLabel}.block_schema.variants[${variantIdx}]`;
      const variantKey = asNonEmptyString(variant.key);
      if (!variantKey) {
        issues.push(`${variantLabel}.key must be a non-empty string`);
        continue;
      }
      if (variantKeys.has(variantKey)) {
        issues.push(`${blockLabel}.block_schema.variants duplicate key "${variantKey}"`);
      }
      variantKeys.add(variantKey);

      const explicitBlockId = asNonEmptyString(variant.block_id);
      const resolvedBlockId = explicitBlockId ?? `${idPrefix}.${variantKey}`;
      if (blockIdsInEntry.has(resolvedBlockId)) {
        issues.push(`${blockLabel} resolves duplicate block_id "${resolvedBlockId}"`);
      }
      blockIdsInEntry.add(resolvedBlockId);

      const globalOrigin = state.blockIdOrigins.get(resolvedBlockId);
      const localOrigin = `${packName}:${blockEntryId}:${variantKey}`;
      if (globalOrigin && globalOrigin !== localOrigin) {
        issues.push(
          `resolved block_id "${resolvedBlockId}" collides with ${globalOrigin}`
        );
      } else if (!globalOrigin) {
        state.blockIdOrigins.set(resolvedBlockId, localOrigin);
      }

      const variantOpArgs = asRecord(variant.op_args);
      for (const argKey of Object.keys(variantOpArgs)) {
        if (!paramKeys.has(argKey)) {
          issues.push(`${variantLabel}.op_args references unknown param "${argKey}"`);
          continue;
        }
        const paramType = paramTypeByKey.get(argKey);
        const argValue = variantOpArgs[argKey];
        if (paramType === 'enum') {
          const enumValues = paramEnumByKey.get(argKey);
          if (enumValues && typeof argValue === 'string' && !enumValues.has(argValue)) {
            issues.push(
              `${variantLabel}.op_args.${argKey} value "${argValue}" is not in enum values`
            );
          }
        } else if (paramType === 'boolean' && typeof argValue !== 'boolean') {
          issues.push(`${variantLabel}.op_args.${argKey} must be boolean`);
        } else if (paramType === 'integer' && !Number.isInteger(argValue)) {
          issues.push(`${variantLabel}.op_args.${argKey} must be integer`);
        } else if (paramType === 'number' && typeof argValue !== 'number') {
          issues.push(`${variantLabel}.op_args.${argKey} must be number`);
        } else if (paramType === 'string' && typeof argValue !== 'string') {
          issues.push(`${variantLabel}.op_args.${argKey} must be string`);
        } else if (paramType === 'ref' && typeof argValue !== 'string') {
          issues.push(`${variantLabel}.op_args.${argKey} must be string ref id`);
        }
      }

      const variantRefBindings = asRecord(variant.ref_bindings);
      for (const refKey of Object.keys(variantRefBindings)) {
        if (!refKeys.has(refKey)) {
          issues.push(`${variantLabel}.ref_bindings references unknown ref "${refKey}"`);
        }
      }

      const variantModalities = asArray(variant.op_modalities)
        .map(asNonEmptyString)
        .filter((value): value is string => value !== null);
      if (schemaModalities.size > 0) {
        for (const modality of variantModalities) {
          if (!schemaModalities.has(modality)) {
            issues.push(
              `${variantLabel}.op_modalities includes "${modality}" not present in block_schema.op.modalities`
            );
          }
        }
      }

      const variantOpId = asNonEmptyString(variant.op_id);
      let resolvedOpId: string | null = null;
      let resolvedFromTemplateOrVariant = false;
      if (variantOpId) {
        resolvedOpId = variantOpId;
        resolvedFromTemplateOrVariant = true;
      } else if (opIdTemplate) {
        resolvedOpId = opIdTemplate.replaceAll('{variant}', variantKey);
        resolvedFromTemplateOrVariant = true;
      } else if (opId) {
        resolvedOpId = opId;
      }

      const hasVariantOpFields =
        variant.op_id !== undefined ||
        variant.op_args !== undefined ||
        variant.op_modalities !== undefined ||
        variant.ref_bindings !== undefined;

      if (hasVariantOpFields && !resolvedOpId) {
        issues.push(
          `${variantLabel} defines op_* fields but no op_id can be resolved`
        );
      }

      if (resolvedOpId && resolvedFromTemplateOrVariant) {
        const prior = templateOrVariantOpIds.get(resolvedOpId);
        if (prior) {
          issues.push(
            `${blockLabel} resolves duplicate op_id "${resolvedOpId}" for variants "${prior}" and "${variantKey}"`
          );
        } else {
          templateOrVariantOpIds.set(resolvedOpId, variantKey);
        }
      }
    }
  }

  return issues;
}

async function main(): Promise<void> {
  const packs = await discoverPacks();

  if (packs.length === 0) {
    console.warn('No CUE pack files found in', PROMPT_PACKS_ROOT);
    return;
  }

  console.log(
    `Discovered ${packs.length} pack(s): ${packs.map((p) => p.id).join(', ')}`
  );

  const lintState: LintState = {
    blockIdOrigins: new Map<string, string>(),
  };

  let lintFailed = false;
  for (const pack of packs) {
    const issues = lintPack(pack, lintState);
    if (issues.length === 0) {
      console.log(`[lint-ok] ${pack.id}`);
      continue;
    }

    lintFailed = true;
    for (const issue of issues) {
      console.error(`[lint] ${pack.id}: ${issue}`);
    }
  }

  if (lintFailed) {
    console.error(
      'Prompt pack lint failed. Fix schema contract issues before generating output.'
    );
    process.exit(1);
  }

  let stale = false;

  for (const pack of packs) {
    const generatedSchema = normalizeText(runCueExportYaml(pack.cueFile, 'pack'));
    const generatedManifest = normalizeText(
      runCueExportYaml(pack.cueFile, 'manifest')
    );

    const existingSchema = await readFileIfExists(pack.outputSchemaFile);
    const existingSchemaNormalized =
      existingSchema === null ? null : normalizeText(existingSchema);

    const existingManifest = await readFileIfExists(pack.outputManifestFile);
    const existingManifestNormalized =
      existingManifest === null ? null : normalizeText(existingManifest);

    if (CHECK_MODE) {
      const schemaOk = existingSchemaNormalized === generatedSchema;
      const manifestOk = existingManifestNormalized === generatedManifest;

      if (schemaOk && manifestOk) {
        console.log(`[ok] ${pack.id} schema+manifest are up-to-date`);
      } else {
        stale = true;
        if (!schemaOk) {
          console.error(
            `[stale] ${pack.id} schema differs: ${pack.outputSchemaFile}`
          );
        }
        if (!manifestOk) {
          console.error(
            `[stale] ${pack.id} manifest differs: ${pack.outputManifestFile}`
          );
        }
      }
      continue;
    }

    const schemaChanged = existingSchemaNormalized !== generatedSchema;
    const manifestChanged = existingManifestNormalized !== generatedManifest;

    if (!schemaChanged && !manifestChanged) {
      console.log(`[skip] ${pack.id} schema+manifest already up-to-date`);
      continue;
    }

    await fs.mkdir(path.dirname(pack.outputSchemaFile), { recursive: true });
    if (schemaChanged) {
      await fs.writeFile(pack.outputSchemaFile, generatedSchema, 'utf8');
      console.log(`[gen] ${pack.id} schema -> ${pack.outputSchemaFile}`);
    } else {
      console.log(`[skip] ${pack.id} schema already up-to-date`);
    }
    if (manifestChanged) {
      await fs.writeFile(pack.outputManifestFile, generatedManifest, 'utf8');
      console.log(`[gen] ${pack.id} manifest -> ${pack.outputManifestFile}`);
    } else {
      console.log(`[skip] ${pack.id} manifest already up-to-date`);
    }
  }

  if (CHECK_MODE && stale) {
    console.error(
      'Prompt pack schemas/manifests are stale. Run `pnpm prompt-packs:gen`.'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
