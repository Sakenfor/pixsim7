/**
 * BlockMatrixPanel - Standalone panel wrapper for BlockMatrixView.
 *
 * Provides full controls for exploring block coverage matrices.
 * Can also receive initial context from panel open calls.
 */
import { useMemo } from 'react';

import { BlockMatrixView, type BlockMatrixPreset, type BlockMatrixViewProps } from './BlockMatrixView';

// ── Default presets ────────────────────────────────────────────────────────

const DEFAULT_PRESETS: BlockMatrixPreset[] = [
  {
    label: 'Role x Category',
    description: 'Overview of all blocks by role and category',
    query: {
      row_key: 'role',
      col_key: 'category',
      include_empty: false,
    },
  },
  {
    label: 'Package x Role',
    description: 'Block distribution across packages and roles',
    query: {
      row_key: 'package_name',
      col_key: 'role',
      include_empty: false,
    },
  },
  {
    label: 'Pose Lock Coverage',
    description: 'Pose lock blocks by rigidity and approach',
    query: {
      row_key: 'tag:rigidity',
      col_key: 'tag:approach',
      package_name: 'shared',
      role: 'subject',
      category: 'pose_lock',
      include_empty: true,
      expected_row_values: 'minimal,low,medium,high,maximum',
      expected_col_values: 'skeletal,contour,gravity,i2v',
    },
  },
  {
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

// ── Component ──────────────────────────────────────────────────────────────

interface BlockMatrixPanelProps {
  context?: Record<string, unknown>;
}

export function BlockMatrixPanel({ context }: BlockMatrixPanelProps) {
  const initialQuery = useMemo((): BlockMatrixViewProps['initialQuery'] => {
    if (!context) return undefined;
    const q: BlockMatrixViewProps['initialQuery'] = {};
    if (typeof context.row_key === 'string') q.row_key = context.row_key;
    if (typeof context.col_key === 'string') q.col_key = context.col_key;
    if (typeof context.package_name === 'string') q.package_name = context.package_name;
    if (typeof context.role === 'string') q.role = context.role;
    if (typeof context.category === 'string') q.category = context.category;
    if (typeof context.tags === 'string') q.tags = context.tags;
    return Object.keys(q).length > 0 ? q : undefined;
  }, [context]);

  return (
    <BlockMatrixView
      initialQuery={initialQuery}
      presets={DEFAULT_PRESETS}
    />
  );
}
