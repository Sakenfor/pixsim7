/**
 * Generate CUE source from a PackForm.
 *
 * The output is intentionally regular: tab-indented, fields in a
 * fixed order, opaque `extras` rendered as a flat key/value tail at
 * the end of each scope. It compiles against
 * tools/cue/prompt_packs/schema_v1.cue.
 *
 * Two design choices worth highlighting:
 *
 * 1. **No CUE refs are emitted.** The form operates on compiled JSON,
 *    where references like `#VerticalAngleValues` have already been
 *    resolved to inline enum arrays. Regenerating brings those
 *    inlined values back into the source verbatim — a real loss
 *    vs hand-written source, surfaced as a `BuilderCaveat` so users
 *    can opt out.
 *
 * 2. **Manifest is preserved verbatim.** The Builder only owns the
 *    `pack:` expression. Everything in `manifest:` is appended back
 *    from `PackForm.manifestSource`, so matrix presets and pack
 *    metadata are never silently rewritten.
 */

import type { BlockForm, CueLiteralBag, PackForm, VariantForm } from './types';

// ── Public API ───────────────────────────────────────────────────────

export function generateCueSource(form: PackForm): string {
  const lines: string[] = [];
  lines.push('package promptpacks');
  lines.push('');
  if (form.preamble && form.preamble.trim()) {
    lines.push(form.preamble.trimEnd());
    lines.push('');
  }
  lines.push('pack: #PromptBlockPackV1 & {');
  lines.push(`\tversion:      ${cueString(form.version || '1.0.0')}`);
  lines.push(`\tpackage_name: ${cueString(form.packageName)}`);
  emitExtras(lines, form.extras, /* indent */ 1, /* skipKeys */ EMPTY_SKIP);
  lines.push('\tblocks: [');
  for (const block of form.blocks) {
    emitBlock(lines, block, /* indent */ 2);
  }
  lines.push('\t]');
  lines.push('}');

  if (form.manifestSource && form.manifestSource.trim()) {
    lines.push('');
    lines.push(form.manifestSource.trimEnd());
  }

  lines.push(''); // trailing newline
  return lines.join('\n');
}

// ── Internals: block / variant emitters ─────────────────────────────

const EMPTY_SKIP = new Set<string>();
const BLOCK_SCHEMA_FORM_KEYS = new Set([
  'id_prefix',
  'mode',
  'role',
  'category',
  'text_template',
  'variants',
]);
const PACK_BLOCK_FORM_KEYS = new Set(['id', 'group', 'block_schema']);
const VARIANT_FORM_KEYS = new Set(['key', 'text']);

function emitBlock(lines: string[], block: BlockForm, indent: number): void {
  const ind = '\t'.repeat(indent);
  lines.push(`${ind}{`);
  lines.push(`${ind}\tid: ${cueString(block.id)}`);
  if (block.group) {
    lines.push(`${ind}\tgroup: ${cueString(block.group)}`);
  }
  // Block-level extras that live on #PackBlock (not #BlockSchema):
  // `defaults` and any unknown top-level keys. They're stored under
  // the reserved key '__pack_block_extras__' so they can be emitted
  // before block_schema.
  const packBlockExtras = (block.extras['__pack_block_extras__'] as CueLiteralBag) ?? {};
  emitExtras(lines, packBlockExtras, indent + 1, PACK_BLOCK_FORM_KEYS);

  lines.push(`${ind}\tblock_schema: {`);
  lines.push(`${ind}\t\tid_prefix: ${cueString(block.idPrefix)}`);
  if (block.mode && block.mode !== 'surface') {
    lines.push(`${ind}\t\tmode: ${cueString(block.mode)}`);
  }
  if (block.role) {
    lines.push(`${ind}\t\trole: ${cueString(block.role)}`);
  }
  if (block.category) {
    lines.push(`${ind}\t\tcategory: ${cueString(block.category)}`);
  }
  if (block.textTemplate) {
    lines.push(`${ind}\t\ttext_template: ${cueString(block.textTemplate)}`);
  }

  // Block-schema-level extras (capabilities, tags, descriptors, op, etc.)
  const blockSchemaExtras: CueLiteralBag = { ...block.extras };
  delete blockSchemaExtras['__pack_block_extras__'];
  emitExtras(lines, blockSchemaExtras, indent + 2, BLOCK_SCHEMA_FORM_KEYS);

  lines.push(`${ind}\t\tvariants: [`);
  for (const variant of block.variants) {
    emitVariant(lines, variant, indent + 3);
  }
  lines.push(`${ind}\t\t]`);
  lines.push(`${ind}\t}`);
  lines.push(`${ind}},`);
}

