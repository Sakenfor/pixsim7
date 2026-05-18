import { describe, expect, it } from 'vitest';

import { compiledToForm } from '../compiledToForm';
import { generateCueSource, cueLiteral, cueString } from '../cueGenerator';
import { detectCueRefs } from '../cueRefs';
import { extractManifestSection } from '../manifestExtractor';
import type { PackForm } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────

function basePack(overrides: Partial<PackForm> = {}): PackForm {
  return {
    packageName: 'my_pack',
    version: '1.0.0',
    extras: {},
    blocks: [],
    manifestSource: null,
    ...overrides,
  };
}

// ── cueString / cueLiteral ──────────────────────────────────────────

describe('cueString', () => {
  it('escapes quotes and backslashes', () => {
    expect(cueString('hello "world"')).toBe('"hello \\"world\\""');
    expect(cueString('back\\slash')).toBe('"back\\\\slash"');
  });

  it('uses triple-quoted form for multi-line strings', () => {
    expect(cueString('one\ntwo')).toBe('"""\none\ntwo\n"""');
  });
});

describe('cueLiteral', () => {
  it('serializes primitives', () => {
    expect(cueLiteral('a', 0)).toBe('"a"');
    expect(cueLiteral(42, 0)).toBe('42');
    expect(cueLiteral(true, 0)).toBe('true');
    expect(cueLiteral(null, 0)).toBe('null');
  });

  it('inlines arrays of primitives', () => {
    expect(cueLiteral(['a', 'b', 1], 0)).toBe('["a", "b", 1]');
  });

  it('renders nested objects multi-line', () => {
    const out = cueLiteral({ a: 1, b: { c: 2 } }, 0);
    expect(out).toContain('a: 1');
    expect(out).toContain('b: {');
    expect(out).toContain('c: 2');
  });

  it('omits undefined values from objects', () => {
    const out = cueLiteral({ a: 1, b: undefined }, 0);
    expect(out).toContain('a: 1');
    expect(out).not.toContain('b:');
  });
});

// ── generateCueSource ───────────────────────────────────────────────

