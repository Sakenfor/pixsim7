import type { BlockMatrixQuery, ContentPackMatrixManifest } from '@lib/api/blockTemplates';

export interface BlockMatrixPreset {
  id?: string;
  label: string;
  description?: string;
  query: Partial<BlockMatrixQuery>;
  source?: 'builtin' | 'template' | 'pack' | 'context';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePresetQuery(value: unknown): Partial<BlockMatrixQuery> | null {
  if (!isRecord(value)) return null;
  const out: Partial<BlockMatrixQuery> = {};

  const strFields: Array<keyof BlockMatrixQuery> = [
    'row_key',
    'col_key',
    'composition_role',
    'role',
    'category',
    'kind',
    'package_name',
    'q',
    'tags',
    'missing_label',
    'expected_row_values',
    'expected_col_values',
  ];
  for (const key of strFields) {
    const v = value[key];
    if (typeof v === 'string') {
      (out as Record<string, unknown>)[key] = v;
    }
  }

  const numFields: Array<keyof BlockMatrixQuery> = ['limit', 'sample_per_cell'];
  for (const key of numFields) {
    const v = value[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      (out as Record<string, unknown>)[key] = v;
    }
  }

  if (typeof value.include_empty === 'boolean') out.include_empty = value.include_empty;

  return Object.keys(out).length > 0 ? out : null;
}

export const DEFAULT_BLOCK_MATRIX_PRESETS: BlockMatrixPreset[] = [
  {
    id: 'role-category',
    source: 'builtin',
    label: 'Role x Category',
    description: 'Overview of all blocks by composition role and category',
    query: {
      row_key: 'composition_role',
      col_key: 'category',
      include_empty: false,
    },
  },
  {
    id: 'package-role',
    source: 'builtin',
    label: 'Package x Role',
    description: 'Block distribution across packages and composition roles',
    query: {
      row_key: 'package_name',
      col_key: 'composition_role',
      include_empty: false,
    },
  },
  {
    id: 'op-signature',
    source: 'builtin',
    label: 'Op x Signature',
    description: 'Operational coverage by concrete op_id and signature contract',
    query: {
      row_key: 'op_id',
      col_key: 'signature_id',
      include_empty: false,
    },
  },
  {
    id: 'signature-category',
    source: 'builtin',
    label: 'Signature x Category',
    description: 'Which categories implement each op signature',
    query: {
      row_key: 'signature_id',
      col_key: 'category',
      include_empty: false,
    },
  },
  {
    id: 'pose-lock-coverage',
    source: 'builtin',
    label: 'Pose Lock Coverage',
    description: 'Pose lock blocks by rigidity and approach',
    query: {
      row_key: 'tag:rigidity',
      col_key: 'tag:approach',
      package_name: 'shared',
      composition_role: 'entities:subject',
      category: 'pose_lock',
      include_empty: true,
      expected_row_values: 'minimal,low,medium,high,maximum',
      expected_col_values: 'skeletal,contour,gravity,i2v',
    },
  },
  {
    id: 'pov-progression',
    source: 'builtin',
    label: 'POV Progression',
    description: 'POV approach response blocks by beat axis and response mode',
    query: {
      row_key: 'tag:beat_axis',
      col_key: 'tag:response_mode',
      tags: 'sequence_family:pov_approach_response',
      include_empty: true,
    },
  },
];

export function readTemplateMatrixPresets(templateMetadata: unknown): BlockMatrixPreset[] {
  if (!isRecord(templateMetadata)) return [];
  const raw = templateMetadata.matrix_presets;
  if (!Array.isArray(raw)) return [];

  const presets: BlockMatrixPreset[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!isRecord(item)) continue;
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!label) continue;
    const query = parsePresetQuery(item.query);
    if (!query || !query.row_key || !query.col_key) continue;
    presets.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `template-${i}`,
      label,
      description: typeof item.description === 'string' ? item.description : undefined,
      query,
      source: 'template',
    });
  }
  return presets;
}

export function readContentPackMatrixPresets(
  manifests: readonly ContentPackMatrixManifest[],
  options: { packName?: string | null } = {},
): BlockMatrixPreset[] {
  const packFilter = typeof options.packName === 'string' && options.packName.trim()
    ? options.packName.trim()
    : null;
  const presets: BlockMatrixPreset[] = [];

  for (const manifest of manifests) {
    if (packFilter && manifest.pack_name !== packFilter) continue;
    const sourcePath = manifest.source || 'manifest';
    for (let i = 0; i < (manifest.matrix_presets ?? []).length; i += 1) {
      const item = manifest.matrix_presets[i];
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      if (!label) continue;
      const query = parsePresetQuery(item.query);
      if (!query || !query.row_key || !query.col_key) continue;
      presets.push({
        id: `${manifest.pack_name}:${sourcePath}:${i}:${label.toLowerCase().replace(/\s+/g, '-')}`,
        label: `${manifest.pack_name} · ${label}`,
        description:
          typeof manifest.description === 'string' && manifest.description.trim()
            ? manifest.description.trim()
            : undefined,
        query,
        source: 'pack',
      });
    }
  }

  return presets;
}

export function mergeBlockMatrixPresets(
  ...presetGroups: Array<readonly BlockMatrixPreset[] | undefined>
): BlockMatrixPreset[] {
  const merged: BlockMatrixPreset[] = [];
  const seen = new Set<string>();

  for (const group of presetGroups) {
    if (!group) continue;
    for (const preset of group) {
      const key = preset.id?.trim() || preset.label.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(preset);
    }
  }

  return merged;
}