function emitVariant(lines: string[], variant: VariantForm, indent: number): void {
  const ind = '\t'.repeat(indent);
  // Compact form when the variant only has key (+optional text) and no extras.
  const hasExtras = Object.keys(variant.extras ?? {}).length > 0;
  if (!hasExtras && !variant.text) {
    lines.push(`${ind}{key: ${cueString(variant.key)}},`);
    return;
  }
  if (!hasExtras && variant.text) {
    lines.push(
      `${ind}{key: ${cueString(variant.key)}, text: ${cueString(variant.text)}},`,
    );
    return;
  }
  lines.push(`${ind}{`);
  lines.push(`${ind}\tkey: ${cueString(variant.key)}`);
  if (variant.text) {
    lines.push(`${ind}\ttext: ${cueString(variant.text)}`);
  }
  emitExtras(lines, variant.extras, indent + 1, VARIANT_FORM_KEYS);
  lines.push(`${ind}},`);
}

function emitExtras(
  lines: string[],
  extras: CueLiteralBag,
  indent: number,
  skipKeys: Set<string>,
): void {
  const ind = '\t'.repeat(indent);
  for (const [key, raw] of Object.entries(extras)) {
    if (skipKeys.has(key)) continue;
    if (raw === undefined || raw === null) continue;
    const rendered = cueLiteral(raw, indent);
    if (rendered.includes('\n')) {
      lines.push(`${ind}${cueKey(key)}: ${rendered}`);
    } else {
      lines.push(`${ind}${cueKey(key)}: ${rendered}`);
    }
  }
}

// ── JSON → CUE literal serializer ────────────────────────────────────

/**
 * Render an arbitrary JSON-compatible value as a CUE literal.
 * Nested objects/arrays are rendered multi-line; primitives inline.
 *
 * Indent is the current nesting depth (number of leading tabs) for
 * the line on which the value will start. Continuation lines for
 * multi-line values are indented one level deeper.
 */
export function cueLiteral(value: unknown, indent: number): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return cueString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allPrimitive = value.every(
      (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v),
    );
    if (allPrimitive) {
      return `[${value.map((v) => cueLiteral(v, indent)).join(', ')}]`;
    }
    const ind = '\t'.repeat(indent);
    const items = value.map(
      (v) => `${ind}\t${cueLiteral(v, indent + 1)}`,
    );
    return `[\n${items.join(',\n')},\n${ind}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) return '{}';
    const ind = '\t'.repeat(indent);
    const rendered = entries.map(
      ([k, v]) => `${ind}\t${cueKey(k)}: ${cueLiteral(v, indent + 1)}`,
    );
    return `{\n${rendered.join('\n')}\n${ind}}`;
  }
  // Fallback: stringify
  return cueString(String(value));
}

/**
 * Render a string as a CUE string literal. Uses the `"""..."""`
 * form for multi-line text so it's readable in the source.
 */
export function cueString(value: string): string {
  if (value.includes('\n')) {
    // CUE multi-line string literal: """ on its own line, content,
    // closing """ on its own line. Backslashes and quotes inside are
    // not escaped — multi-line strings are largely literal in CUE.
    const lines = value.split('\n');
    return `"""\n${lines.join('\n')}\n"""`;
  }
  // Escape backslashes, quotes, control chars.
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
  return `"${escaped}"`;
}

/**
 * Render a map key. CUE allows bare identifiers matching
 * `[a-zA-Z_][a-zA-Z0-9_]*` — otherwise we quote.
 */
export function cueKey(key: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) return key;
  return cueString(key);
}