describe('generateCueSource', () => {
  it('emits a minimal pack with no blocks', () => {
    const out = generateCueSource(basePack());
    expect(out).toContain('package promptpacks');
    expect(out).toContain('pack: #PromptBlockPackV1 & {');
    expect(out).toContain('version:      "1.0.0"');
    expect(out).toContain('package_name: "my_pack"');
    expect(out).toContain('blocks: [');
  });

  it('emits a simple text block with variants', () => {
    const out = generateCueSource(
      basePack({
        blocks: [
          {
            id: 'greet',
            idPrefix: 'my_pack.greet',
            role: 'subject',
            category: 'example',
            textTemplate: 'Hi, {variant}!',
            variants: [
              { key: 'world', extras: {} },
              { key: 'friend', text: 'Hi, friend.', extras: {} },
            ],
            extras: {},
          },
        ],
      }),
    );
    expect(out).toContain('id: "greet"');
    expect(out).toContain('id_prefix: "my_pack.greet"');
    expect(out).toContain('role: "subject"');
    expect(out).toContain('text_template: "Hi, {variant}!"');
    expect(out).toContain('{key: "world"}');
    expect(out).toContain('{key: "friend", text: "Hi, friend."}');
  });

  it('skips default surface mode and emits non-default modes', () => {
    const surfaceOut = generateCueSource(
      basePack({
        blocks: [
          {
            id: 'a',
            idPrefix: 'p.a',
            mode: 'surface',
            variants: [{ key: 'x', extras: {} }],
            extras: {},
          },
        ],
      }),
    );
    expect(surfaceOut).not.toContain('mode:');
    const opOut = generateCueSource(
      basePack({
        blocks: [
          {
            id: 'a',
            idPrefix: 'p.a',
            mode: 'op',
            variants: [{ key: 'x', extras: {} }],
            extras: {},
          },
        ],
      }),
    );
    expect(opOut).toContain('mode: "op"');
  });

  it('preserves opaque extras (op, capabilities, tags) in block_schema', () => {
    const out = generateCueSource(
      basePack({
        blocks: [
          {
            id: 'angle',
            idPrefix: 'core.camera.angle',
            category: 'camera',
            variants: [{ key: 'eye_level', extras: { op_args: { vertical_angle: 'eye' } } }],
            extras: {
              capabilities: ['camera.angle'],
              tags: { modifier_family: 'angle' },
              op: { op_id: 'camera.angle.set' },
            },
          },
        ],
      }),
    );
    expect(out).toContain('capabilities: ["camera.angle"]');
    expect(out).toContain('modifier_family: "angle"');
    expect(out).toContain('op_id: "camera.angle.set"');
    expect(out).toContain('op_args: {');
    expect(out).toContain('vertical_angle: "eye"');
  });

  it('appends manifest source verbatim', () => {
    const manifest = `manifest: #PromptPackManifestV1 & {
\tid: "x"
\tmatrix_presets: []
}`;
    const out = generateCueSource(basePack({ manifestSource: manifest }));
    expect(out).toContain(manifest);
    expect(out.lastIndexOf('manifest:')).toBeGreaterThan(out.indexOf('pack:'));
  });

  it('round-trips compiled JSON through form → CUE → form (lossless on basics)', () => {
    const sourceWithManifest = `package promptpacks

pack: #PromptBlockPackV1 & {
\tversion:      "1.0.0"
\tpackage_name: "round_trip"
\tblocks: [
\t\t{
\t\t\tid: "g"
\t\t\tblock_schema: {
\t\t\t\tid_prefix: "round_trip.g"
\t\t\t\trole:      "subject"
\t\t\t\tcategory:  "example"
\t\t\t\tvariants: [
\t\t\t\t\t{key: "a", text: "First"},
\t\t\t\t\t{key: "b", text: "Second"},
\t\t\t\t]
\t\t\t}
\t\t},
\t]
}

manifest: #PromptPackManifestV1 & {
\tid: "round-trip"
\tmatrix_presets: []
}
`;
    const compiled = {
      version: '1.0.0',
      package_name: 'round_trip',
      blocks: [
        {
          id: 'g',
          block_schema: {
            id_prefix: 'round_trip.g',
            role: 'subject',
            category: 'example',
            variants: [
              { key: 'a', text: 'First' },
              { key: 'b', text: 'Second' },
            ],
          },
        },
      ],
    };
    const form = compiledToForm(compiled, sourceWithManifest);
    expect(form.packageName).toBe('round_trip');
    expect(form.blocks).toHaveLength(1);
    expect(form.blocks[0].id).toBe('g');
    expect(form.blocks[0].role).toBe('subject');
    expect(form.blocks[0].variants).toHaveLength(2);
    expect(form.manifestSource).toContain('matrix_presets: []');

    const regenerated = generateCueSource(form);
    // Re-parse what we just emitted via the same compiled-shape adaptor.
    const reform = compiledToForm(compiled, regenerated);
    expect(reform.packageName).toBe(form.packageName);
    expect(reform.blocks[0].id).toBe(form.blocks[0].id);
    expect(reform.blocks[0].variants.map((v) => v.key)).toEqual(['a', 'b']);
    // Manifest preserved through regen.
    expect(reform.manifestSource).toContain('matrix_presets: []');
  });
});

// ── manifestExtractor ───────────────────────────────────────────────

describe('extractManifestSection', () => {
  it('extracts manifest from canonical source', () => {
    const source = `package promptpacks

pack: #PromptBlockPackV1 & {
\tpackage_name: "x"
\tblocks: []
}

manifest: #PromptPackManifestV1 & {
\tid: "x"
\tmatrix_presets: []
}
`;
    const extracted = extractManifestSection(source);
    expect(extracted).not.toBeNull();
    expect(extracted!.text).toContain('manifest:');
    expect(extracted!.text).toContain('matrix_presets:');
    expect(extracted!.range[0]).toBe(8);
  });

  it('returns null when no manifest section exists', () => {
    expect(extractManifestSection('package promptpacks\n\npack: {}\n')).toBeNull();
  });

  it('stops at the next top-level expression', () => {
    const source = `manifest: {
\tid: "a"
}

other: {
\tid: "b"
}
`;
    const extracted = extractManifestSection(source);
    expect(extracted).not.toBeNull();
    expect(extracted!.text).not.toContain('other:');
    expect(extracted!.text).toContain('id: "a"');
  });
});

// ── detectCueRefs ───────────────────────────────────────────────────

describe('detectCueRefs', () => {
  it('flags enum value refs', () => {
    const { refs, lines } = detectCueRefs(`
\tparams: [
\t\t{type: "enum", enum: #VerticalAngleValues}
\t]
`);
    expect(refs).toContain('#VerticalAngleValues');
    expect(lines).toContain(3);
  });

  it('ignores schema-definition refs used as constraints', () => {
    const { refs } = detectCueRefs(`pack: #PromptBlockPackV1 & {}\nmanifest: #PromptPackManifestV1 & {}`);
    expect(refs).toEqual([]);
  });

  it('returns empty for plain source', () => {
    const { refs, lines } = detectCueRefs(`pack: {package_name: "x", blocks: []}`);
    expect(refs).toEqual([]);
    expect(lines).toEqual([]);
  });
});
