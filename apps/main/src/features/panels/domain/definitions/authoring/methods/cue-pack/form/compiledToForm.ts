/**
 * Build a PackForm from the compile response + raw source.
 *
 * The compile service returns:
 *   - `pack_json`: resolved value of the `pack:` expression
 *   - `blocks_json`: the same `pack_json.blocks` re-dict'd
 *   - `manifest_yaml`: YAML text of the `manifest:` expression
 *
 * We don't pull manifest into the form (it's preserved verbatim
 * from source); the parser consumes only `pack_json` (preferring
 * it because it contains top-level pack fields beyond `blocks`).
 */

import { extractManifestSection } from './manifestExtractor';
import type { BlockForm, BlockMode, CueLiteralBag, PackForm, VariantForm } from './types';

interface RawPack {
  version?: unknown;
  package_name?: unknown;
  blocks?: unknown;
  [key: string]: unknown;
}

interface RawBlock {
  id?: unknown;
  group?: unknown;
  block_schema?: unknown;
  [key: string]: unknown;
}

interface RawBlockSchema {
  id_prefix?: unknown;
  mode?: unknown;
  role?: unknown;
  category?: unknown;
  text_template?: unknown;
  variants?: unknown;
  [key: string]: unknown;
}

interface RawVariant {
  key?: unknown;
  text?: unknown;
  [key: string]: unknown;
}

export function compiledToForm(
  packJson: Record<string, unknown> | null | undefined,
  source: string,
): PackForm {
  const pack = (packJson ?? {}) as RawPack;
  const blocks = Array.isArray(pack.blocks) ? (pack.blocks as RawBlock[]) : [];
  const blockForms: BlockForm[] = blocks.map(buildBlockForm);

  // Top-level extras (anything on pack: that isn't version/package_name/blocks).
  const packExtras: CueLiteralBag = {};
  for (const [k, v] of Object.entries(pack)) {
    if (k === 'version' || k === 'package_name' || k === 'blocks') continue;
    packExtras[k] = v;
  }

  const manifest = extractManifestSection(source);

  return {
    packageName: asString(pack.package_name) ?? '',
    version: asString(pack.version) ?? '1.0.0',
    extras: packExtras,
    blocks: blockForms,
    manifestSource: manifest?.text ?? null,
  };
}

function buildBlockForm(raw: RawBlock): BlockForm {
  const schema = (raw.block_schema ?? {}) as RawBlockSchema;
  const variantsRaw = Array.isArray(schema.variants) ? (schema.variants as RawVariant[]) : [];
  const variants: VariantForm[] = variantsRaw.map(buildVariantForm);

  // Split #BlockSchema extras (capabilities, descriptors, tags, op, defaults inside schema).
  const blockSchemaExtras: CueLiteralBag = {};
  for (const [k, v] of Object.entries(schema)) {
    if (
      k === 'id_prefix' ||
      k === 'mode' ||
      k === 'role' ||
      k === 'category' ||
      k === 'text_template' ||
      k === 'variants'
    ) {
      continue;
    }
    blockSchemaExtras[k] = v;
  }
  // #PackBlock extras live one level up (e.g. block-level `defaults`).
  const packBlockExtras: CueLiteralBag = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'id' || k === 'group' || k === 'block_schema') continue;
    packBlockExtras[k] = v;
  }
  if (Object.keys(packBlockExtras).length > 0) {
    blockSchemaExtras['__pack_block_extras__'] = packBlockExtras;
  }

  return {
    id: asString(raw.id) ?? '',
    group: asString(raw.group),
    idPrefix: asString(schema.id_prefix) ?? '',
    mode: normalizeMode(schema.mode),
    role: asString(schema.role),
    category: asString(schema.category),
    textTemplate: asString(schema.text_template),
    variants,
    extras: blockSchemaExtras,
  };
}

function buildVariantForm(raw: RawVariant): VariantForm {
  const extras: CueLiteralBag = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'key' || k === 'text') continue;
    extras[k] = v;
  }
  return {
    key: asString(raw.key) ?? '',
    text: asString(raw.text),
    extras,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeMode(value: unknown): BlockMode | undefined {
  if (value === 'surface' || value === 'hybrid' || value === 'op') return value;
  return undefined;
}
